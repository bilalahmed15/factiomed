import { db } from '../config/database.js';

// Cleanup duplicate parking slots - keep only one per spot_identifier/zone/date
function cleanupDuplicateParkingSlots() {
  const allSlots = db.prepare('SELECT * FROM parking_slots ORDER BY spot_identifier, zone, start_time').all();
  
  const seen = new Map();
  let duplicatesRemoved = 0;
  
  for (const slot of allSlots) {
    const dateStr = slot.start_time.split('T')[0];
    const key = `${slot.spot_identifier}_${slot.zone}_${dateStr}`;
    
    if (seen.has(key)) {
      // This is a duplicate, remove it
      db.prepare('DELETE FROM parking_slots WHERE id = ?').run(slot.id);
      duplicatesRemoved++;
    } else {
      seen.set(key, slot);
    }
  }
  
  console.log(`Cleaned up ${duplicatesRemoved} duplicate parking slots`);
  return duplicatesRemoved;
}

cleanupDuplicateParkingSlots();

