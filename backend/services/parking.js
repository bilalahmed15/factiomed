import { db, withTransaction } from '../config/database.js';
import { randomUUID } from 'crypto';

const HOLD_EXPIRY_MINUTES = 5;

// Initialize parking slots
export function initializeParkingSlots(spots = ['P1', 'P2', 'P3', 'P4', 'P5'], zone = 'Main') {
  const slots = [];
  
  // Pre-fetch all existing slots for this zone to avoid repeated queries
  const allExistingSlots = db.prepare('SELECT * FROM parking_slots WHERE zone = ?').all(zone);
  const existingSlotsMap = new Map();
  
  // Build a map of existing slots by spot_identifier and date
  for (const slot of allExistingSlots) {
    const slotDate = slot.start_time?.split('T')[0] || new Date(slot.start_time).toISOString().split('T')[0];
    const key = `${slot.spot_identifier}_${slotDate}`;
    existingSlotsMap.set(key, slot);
  }
  
  for (const spotId of spots) {
    // Create slots for the next 30 days
    const startDate = new Date();
    
    for (let day = 0; day < 30; day++) {
      const slotDate = new Date(startDate);
      slotDate.setDate(slotDate.getDate() + day);
      slotDate.setHours(0, 0, 0, 0);
      
      const startTime = slotDate.toISOString();
      const dateStr = slotDate.toISOString().split('T')[0];
      const key = `${spotId}_${dateStr}`;
      
      // Check if slot already exists using the map
      if (existingSlotsMap.has(key)) {
        // Slot already exists, skip
        continue;
      }
      
      const slotId = randomUUID();
      const endTime = new Date(slotDate.getTime() + 24 * 60 * 60 * 1000).toISOString();
      
      db.prepare(`
        INSERT INTO parking_slots (id, spot_identifier, zone, start_time, end_time, status)
        VALUES (?, ?, ?, ?, ?, 'free')
      `).run(slotId, spotId, zone, startTime, endTime);
      
      slots.push({ id: slotId, spot: spotId, date: startTime });
      
      // Add to map to avoid duplicates in the same batch
      existingSlotsMap.set(key, { id: slotId, spot_identifier: spotId, start_time: startTime });
    }
  }
  
  return slots;
}

// Get available parking slots
export function getAvailableParkingSlots(filters = {}) {
  const now = new Date().toISOString();
  const today = new Date().toISOString().split('T')[0];
  
  // Build query efficiently - filter by date in the query when possible
  let query = `
    SELECT * FROM parking_slots 
    WHERE status = 'free' 
    AND (hold_expiry IS NULL OR hold_expiry < ?)
  `;
  const params = [now];
  
  // If filtering by specific date, add date filter to query
  if (filters.date) {
    const filterDate = filters.date.split('T')[0] || new Date(filters.date).toISOString().split('T')[0];
    // Filter by date range (start of day to end of day)
    const startOfDay = `${filterDate}T00:00:00.000Z`;
    const endOfDay = `${filterDate}T23:59:59.999Z`;
    query += ' AND start_time >= ? AND start_time <= ?';
    params.push(startOfDay, endOfDay);
  } else {
    // If no date filter, show slots for today and future dates
    query += ' AND start_time >= ?';
    params.push(today);
  }
  
  if (filters.zone) {
    query += ' AND zone = ?';
    params.push(filters.zone);
  }
  
  query += ' ORDER BY spot_identifier, start_time LIMIT 20';
  
  let allSlots = db.prepare(query).all(...params);
  
  // Ensure we only return unique spot_identifiers per date (in case duplicates were created)
  if (filters.date) {
    const uniqueSlots = [];
    const seenSpots = new Set();
    
    for (const slot of allSlots) {
      const spotKey = `${slot.spot_identifier}_${slot.zone}`;
      if (!seenSpots.has(spotKey)) {
        seenSpots.add(spotKey);
        uniqueSlots.push(slot);
      }
    }
    
    return uniqueSlots;
  }
  
  // For non-date-filtered queries, also deduplicate by date
  const uniqueSlots = [];
  const seenSpots = new Map(); // Map of spot_key -> slot
  
  for (const slot of allSlots) {
    const slotDate = slot.start_time?.split('T')[0] || new Date(slot.start_time).toISOString().split('T')[0];
    const spotKey = `${slot.spot_identifier}_${slot.zone}_${slotDate}`;
    
    // Keep only the first occurrence of each spot+date combination
    if (!seenSpots.has(spotKey)) {
      seenSpots.set(spotKey, slot);
      uniqueSlots.push(slot);
    }
  }
  
  return uniqueSlots;
}

