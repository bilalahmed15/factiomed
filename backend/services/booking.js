import { db, withTransaction } from '../config/database.js';
import { randomUUID } from 'crypto';

const HOLD_EXPIRY_MINUTES = 5;

// Create appointment slots (example data - in production, this would come from a scheduling system)
export function createAppointmentSlots(providerName, serviceType, startDate, endDate, slotDurationMinutes = 30) {
  const slots = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Generate slots for business hours (9 AM - 5 PM)
  const current = new Date(start);
  
  while (current < end) {
    const dayOfWeek = current.getDay();
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const slotStart = new Date(current);
      slotStart.setHours(9, 0, 0, 0);
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + slotDurationMinutes);
      
      while (slotStart.getHours() < 17 && slotEnd <= new Date(current.getTime() + 24 * 60 * 60 * 1000)) {
        const slotId = randomUUID();
        
        db.prepare(`
          INSERT INTO appointment_slots (id, provider_name, service_type, start_time, end_time, status)
          VALUES (?, ?, ?, ?, ?, 'free')
          ON CONFLICT(id) DO NOTHING
        `).run(
          slotId,
          providerName,
          serviceType,
          slotStart.toISOString(),
          slotEnd.toISOString()
        );
        
        slots.push({ id: slotId, start: slotStart.toISOString(), end: slotEnd.toISOString() });
        
        slotStart.setMinutes(slotStart.getMinutes() + slotDurationMinutes);
        slotEnd.setMinutes(slotEnd.getMinutes() + slotDurationMinutes);
      }
    }
    
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }
  
  return slots;
}

// Get available slots
export function getAvailableSlots(filters = {}) {
  const now = new Date().toISOString();
  
  let query = `
    SELECT * FROM appointment_slots 
    WHERE status = 'free' 
    AND start_time > ?
    AND (hold_expiry IS NULL OR hold_expiry < ?)
  `;
  const params = [now, now];
  
  if (filters.provider_name) {
    query += ' AND provider_name = ?';
    params.push(filters.provider_name);
  }
  
  if (filters.service_type) {
    query += ' AND service_type = ?';
    params.push(filters.service_type);
  }
  
  if (filters.date_from) {
    query += ' AND DATE(start_time) >= ?';
    params.push(filters.date_from);
  }
  
  if (filters.date_to) {
    query += ' AND DATE(start_time) <= ?';
    params.push(filters.date_to);
  }
  
  query += ' ORDER BY start_time LIMIT 50';
  
  const results = db.prepare(query).all(...params);
  return results || [];
}

// Hold a slot (atomic transaction)
export function holdSlot(slotId, sessionId) {
  return withTransaction(() => {
    // Use SELECT ... FOR UPDATE equivalent by checking and updating in transaction
    const slot = db.prepare('SELECT * FROM appointment_slots WHERE id = ?').get(slotId);
    
    if (!slot) {
      throw new Error('Slot not found');
    }
    
    const now = new Date().toISOString();
    
    if (slot.status !== 'free' || (slot.hold_expiry && slot.hold_expiry > now)) {
      throw new Error('Slot is not available');
    }
    
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + HOLD_EXPIRY_MINUTES);
    
    console.log('Holding slot:', {
      slotId,
      sessionId,
      expiry: expiry.toISOString()
    });
    
    const result = db.prepare(`
      UPDATE appointment_slots 
      SET status = 'held', held_by = ?, hold_expiry = ?, updated_at = ?
      WHERE id = ?
    `).run(sessionId, expiry.toISOString(), now, slotId);
    
    // Verify the hold was successful
    const updatedSlot = db.prepare('SELECT * FROM appointment_slots WHERE id = ?').get(slotId);
    console.log('Slot after hold:', {
      slotId,
      status: updatedSlot.status,
      held_by: updatedSlot.held_by,
      sessionId
    });
    
    return {
      slotId,
      holdExpiry: expiry.toISOString(),
      minutesRemaining: HOLD_EXPIRY_MINUTES
    };
  });
}

// Confirm reservation (convert hold to reserved)
export function confirmReservation(slotId, sessionId, patientData) {
  return withTransaction(() => {
    const slot = db.prepare('SELECT * FROM appointment_slots WHERE id = ?').get(slotId);
    
    if (!slot) {
      throw new Error('Slot not found');
    }
    
    const now = new Date().toISOString();
    
    console.log('Confirm reservation check:', {
      slotId,
      providedSessionId: sessionId,
      slotStatus: slot.status,
      slotHeldBy: slot.held_by,
      holdExpiry: slot.hold_expiry,
      now
    });
    
    if (slot.status !== 'held') {
      throw new Error(`Slot is not held (status: ${slot.status})`);
    }
    
    if (slot.held_by !== sessionId) {
      console.error('Session ID mismatch:', {
        expected: slot.held_by,
        provided: sessionId,
        match: slot.held_by === sessionId
      });
      throw new Error('Slot is not held by this session');
    }
    
    if (slot.hold_expiry && slot.hold_expiry < now) {
      throw new Error('Hold has expired');
    }
    
    // Update slot to reserved
    db.prepare(`
      UPDATE appointment_slots 
      SET status = 'reserved', reserved_by = ?, updated_at = ?
      WHERE id = ?
    `).run(sessionId, now, slotId);
    
    // Create reservation record
    const reservationId = randomUUID();
    db.prepare(`
      INSERT INTO reservations 
      (id, slot_id, reservation_type, patient_name, patient_dob, patient_phone, 
       patient_email, reason_for_visit, insurance_details, status)
      VALUES (?, ?, 'appointment', ?, ?, ?, ?, ?, ?, 'confirmed')
    `).run(
      reservationId,
      slotId,
      patientData.name,
      patientData.dob,
      patientData.phone,
      patientData.email,
      patientData.reason,
      patientData.insurance
    );
    
    // Log audit
    db.prepare(`
      INSERT INTO audit_logs (id, action_type, entity_type, entity_id, session_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      'reservation_confirmed',
      'reservation',
      reservationId,
      sessionId,
      JSON.stringify(patientData)
    );
    
    return {
      reservationId,
      slotId,
      status: 'confirmed'
    };
  });
}

// Cancel reservation
export function cancelReservation(reservationId, sessionId) {
  return withTransaction(() => {
    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(reservationId);
    
    if (!reservation) {
      throw new Error('Reservation not found');
    }
    
    // Update reservation status
    db.prepare(`
      UPDATE reservations SET status = 'cancelled', updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), reservationId);
    
    // Free up the slot
    db.prepare(`
      UPDATE appointment_slots 
      SET status = 'free', held_by = NULL, reserved_by = NULL, hold_expiry = NULL, updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), reservation.slot_id);
    
    // Log audit
    db.prepare(`
      INSERT INTO audit_logs (id, action_type, entity_type, entity_id, session_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      'reservation_cancelled',
      'reservation',
      reservationId,
      sessionId,
      JSON.stringify({ reason: 'user_cancelled' })
    );
    
    return { success: true };
  });
}

// Clean up expired holds (background job)
export function cleanupExpiredHolds() {
  const now = new Date().toISOString();
  
  const expired = db.prepare(`
    SELECT id FROM appointment_slots 
    WHERE status = 'held' AND hold_expiry < ?
  `).all(now);
  
  for (const slot of expired) {
    db.prepare(`
      UPDATE appointment_slots 
      SET status = 'free', held_by = NULL, hold_expiry = NULL, updated_at = ?
      WHERE id = ?
    `).run(now, slot.id);
  }
  
  return expired.length;
}