// Hold parking slot
export function holdParkingSlot(slotId, sessionId) {
  return withTransaction(() => {
    const slot = db.prepare('SELECT * FROM parking_slots WHERE id = ?').get(slotId);
    
    if (!slot) {
      throw new Error('Parking slot not found');
    }
    
    const now = new Date().toISOString();
    
    console.log('Holding parking slot:', {
      slotId,
      sessionId,
      currentStatus: slot.status,
      currentHeldBy: slot.held_by,
      currentHoldExpiry: slot.hold_expiry
    });
    
    if (slot.status !== 'free' || (slot.hold_expiry && slot.hold_expiry > now)) {
      throw new Error('Parking slot is not available');
    }
    
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + HOLD_EXPIRY_MINUTES);
    
    const result = db.prepare(`
      UPDATE parking_slots 
      SET status = 'held', held_by = ?, hold_expiry = ?, updated_at = ?
      WHERE id = ?
    `).run(sessionId, expiry.toISOString(), now, slotId);
    
    console.log('Update result:', result);
    
    // Verify the hold was successful
    const updatedSlot = db.prepare('SELECT * FROM parking_slots WHERE id = ?').get(slotId);
    console.log('Parking slot after hold:', {
      slotId,
      status: updatedSlot.status,
      held_by: updatedSlot.held_by,
      hold_expiry: updatedSlot.hold_expiry,
      sessionId
    });
    
    if (updatedSlot.status !== 'held' || updatedSlot.held_by !== sessionId) {
      console.error('Hold failed - slot not updated correctly');
      throw new Error('Failed to hold parking slot');
    }
    
    return {
      slotId,
      spotIdentifier: slot.spot_identifier,
      zone: slot.zone,
      holdExpiry: expiry.toISOString(),
      minutesRemaining: HOLD_EXPIRY_MINUTES
    };
  });
}

// Confirm parking reservation
export function confirmParkingReservation(slotId, sessionId, patientData) {
  return withTransaction(() => {
    const slot = db.prepare('SELECT * FROM parking_slots WHERE id = ?').get(slotId);
    
    if (!slot) {
      throw new Error('Parking slot not found');
    }
    
    const now = new Date().toISOString();
    
    console.log('Confirm parking reservation check:', {
      slotId,
      providedSessionId: sessionId,
      slotStatus: slot.status,
      slotHeldBy: slot.held_by,
      holdExpiry: slot.hold_expiry,
      now
    });
    
    // If slot is free but was previously held by this session (expired hold), re-hold it
    // Or if slot is free and available, we can proceed directly (more forgiving)
    if (slot.status === 'free') {
      // Check if slot is actually available (not reserved)
      if (slot.reserved_by) {
        throw new Error('Parking slot is already reserved');
      }
      
      if (slot.held_by === sessionId) {
        console.log('Slot was held by this session but expired, re-holding...');
      } else {
        console.log('Slot is free, holding it now before confirming...');
      }
      
      const expiry = new Date();
      expiry.setMinutes(expiry.getMinutes() + HOLD_EXPIRY_MINUTES);
      
      db.prepare(`
        UPDATE parking_slots 
        SET status = 'held', held_by = ?, hold_expiry = ?, updated_at = ?
        WHERE id = ?
      `).run(sessionId, expiry.toISOString(), now, slotId);
      
      // Re-fetch to verify
      const reheldSlot = db.prepare('SELECT * FROM parking_slots WHERE id = ?').get(slotId);
      if (reheldSlot.status !== 'held') {
        throw new Error('Failed to hold parking slot for confirmation');
      }
      slot.status = 'held';
      slot.held_by = sessionId;
      slot.hold_expiry = expiry.toISOString();
    } else if (slot.status === 'reserved') {
      throw new Error('Parking slot is already reserved');
    }
    
    if (slot.status !== 'held') {
      throw new Error(`Parking slot is not held (status: ${slot.status})`);
    }
    
    if (slot.held_by !== sessionId) {
      console.error('Session ID mismatch:', {
        expected: slot.held_by,
        provided: sessionId,
        match: slot.held_by === sessionId
      });
      throw new Error('Parking slot is not held by this session');
    }
    
    if (slot.hold_expiry && slot.hold_expiry < now) {
      throw new Error('Hold has expired');
    }
    
    // Update slot to reserved
    db.prepare(`
      UPDATE parking_slots 
      SET status = 'reserved', reserved_by = ?, updated_at = ?
      WHERE id = ?
    `).run(sessionId, now, slotId);
    
    // Create reservation record
    const reservationId = randomUUID();
    db.prepare(`
      INSERT INTO parking_reservations 
      (id, slot_id, patient_name, patient_phone, patient_email, appointment_reference_number, status)
      VALUES (?, ?, ?, ?, ?, ?, 'confirmed')
    `).run(
      reservationId,
      slotId,
      patientData.name,
      patientData.phone,
      patientData.email,
      patientData.appointmentReferenceNumber || null
    );
    
    // Log audit
    db.prepare(`
      INSERT INTO audit_logs (id, action_type, entity_type, entity_id, session_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      'parking_reservation_confirmed',
      'parking_reservation',
      reservationId,
      sessionId,
      JSON.stringify(patientData)
    );
    
    return {
      reservationId,
      slotId,
      spotIdentifier: slot.spot_identifier,
      zone: slot.zone,
      status: 'confirmed'
    };
  });
}

// Cleanup expired parking holds
export function cleanupExpiredParkingHolds() {
  const now = new Date().toISOString();
  
  const expired = db.prepare(`
    SELECT id FROM parking_slots 
    WHERE status = 'held' AND hold_expiry < ?
  `).all(now);
  
  for (const slot of expired) {
    db.prepare(`
      UPDATE parking_slots 
      SET status = 'free', held_by = NULL, hold_expiry = NULL, updated_at = ?
      WHERE id = ?
    `).run(now, slot.id);
  }
  
  return expired.length;
}

