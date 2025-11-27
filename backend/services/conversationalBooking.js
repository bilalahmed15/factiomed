import { db } from '../config/database.js';
import { getAvailableSlots } from './booking.js';
import { getDoctors, getServices } from './websiteData.js';
import * as bookingService from './booking.js';
import { randomUUID } from 'crypto';
import { openai } from './llm.js';

/**
 * Booking flow steps
 */
const BOOKING_STEPS = {
  INIT: 'init',
  NAME: 'name',
  DOB: 'dob',
  PHONE: 'phone',
  EMAIL: 'email',
  SERVICE: 'service',
  DOCTOR: 'doctor',
  DATE: 'date',
  TIME: 'time',
  CONFIRM: 'confirm',
  COMPLETED: 'completed'
};

/**
 * Get current booking state from session
 */
export function getBookingState(sessionId) {
  console.log('Getting booking state for session:', sessionId);
  
  // Try booking_states table first
  try {
    const state = db.prepare(`
      SELECT state 
      FROM booking_states 
      WHERE session_id = ? 
      ORDER BY updated_at DESC 
      LIMIT 1
    `).get(sessionId);
    
    if (state && state.state) {
      const parsed = JSON.parse(state.state);
      console.log('Found booking state from booking_states:', parsed);
      return parsed;
    }
  } catch (error) {
    // booking_states table might not exist, try chat_sessions
    console.log('booking_states table not found, trying chat_sessions');
  }
  
  // Fallback to chat_sessions - get the most recent session with booking_state
  try {
    const state = db.prepare(`
      SELECT booking_state 
      FROM chat_sessions 
      WHERE session_id = ? 
      AND booking_state IS NOT NULL
      AND booking_state != ''
      ORDER BY created_at DESC 
      LIMIT 1
    `).get(sessionId);
    
    if (state && state.booking_state) {
      const parsed = JSON.parse(state.booking_state);
      console.log('Found booking state from chat_sessions:', parsed);
      return parsed;
    }
  } catch (error) {
    console.log('Error reading booking state:', error);
  }
  
  console.log('No booking state found for session:', sessionId);
  return null;
}

/**
 * Save booking state to session
 */
export function saveBookingState(sessionId, state) {
  const stateJson = JSON.stringify(state);
  console.log('=== Saving booking state ===');
  console.log('Session ID:', sessionId);
  console.log('Step:', state.step);
  console.log('Data keys:', Object.keys(state.data || {}));
  console.log('Full state:', stateJson);
  
  // First, try to update the most recent session
  try {
    const result = db.prepare(`
      UPDATE chat_sessions 
      SET booking_state = ? 
      WHERE session_id = ? 
      AND id = (
        SELECT id FROM chat_sessions 
        WHERE session_id = ? 
        ORDER BY created_at DESC 
        LIMIT 1
      )
    `).run(stateJson, sessionId, sessionId);
    
    console.log('Updated booking state in chat_sessions, changes:', result.changes);
    
    // If no rows updated, insert new session record
    if (!result || result.changes === 0) {
      db.prepare(`
        INSERT INTO chat_sessions (id, session_id, booking_state, created_at)
        VALUES (?, ?, ?, ?)
      `).run(
        randomUUID(),
        sessionId,
        stateJson,
        new Date().toISOString()
      );
      console.log('Inserted new booking state in chat_sessions');
    }
  } catch (error) {
    console.log('Error updating booking state:', error);
    // Insert new session if update fails
    try {
      db.prepare(`
        INSERT INTO chat_sessions (id, session_id, booking_state, created_at)
        VALUES (?, ?, ?, ?)
      `).run(
        randomUUID(),
        sessionId,
        stateJson,
        new Date().toISOString()
      );
      console.log('Inserted booking state after error');
    } catch (insertError) {
      console.log('Error inserting booking state:', insertError);
    }
  }
  
  // Verify the save worked
  const verifyState = getBookingState(sessionId);
  if (verifyState && verifyState.step === state.step) {
    console.log('✅ Booking state saved successfully');
  } else {
    console.error('❌ Booking state save verification failed!');
    console.error('Expected step:', state.step);
    console.error('Retrieved step:', verifyState?.step);
  }
}

/**
 * Process conversational booking message
 */
export async function processBookingMessage(userMessage, sessionId, conversationHistory = []) {
  let state = getBookingState(sessionId);
  
  console.log('=== Processing booking message ===');
  console.log('User message:', userMessage);
  console.log('Current state:', JSON.stringify(state, null, 2));
  console.log('Current step:', state?.step);
  
  // Extract service name if mentioned in initial message
  const lowerMessage = userMessage.toLowerCase();
  const services = getServices();
  let mentionedService = null;
  let mentionedDoctor = null;
  
  // Extract doctor name if mentioned (e.g., "Book with Dr. med. Christoph Lienhard")
  const doctors = getDoctors();
  
  // Check for various booking patterns
  const bookingPatterns = [
    /book\s+with\s+(.+?)(?:\s+for|\s+$|$)/i,  // "Book with Dr. X"
    /book\s+appointment\s+with\s+(.+?)(?:\s+for|\s+$|$)/i,  // "Book appointment with Dr. X"
    /want\s+to\s+book\s+(?:an\s+)?appointment\s+with\s+(.+?)(?:\s+for|\s+$|$)/i,  // "I want to book appointment with Dr. X"
    /appointment\s+with\s+(.+?)(?:\s+for|\s+$|$)/i,  // "appointment with Dr. X"
    /with\s+(.+?)(?:\s+for|\s+$|$)/i  // "with Dr. X" (fallback)
  ];
  
  let doctorNameCandidate = null;
  for (const pattern of bookingPatterns) {
    const match = userMessage.match(pattern);
    if (match) {
      doctorNameCandidate = match[1].trim();
      // Remove trailing punctuation and common words
      doctorNameCandidate = doctorNameCandidate.replace(/[.,;:!?]+$/, '').trim();
      // Remove "for [service]" if present
      doctorNameCandidate = doctorNameCandidate.replace(/\s+for\s+.+$/i, '').trim();
      if (doctorNameCandidate.length > 0) {
        console.log(`Found booking pattern, candidate: "${doctorNameCandidate}"`);
        break;
      }
    }
  }
  
  // Try to match the doctor name
  if (doctorNameCandidate) {
    const candidateLower = doctorNameCandidate.toLowerCase();
    
    // First, try exact match
    for (const doctor of doctors) {
      const doctorLower = doctor.name.toLowerCase();
      if (doctorLower === candidateLower) {
        mentionedDoctor = doctor.name;
        console.log('Matched doctor (exact):', mentionedDoctor);
        break;
      }
    }
    
    // Then try partial match (contains)
    if (!mentionedDoctor) {
      for (const doctor of doctors) {
        const doctorLower = doctor.name.toLowerCase();
        if (doctorLower.includes(candidateLower) || candidateLower.includes(doctorLower)) {
          mentionedDoctor = doctor.name;
          console.log('Matched doctor (partial):', mentionedDoctor);
          break;
        }
      }
    }
    
    // Try matching last name only
    if (!mentionedDoctor) {
      const candidateParts = candidateLower.split(/\s+/);
      const lastName = candidateParts[candidateParts.length - 1];
      
      for (const doctor of doctors) {
        const doctorParts = doctor.name.toLowerCase().split(/\s+/);
        const doctorLastName = doctorParts[doctorParts.length - 1];
        
        if (doctorLastName === lastName || 
            doctorLastName.includes(lastName) || 
            lastName.includes(doctorLastName)) {
          mentionedDoctor = doctor.name;
          console.log('Matched doctor (last name):', mentionedDoctor);
          break;
        }
      }
    }
    
    // Try matching without titles (Dr., Dr. med., etc.)
    if (!mentionedDoctor) {
      const candidateWithoutTitle = candidateLower.replace(/^(dr\.?\s*med\.?\s*|dr\.?\s*|prof\.?\s*dr\.?\s*)/i, '').trim();
      
      for (const doctor of doctors) {
        const doctorWithoutTitle = doctor.name.toLowerCase().replace(/^(dr\.?\s*med\.?\s*|dr\.?\s*|prof\.?\s*dr\.?\s*)/i, '').trim();
        
        if (doctorWithoutTitle === candidateWithoutTitle ||
            doctorWithoutTitle.includes(candidateWithoutTitle) ||
            candidateWithoutTitle.includes(doctorWithoutTitle)) {
          mentionedDoctor = doctor.name;
          console.log('Matched doctor (without title):', mentionedDoctor);
          break;
        }
      }
    }
  }
  
  // Also check if doctor name appears anywhere in the message (fallback)
  if (!mentionedDoctor) {
    for (const doctor of doctors) {
      const doctorLower = doctor.name.toLowerCase();
      const doctorParts = doctor.name.split(/\s+/);
      
      // Check if full name is mentioned
      if (lowerMessage.includes(doctorLower)) {
        mentionedDoctor = doctor.name;
        console.log('Matched doctor (full name in message):', mentionedDoctor);
        break;
      }
      
      // Check if last name is mentioned (common when referring to doctors)
      if (doctorParts.length > 1) {
        const lastName = doctorParts[doctorParts.length - 1].toLowerCase();
        if (lastName.length > 3 && lowerMessage.includes(lastName)) {
          // Check if it's not part of another word
          const lastNameRegex = new RegExp(`\\b${lastName}\\b`, 'i');
          if (lastNameRegex.test(userMessage)) {
            mentionedDoctor = doctor.name;
            console.log('Matched doctor (last name in message):', mentionedDoctor);
            break;
          }
        }
      }
    }
  }
  
  // Check if a service is mentioned - improved matching
  for (const service of services) {
    const serviceLower = service.name.toLowerCase();
    const userLower = lowerMessage.toLowerCase();
    
    // Match exact service name
    if (userLower.includes(serviceLower) || serviceLower.includes(userLower)) {
      mentionedService = service.name;
      break;
    }
    
    // Special handling for common variations
    if ((serviceLower.includes('general consultation') || serviceLower.includes('generalconsultation')) && 
        (userLower.includes('general') && (userLower.includes('consultation') || userLower.includes('consultant')))) {
      mentionedService = service.name;
      break;
    }
    
    if (serviceLower.includes('consultation') && userLower.includes('consultant')) {
      mentionedService = service.name;
      break;
    }
    
    // Match individual words
    const serviceWords = serviceLower.split(/\s+/);
    const userWords = userLower.split(/\s+/);
    const matchingWords = serviceWords.filter(sw => userWords.some(uw => uw.includes(sw) || sw.includes(uw)));
    if (matchingWords.length >= 2 && serviceWords.length <= 3) {
      mentionedService = service.name;
      break;
    }
  }
  
  console.log('Extracted from message:', { mentionedDoctor, mentionedService });
  
  // Initialize booking flow if needed - NEW FLOW: Service -> Doctor -> Date -> Time -> Personal Info
  if (!state || state.step === BOOKING_STEPS.INIT || state.step === BOOKING_STEPS.COMPLETED) {
    console.log('Initializing new booking flow');
    state = {
      step: BOOKING_STEPS.SERVICE, // Default to service selection
      data: {}
    };
    
    // Pre-fill doctor if mentioned
    if (mentionedDoctor) {
      state.data.doctor = mentionedDoctor;
      console.log('Pre-filled doctor:', mentionedDoctor);
    }
    
    // Pre-fill service if mentioned
    if (mentionedService) {
      state.data.service = mentionedService;
      console.log('Pre-filled service:', mentionedService);
    }
    
    // Determine next step based on what's already selected
    if (mentionedDoctor && mentionedService) {
      // Both selected, go directly to date selection
      state.step = BOOKING_STEPS.DATE;
    } else if (mentionedDoctor && !mentionedService) {
      // Doctor selected, ask for service
      state.step = BOOKING_STEPS.SERVICE;
    } else if (!mentionedDoctor && mentionedService) {
      // Service selected, ask for doctor
      state.step = BOOKING_STEPS.DOCTOR;
    } else {
      // Nothing selected, ask for service first
      state.step = BOOKING_STEPS.SERVICE;
    }
    
    saveBookingState(sessionId, state);
    
    // Handle different scenarios
    if (mentionedDoctor && mentionedService) {
      // Both selected, go to date selection
      let slots = getAvailableSlots({ 
        provider_name: mentionedDoctor,
        service_type: mentionedService 
      });
      
      // If no slots found for this doctor+service, create them automatically
      if (slots.length === 0) {
        console.log(`No slots found for ${mentionedDoctor} - ${mentionedService}, creating them now...`);
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 14);
        
        try {
          bookingService.createAppointmentSlots(mentionedDoctor, mentionedService, startDate, endDate);
          // Fetch the newly created slots
          slots = getAvailableSlots({ 
            provider_name: mentionedDoctor,
            service_type: mentionedService 
          });
          console.log(`Created and fetched ${slots.length} slots for ${mentionedDoctor} - ${mentionedService}`);
        } catch (err) {
          console.error(`Error creating slots for ${mentionedDoctor}:`, err);
        }
      }
      
      const dates = [...new Set(slots.map(s => {
        const date = new Date(s.start_time);
        return date.toISOString().split('T')[0];
      }))].sort().slice(0, 14);
      
      if (dates.length > 0) {
        const dateList = dates.map((d, idx) => {
          const date = new Date(d);
          return `${idx + 1}. ${date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
        }).join('\n');
        
        return {
          response: `Perfect! I've set up your appointment with ${mentionedDoctor} for ${mentionedService}. 😊\n\nWhich date works best for you? Here are the available dates:\n\n${dateList}\n\nYou can type the date (e.g., "Nov 4" or "November 4"), number, or use the quick reply buttons below.`,
          step: BOOKING_STEPS.DATE,
          continueBooking: true,
          quickReplies: dates.slice(0, 5).map(d => {
            const date = new Date(d);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          }),
          availableDates: dates.slice(0, 14)
        };
      } else {
        return {
          response: `Perfect! I've set up your appointment with ${mentionedDoctor} for ${mentionedService}. 😊\n\nHowever, I don't see any available dates at the moment. Would you like me to check with a different doctor or service?`,
          step: BOOKING_STEPS.DATE,
          continueBooking: true
        };
      }
    } else if (mentionedDoctor && !mentionedService) {
      // Doctor selected, ask for service
      const serviceList = services.slice(0, 10).map((s, idx) => `${idx + 1}. ${s.name}`).join('\n');
      return {
        response: `Great! I've noted you'd like to book with ${mentionedDoctor}. 😊\n\nWhich service would you like to book? Here are some options:\n\n${serviceList}\n\nYou can type the service name or number.`,
        step: BOOKING_STEPS.SERVICE,
        continueBooking: true,
        quickReplies: services.slice(0, 5).map(s => s.name)
      };
    } else if (!mentionedDoctor && mentionedService) {
      // Service selected, ask for doctor
      // Always show ALL doctors, not just those with existing slots
      // Slots will be created automatically when a doctor is selected
      const allDoctorsList = doctors.map((d, idx) => `${idx + 1}. ${d.name}`).join('\n');
      return {
        response: `Perfect! I'd love to help you book an appointment for ${mentionedService}. 😊\n\nWhich doctor would you prefer? Here are our doctors:\n\n${allDoctorsList}\n\nYou can type the doctor's name or number.`,
        step: BOOKING_STEPS.DOCTOR,
        continueBooking: true,
        quickReplies: doctors.slice(0, 5).map(d => d.name)
      };
    } else {
      // Nothing selected, ask for service first
      const serviceList = services.slice(0, 10).map((s, idx) => `${idx + 1}. ${s.name}`).join('\n');
      return {
        response: "Great! I'd love to help you book an appointment. 😊\n\nWhich service would you like to book? Here are some options:\n\n" + serviceList + "\n\nYou can type the service name or number.",
        step: BOOKING_STEPS.SERVICE,
        continueBooking: true,
        quickReplies: services.slice(0, 5).map(s => s.name)
      };
    }
  }
  
  // Get current step - ensure we have valid state
  const currentStep = state.step;
  const bookingData = state.data || {};
  
  console.log(`=== Processing step: ${currentStep} ===`);
  console.log(`Booking data keys:`, Object.keys(bookingData));
  console.log(`Booking data values:`, bookingData);
  
  // CRITICAL: If we're in a step that requires previous data, verify it exists
  // BUT: Only check if we're actually in that step (not transitioning from previous step)
  // This prevents redirect loops when the user just provided the data
  
  // Only validate TIME step if we're actually in TIME step and date is missing
  if (currentStep === BOOKING_STEPS.TIME && !bookingData.date) {
    console.error('❌ TIME step but no date found in bookingData:', bookingData);
    console.error('Current step:', currentStep);
    console.error('Booking data keys:', Object.keys(bookingData));
    
    // Check if doctor and service exist (required for getting dates)
    if (!bookingData.doctor || !bookingData.service) {
      console.error('Missing doctor or service, cannot get dates');
      return {
        response: `I need more information to continue. Let's start over. Which service would you like to book?`,
        step: BOOKING_STEPS.SERVICE,
        continueBooking: true
      };
    }
    
    // Get available dates first
    const slots = getAvailableSlots({ 
      provider_name: bookingData.doctor,
      service_type: bookingData.service 
    });
    const availableDates = [...new Set(slots.map(s => {
      const date = new Date(s.start_time);
      return date.toISOString().split('T')[0];
    }))].sort().slice(0, 14);
    
    console.log('Redirecting to DATE step with', availableDates.length, 'available dates');
    
    return {
      response: `I need to know which date you'd like first. Which date works best for you?`,
      step: BOOKING_STEPS.DATE,
      continueBooking: true,
      availableDates: availableDates
    };
  }
  
  // Only validate NAME step if we're actually in NAME step and slotId is missing
  if (currentStep === BOOKING_STEPS.NAME && !bookingData.slotId) {
    console.error('❌ NAME step but no slotId found in bookingData:', bookingData);
    
    // Check if date exists (required for getting times)
    if (!bookingData.date) {
      console.error('No date found, redirecting to DATE step');
      const slots = getAvailableSlots({ 
        provider_name: bookingData.doctor,
        service_type: bookingData.service 
      });
      const availableDates = [...new Set(slots.map(s => {
        const date = new Date(s.start_time);
        return date.toISOString().split('T')[0];
      }))].sort().slice(0, 14);
      
      return {
        response: `I need to know which date you'd like first. Which date works best for you?`,
        step: BOOKING_STEPS.DATE,
        continueBooking: true,
        availableDates: availableDates
      };
    }
    
    // Get available times
    const slots = getAvailableSlots({ 
      provider_name: bookingData.doctor,
      service_type: bookingData.service,
      date_from: bookingData.date,
      date_to: bookingData.date
    }).sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    
    const timeList = slots.map((s, idx) => {
      const time = new Date(s.start_time);
      const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return `${idx + 1}. ${timeStr}`;
    }).join('\n');
    
    console.log('Redirecting to TIME step with', slots.length, 'available times');
    
    return {
      response: `I need to know which time you'd like first. Please select a time:\n\n${timeList}\n\nYou can type the time or number.`,
      step: BOOKING_STEPS.TIME,
      continueBooking: true,
      quickReplies: slots.slice(0, 5).map(s => {
        const time = new Date(s.start_time);
        return time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      })
    };
  }
  
  if (currentStep === BOOKING_STEPS.DOB && !bookingData.name) {
    console.error('DOB step but no name found, redirecting to NAME step');
    return {
      response: `I need your name first. What's your full name?`,
      step: BOOKING_STEPS.NAME,
      continueBooking: true
    };
  }
  
  if (currentStep === BOOKING_STEPS.PHONE && !bookingData.dob) {
    console.error('PHONE step but no DOB found, redirecting to DOB step');
    return {
      response: `I need your date of birth first. What's your date of birth? (YYYY-MM-DD format)`,
      step: BOOKING_STEPS.DOB,
      continueBooking: true
    };
  }
  
  if (currentStep === BOOKING_STEPS.EMAIL && !bookingData.phone) {
    console.error('EMAIL step but no phone found, redirecting to PHONE step');
    return {
      response: `I need your phone number first. What's your phone number?`,
      step: BOOKING_STEPS.PHONE,
      continueBooking: true
    };
  }
  
  if (currentStep === BOOKING_STEPS.CONFIRM && !bookingData.email) {
    console.error('CONFIRM step but no email found, redirecting to EMAIL step');
    return {
      response: `I need your email address first. What's your email address?`,
      step: BOOKING_STEPS.EMAIL,
      continueBooking: true
    };
  }
  
  // Handle each step
  switch (currentStep) {
    case BOOKING_STEPS.TIME:
      console.log('=== TIME STEP ===');
      console.log('User message:', userMessage);
      console.log('Current booking data:', bookingData);
      
      // CRITICAL: Check if this looks like a DATE input, not a time
      const datePattern = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*\d+/i;
      const datePattern2 = /\d{4}-\d{2}-\d{2}/;
      const datePattern3 = /\d{1,2}\/\d{1,2}/;
      
      if (datePattern.test(userMessage) || datePattern2.test(userMessage) || datePattern3.test(userMessage)) {
        console.error('TIME step received date input, redirecting to DATE step');
        // User is trying to select a date, redirect to DATE step
        const slots = getAvailableSlots({ 
          provider_name: bookingData.doctor,
          service_type: bookingData.service 
        });
        const availableDates = [...new Set(slots.map(s => {
          const date = new Date(s.start_time);
          return date.toISOString().split('T')[0];
        }))].sort().slice(0, 14);
        
        const dateList = availableDates.slice(0, 10).map((d, idx) => {
          const date = new Date(d);
          return `${idx + 1}. ${date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
        }).join('\n');
        
        return {
          response: `It looks like you're selecting a date. Here are the available dates:\n\n${dateList}\n\nYou can type the date (e.g., "Nov 4" or "November 4"), number, or use the quick reply buttons below.`,
          step: BOOKING_STEPS.DATE,
          continueBooking: true,
          quickReplies: availableDates.slice(0, 5).map(d => {
            const date = new Date(d);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          }),
          availableDates: availableDates.slice(0, 14)
        };
      }
      
      // First check if bookingData has a date - if not, this is wrong step
      if (!bookingData.date) {
        console.error('No date in booking data, cannot select time');
        const slots = getAvailableSlots({ 
          provider_name: bookingData.doctor,
          service_type: bookingData.service 
        });
        const availableDates = [...new Set(slots.map(s => {
          const date = new Date(s.start_time);
          return date.toISOString().split('T')[0];
        }))].sort().slice(0, 14);
        
        return {
          response: `I need to know the date first. Which date works best for you?`,
          step: BOOKING_STEPS.DATE,
          continueBooking: true,
          availableDates: availableDates
        };
      }
      
      const timeSlots = getAvailableSlots({ 
        provider_name: bookingData.doctor,
        service_type: bookingData.service,
        date_from: bookingData.date,
        date_to: bookingData.date
      }).sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
      
      console.log(`Found ${timeSlots.length} time slots for ${bookingData.date}`);
      
      let selectedTimeSlot = null;
      
      // Check if user typed a number (exact match only)
      const timeNumberMatch = userMessage.match(/^\d+$/);
      if (timeNumberMatch) {
        const index = parseInt(timeNumberMatch[0]) - 1;
        if (index >= 0 && index < timeSlots.length) {
          selectedTimeSlot = timeSlots[index];
          console.log(`✅ Selected time slot by number ${index + 1}: ${selectedTimeSlot.id}`);
        }
      }
      
      // If no number match, try to match time
      if (!selectedTimeSlot) {
        const userLower = userMessage.toLowerCase().trim();
        selectedTimeSlot = timeSlots.find(s => {
          const time = new Date(s.start_time);
          const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          const timeLower = timeStr.toLowerCase();
          
          // Check exact match or contains match
          return timeLower === userLower || 
                 timeLower.includes(userLower) || 
                 userLower.includes(timeLower) ||
                 timeStr.includes(userMessage) ||
                 userMessage.includes(timeStr);
        });
        
        if (selectedTimeSlot) {
          console.log(`✅ Matched time "${userMessage}" to slot ${selectedTimeSlot.id}`);
        } else {
          console.log(`❌ Could not match time "${userMessage}"`);
        }
      }
      
      if (selectedTimeSlot) {
        console.log(`✅ Time selected: ${selectedTimeSlot.id}`);
        bookingData.slotId = selectedTimeSlot.id;
        bookingData.slotTime = selectedTimeSlot.start_time;
        state.step = BOOKING_STEPS.NAME; // Now ask for personal info
        state.data = bookingData;
        saveBookingState(sessionId, state);
        
        console.log('Saved time selection, moving to NAME step. State:', JSON.stringify(state, null, 2));
        console.log('Verifying state was saved...');
        
        // Double-check that state was saved correctly
        const verifyState = getBookingState(sessionId);
        if (verifyState && verifyState.data && verifyState.data.slotId === selectedTimeSlot.id) {
          console.log('✅ Time slot confirmed saved in state');
        } else {
          console.error('❌ Time slot NOT confirmed in saved state!');
          console.error('Expected slotId:', selectedTimeSlot.id);
          console.error('Saved state:', verifyState);
        }
        
        const time = new Date(selectedTimeSlot.start_time);
        const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const dateStr = new Date(bookingData.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        return {
          response: `Perfect! I've selected ${timeStr} on ${dateStr} with ${bookingData.doctor} for ${bookingData.service}. 🎯\n\nNow I just need a few details from you:\n\nWhat's your full name?`,
          step: BOOKING_STEPS.NAME,
          continueBooking: true
        };
      } else {
        console.error('❌ Could not parse time from user input:', userMessage);
        console.error('Available time slots:', timeSlots.length);
        
        // Show available times again
        const timeList = timeSlots.map((s, idx) => {
          const time = new Date(s.start_time);
          const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          return `${idx + 1}. ${timeStr}`;
        }).join('\n');
        
        return {
          response: `I didn't recognize that time. Could you please type the time or number from the list?\n\nWhat time works best for you? Here are the available times:\n\n${timeList}\n\nYou can type the time or number.`,
          step: BOOKING_STEPS.TIME,
          continueBooking: true,
          quickReplies: timeSlots.slice(0, 5).map(s => {
            const time = new Date(s.start_time);
            return time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          })
        };
      }
      
    case BOOKING_STEPS.NAME:
      console.log('Processing NAME step, current booking data:', bookingData);
      console.log('User message:', userMessage);
      
      // Validate that this looks like a name (not a time or date)
      const nameInputLower = userMessage.toLowerCase().trim();
      const looksLikeTime = /\d{1,2}:\d{2}\s*(am|pm)/i.test(userMessage);
      const looksLikeDate = /\d{4}-\d{2}-\d{2}/.test(userMessage) || 
                            /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*\d+/i.test(userMessage);
      
      if (looksLikeTime) {
        // User might have selected a time instead of entering name
        // Check if we're supposed to be in TIME step
        if (!bookingData.slotId) {
          // Get times for the selected date
          const slots = getAvailableSlots({ 
            provider_name: bookingData.doctor,
            service_type: bookingData.service,
            date_from: bookingData.date,
            date_to: bookingData.date
          }).sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
          
          const timeList = slots.map((s, idx) => {
            const time = new Date(s.start_time);
            const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            return `${idx + 1}. ${timeStr}`;
          }).join('\n');
          
          return {
            response: `It looks like you're trying to select a time. Please select a time from the list:\n\n${timeList}\n\nYou can type the time or number.`,
            step: BOOKING_STEPS.TIME,
            continueBooking: true,
            quickReplies: slots.slice(0, 5).map(s => {
              const time = new Date(s.start_time);
              return time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            })
          };
        }
      }
      
      if (looksLikeDate) {
        // User might have selected a date instead of entering name
        return {
          response: `It looks like you entered a date. Please enter your full name instead.`,
          step: BOOKING_STEPS.NAME,
          continueBooking: true
        };
      }
      
      // Save name and move to next step
      bookingData.name = userMessage.trim();
      state.step = BOOKING_STEPS.DOB;
      state.data = bookingData;
      saveBookingState(sessionId, state);
      
      console.log('Saved name, moving to DOB step');
      
      return {
        response: `Nice to meet you, ${bookingData.name}! 👋\n\nWhat's your date of birth? (Please use format: YYYY-MM-DD, for example: 1990-05-15)`,
        step: BOOKING_STEPS.DOB,
        continueBooking: true
      };
      
    case BOOKING_STEPS.DOB:
      console.log('Processing DOB input, current booking data:', bookingData);
      console.log('User message:', userMessage);
      
      // Validate date format
      const dobMatch = userMessage.match(/(\d{4}-\d{2}-\d{2})/);
      if (dobMatch) {
        bookingData.dob = dobMatch[1];
        state.step = BOOKING_STEPS.PHONE;
        state.data = bookingData;
        saveBookingState(sessionId, state);
        
        console.log('Saved DOB, moving to PHONE step');
        
        return {
          response: `Perfect! 📅\n\nWhat's your phone number?`,
          step: BOOKING_STEPS.PHONE,
          continueBooking: true
        };
      } else {
        return {
          response: `I need the date in YYYY-MM-DD format. For example: 1990-05-15\n\nWhat's your date of birth?`,
          step: BOOKING_STEPS.DOB,
          continueBooking: true
        };
      }
      
    case BOOKING_STEPS.PHONE:
      console.log('Processing phone input, current booking data:', bookingData);
      console.log('User message:', userMessage);
      
      bookingData.phone = userMessage.trim();
      state.step = BOOKING_STEPS.EMAIL;
      state.data = bookingData;
      saveBookingState(sessionId, state);
      
      console.log('Saved phone, moving to EMAIL step');
      
      return {
        response: `Got it! 📞\n\nWhat's your email address?`,
        step: BOOKING_STEPS.EMAIL,
        continueBooking: true
      };
      
    case BOOKING_STEPS.EMAIL:
      console.log('Processing EMAIL step, current booking data:', bookingData);
      console.log('User message:', userMessage);
      
      // Try multiple email regex patterns
      const emailPatterns = [
        /[\w\.-]+@[\w\.-]+\.\w+/,  // Standard email
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,  // More specific
        /\S+@\S+\.\S+/  // Simple pattern
      ];
      
      let emailMatch = null;
      for (const pattern of emailPatterns) {
        const match = userMessage.match(pattern);
        if (match) {
          emailMatch = match[0];
          break;
        }
      }
      
      if (emailMatch) {
        bookingData.email = emailMatch.trim();
        state.step = BOOKING_STEPS.CONFIRM; // Go directly to confirmation after email
        state.data = bookingData;
        saveBookingState(sessionId, state);
        
        console.log('Saved email, moving to CONFIRM step');
        
        const time = new Date(bookingData.slotTime);
        const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const dateStr = new Date(bookingData.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        return {
          response: `Thank you! ✉️\n\nLet me confirm your appointment details:\n\n👤 Name: ${bookingData.name}\n📅 Date: ${dateStr}\n⏰ Time: ${timeStr}\n👨‍⚕️ Doctor: ${bookingData.doctor}\n🏥 Service: ${bookingData.service}\n\nDoes this look correct? Type "yes" to confirm or "no" to make changes.`,
          step: BOOKING_STEPS.CONFIRM,
          continueBooking: true,
          quickReplies: ['Yes, confirm', 'No, change']
        };
      } else {
        return {
          response: `I need a valid email address. For example: yourname@example.com\n\nWhat's your email address?`,
          step: BOOKING_STEPS.EMAIL,
          continueBooking: true
        };
      }
      
    case BOOKING_STEPS.SERVICE:
      // Match service name or number
      const services = getServices();
      let selectedService = null;
      
      // Check if user typed a number
      const numMatch = userMessage.match(/\d+/);
      if (numMatch) {
        const index = parseInt(numMatch[0]) - 1;
        if (index >= 0 && index < services.length) {
          selectedService = services[index].name;
        }
      }
      
      // If no number match, try to find service by name
      if (!selectedService) {
        const userLower = userMessage.toLowerCase();
        selectedService = services.find(s => 
          s.name.toLowerCase().includes(userLower) || 
          userLower.includes(s.name.toLowerCase())
        )?.name;
      }
      
      if (selectedService) {
        bookingData.service = selectedService;
        
        // Check if doctor was already pre-filled (e.g., from "Book with [Doctor]" click)
        if (bookingData.doctor) {
          // Doctor already selected, go directly to date selection
          console.log('Service selected, doctor already pre-filled:', bookingData.doctor);
          state.step = BOOKING_STEPS.DATE;
          state.data = bookingData;
          saveBookingState(sessionId, state);
          
          // Get available dates
          let slots = getAvailableSlots({ 
            provider_name: bookingData.doctor,
            service_type: selectedService 
          });
          
          // If no slots found, create them automatically
          if (slots.length === 0) {
            console.log(`No slots found for ${bookingData.doctor} - ${selectedService}, creating them now...`);
            const startDate = new Date();
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + 14);
            
            try {
              bookingService.createAppointmentSlots(bookingData.doctor, selectedService, startDate, endDate);
              // Fetch the newly created slots
              slots = getAvailableSlots({ 
                provider_name: bookingData.doctor,
                service_type: selectedService 
              });
              console.log(`Created and fetched ${slots.length} slots for ${bookingData.doctor} - ${selectedService}`);
            } catch (err) {
              console.error(`Error creating slots for ${bookingData.doctor}:`, err);
            }
          }
          
          const dates = [...new Set(slots.map(s => {
            const date = new Date(s.start_time);
            return date.toISOString().split('T')[0];
          }))].sort().slice(0, 14);
          
          if (dates.length > 0) {
            const dateList = dates.map((d, idx) => {
              const date = new Date(d);
              return `${idx + 1}. ${date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
            }).join('\n');
            
            return {
              response: `Perfect! I've set up your appointment with ${bookingData.doctor} for ${selectedService}. 😊\n\nWhich date works best for you? Here are the available dates:\n\n${dateList}\n\nYou can type the date (e.g., "Nov 4" or "November 4"), number, or use the quick reply buttons below.`,
              step: BOOKING_STEPS.DATE,
              continueBooking: true,
              quickReplies: dates.slice(0, 5).map(d => {
                const date = new Date(d);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              }),
              availableDates: dates.slice(0, 14)
            };
          } else {
            return {
              response: `Perfect! I've set up your appointment with ${bookingData.doctor} for ${selectedService}. 😊\n\nHowever, I don't see any available dates at the moment. Would you like me to check with a different service?`,
              step: BOOKING_STEPS.DATE,
              continueBooking: true
            };
          }
        }
        
        // No doctor pre-filled, ask for doctor selection
        state.step = BOOKING_STEPS.DOCTOR;
        state.data = bookingData;
        saveBookingState(sessionId, state);
        
        // Always show ALL doctors, not just those with existing slots
        // Slots will be created automatically when a doctor is selected
        const allDoctors = getDoctors();
        const doctorList = allDoctors.map((d, idx) => `${idx + 1}. ${d.name}`).join('\n');
        return {
          response: `Excellent choice! ${selectedService} it is. 🎯\n\nWhich doctor would you prefer? Here are our doctors:\n\n${doctorList}\n\nYou can type the doctor's name or number.`,
          step: BOOKING_STEPS.DOCTOR,
          continueBooking: true,
          quickReplies: allDoctors.slice(0, 5).map(d => d.name)
        };
      } else {
        return {
          response: `I didn't recognize that service. Could you please type the service name or number from the list?\n\nWhich service would you like to book?`,
          step: BOOKING_STEPS.SERVICE,
          continueBooking: true,
          quickReplies: services.slice(0, 5).map(s => s.name)
        };
      }
      
    case BOOKING_STEPS.DOCTOR:
      console.log('Processing doctor selection, current booking data:', bookingData);
      const doctors = getDoctors();
      let selectedDoctor = null;
      
      // Check if user typed a number
      const doctorNumMatch = userMessage.match(/\d+/);
      if (doctorNumMatch) {
        const slots = getAvailableSlots({ service_type: bookingData.service });
        const availableDoctors = [...new Set(slots.map(s => s.provider_name))];
        const index = parseInt(doctorNumMatch[0]) - 1;
        if (index >= 0 && index < availableDoctors.length) {
          selectedDoctor = availableDoctors[index];
          console.log(`Selected doctor by number ${index + 1}: ${selectedDoctor}`);
        }
      }
      
      // If no number match, try to find doctor by name - improved matching
      if (!selectedDoctor) {
        const userLower = userMessage.toLowerCase().trim();
        const slots = getAvailableSlots({ service_type: bookingData.service });
        const availableDoctors = [...new Set(slots.map(s => s.provider_name))];
        
        console.log(`Available doctors for matching: ${availableDoctors.join(', ')}`);
        console.log(`User input: "${userLower}"`);
        
        // Try exact match first
        selectedDoctor = availableDoctors.find(d => 
          d.toLowerCase().trim() === userLower
        );
        
        // Try partial match (contains)
        if (!selectedDoctor) {
          selectedDoctor = availableDoctors.find(d => {
            const doctorLower = d.toLowerCase();
            return doctorLower.includes(userLower) || userLower.includes(doctorLower);
          });
        }
        
        // Try matching last name only
        if (!selectedDoctor) {
          const userParts = userLower.split(/\s+/);
          const lastName = userParts[userParts.length - 1];
          selectedDoctor = availableDoctors.find(d => {
            const doctorParts = d.toLowerCase().split(/\s+/);
            return doctorParts.some(p => p === lastName || p.includes(lastName) || lastName.includes(p));
          });
        }
        
        // Try matching "Dr. LastName" format
        if (!selectedDoctor && userLower.includes('dr.')) {
          const lastName = userLower.replace(/dr\.?\s*/i, '').trim();
          selectedDoctor = availableDoctors.find(d => {
            const doctorLower = d.toLowerCase();
            return doctorLower.includes(lastName) || lastName.includes(doctorLower.split(/\s+/).pop());
          });
        }
        
        console.log(`Selected doctor: ${selectedDoctor || 'NOT FOUND'}`);
      }
      
      if (selectedDoctor) {
        bookingData.doctor = selectedDoctor;
        state.step = BOOKING_STEPS.DATE;
        state.data = bookingData;
        saveBookingState(sessionId, state);
        
        console.log('Saved doctor selection, fetching available dates...');
        
        // Get available dates
        let slots = getAvailableSlots({ 
          provider_name: selectedDoctor,
          service_type: bookingData.service 
        });
        
        // If no slots found, create them automatically
        if (slots.length === 0) {
          console.log(`No slots found for ${selectedDoctor} - ${bookingData.service}, creating them now...`);
          const startDate = new Date();
          const endDate = new Date();
          endDate.setDate(endDate.getDate() + 14);
          
          try {
            bookingService.createAppointmentSlots(selectedDoctor, bookingData.service, startDate, endDate);
            // Fetch the newly created slots
            slots = getAvailableSlots({ 
              provider_name: selectedDoctor,
              service_type: bookingData.service 
            });
            console.log(`Created and fetched ${slots.length} slots for ${selectedDoctor} - ${bookingData.service}`);
          } catch (err) {
            console.error(`Error creating slots for ${selectedDoctor}:`, err);
          }
        }
        
        console.log(`Found ${slots.length} slots for ${selectedDoctor} - ${bookingData.service}`);
        
        const dates = [...new Set(slots.map(s => {
          const date = new Date(s.start_time);
          return date.toISOString().split('T')[0];
        }))].sort().slice(0, 14); // Show up to 14 days instead of 10
        
        if (dates.length > 0) {
          const dateList = dates.map((d, idx) => {
            const date = new Date(d);
            return `${idx + 1}. ${date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
          }).join('\n');
          
          const quickReplyDates = dates.slice(0, 5).map(d => {
            const date = new Date(d);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          });
          
          console.log(`Returning ${dates.length} dates with quick replies`);
          
          return {
            response: `Perfect! Dr. ${selectedDoctor} is a great choice. 👨‍⚕️\n\nWhich date works best for you? Here are the available dates:\n\n${dateList}\n\nYou can type the date (e.g., "Nov 4" or "November 4"), number, or use the quick reply buttons below.`,
            step: BOOKING_STEPS.DATE,
            continueBooking: true,
            quickReplies: quickReplyDates,
            availableDates: dates.slice(0, 14) // Show up to 14 dates in calendar
          };
        } else {
          // Create slots for this doctor if none exist
          const allDoctors = getDoctors();
          const doctorObj = allDoctors.find(d => d.name === selectedDoctor);
          
          if (doctorObj) {
            const startDate = new Date();
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + 14);
            
            try {
              bookingService.createAppointmentSlots(selectedDoctor, bookingData.service, startDate, endDate);
              await new Promise(resolve => setTimeout(resolve, 500));
              
              const newSlots = getAvailableSlots({ 
                provider_name: selectedDoctor,
                service_type: bookingData.service 
              });
              
              const newDates = [...new Set(newSlots.map(s => {
                const date = new Date(s.start_time);
                return date.toISOString().split('T')[0];
              }))].sort().slice(0, 10);
              
              if (newDates.length > 0) {
                const dateList = newDates.map((d, idx) => {
                  const date = new Date(d);
                  return `${idx + 1}. ${date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
                }).join('\n');
                
                return {
                  response: `Perfect! Dr. ${selectedDoctor} is a great choice. 👨‍⚕️\n\nWhich date works best for you? Here are the available dates:\n\n${dateList}\n\nYou can type the date (e.g., "Nov 4" or "November 4"), number, or use the quick reply buttons below.`,
                  step: BOOKING_STEPS.DATE,
                  continueBooking: true,
                  quickReplies: newDates.slice(0, 5).map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
                  availableDates: newDates.slice(0, 14) // Show up to 14 dates in calendar
                };
              }
            } catch (err) {
              console.error('Error creating slots:', err);
            }
          }
          
          return {
            response: `I'm sorry, but Dr. ${selectedDoctor} doesn't have any available slots for ${bookingData.service} at the moment. Would you like to choose a different doctor or service?`,
            step: BOOKING_STEPS.DOCTOR,
            continueBooking: true
          };
        }
      } else {
        // Get available doctors for error message
        const slots = getAvailableSlots({ service_type: bookingData.service });
        const availableDoctors = [...new Set(slots.map(s => s.provider_name))];
        
        return {
          response: `I didn't recognize that doctor. Could you please type the doctor's name or number from the list?\n\nWhich doctor would you prefer?`,
          step: BOOKING_STEPS.DOCTOR,
          continueBooking: true,
          quickReplies: availableDoctors.slice(0, 5)
        };
      }
      
    case BOOKING_STEPS.DATE:
      console.log('=== DATE STEP ===');
      console.log('User message:', userMessage);
      console.log('Current booking data:', bookingData);
      
      // CRITICAL: Check if this looks like a TIME input, not a date
      const timePattern = /\d{1,2}:\d{2}\s*(am|pm)/i;
      if (timePattern.test(userMessage)) {
        console.error('DATE step received time input, redirecting to TIME step');
        // User is trying to select a time, redirect to TIME step
        const slots = getAvailableSlots({ 
          provider_name: bookingData.doctor,
          service_type: bookingData.service,
          date_from: bookingData.date,
          date_to: bookingData.date
        }).sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        
        const timeList = slots.map((s, idx) => {
          const time = new Date(s.start_time);
          const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          return `${idx + 1}. ${timeStr}`;
        }).join('\n');
        
        return {
          response: `It looks like you're selecting a time. Here are the available times:\n\n${timeList}\n\nYou can type the time or number.`,
          step: BOOKING_STEPS.TIME,
          continueBooking: true,
          quickReplies: slots.slice(0, 5).map(s => {
            const time = new Date(s.start_time);
            return time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          })
        };
      }
      
      const slots = getAvailableSlots({ 
        provider_name: bookingData.doctor,
        service_type: bookingData.service 
      });
      
      const availableDates = [...new Set(slots.map(s => {
        const date = new Date(s.start_time);
        return date.toISOString().split('T')[0];
      }))].sort().slice(0, 14); // Show up to 14 days
      
      console.log(`Available dates:`, availableDates);
      
      let selectedDate = null;
      
      // Check if user typed a number
      const dateNumMatch = userMessage.match(/^\d+$/);
      if (dateNumMatch) {
        const index = parseInt(dateNumMatch[0]) - 1;
        if (index >= 0 && index < availableDates.length) {
          selectedDate = availableDates[index];
          console.log(`Selected date by number ${index + 1}: ${selectedDate}`);
        }
      }
      
      // If no number match, try to parse date - improved parsing
      if (!selectedDate) {
        const userLower = userMessage.toLowerCase().trim();
        
        console.log(`Parsing date from: "${userMessage}"`);
        
        // Check for "today" or "tomorrow"
        if (userLower.includes('today')) {
          selectedDate = new Date().toISOString().split('T')[0];
        } else if (userLower.includes('tomorrow')) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          selectedDate = tomorrow.toISOString().split('T')[0];
        } else {
          // Try to match against available dates by parsing the user input
          // Handle formats like "Nov 4", "November 4", "4 Nov", "11/4", etc.
          for (const dateStr of availableDates) {
            const date = new Date(dateStr);
            const dateOptions = [
              date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), // "Nov 4"
              date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }), // "November 4"
              date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }), // "11/4"
              date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), // "Tue, Nov 4"
              date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }), // "Tuesday, Nov 4"
              date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }), // "11/04"
              `${date.getMonth() + 1}/${date.getDate()}`, // "11/4"
              `${date.getDate()}/${date.getMonth() + 1}`, // "4/11"
              `nov ${date.getDate()}`, // "nov 4" (lowercase)
              `november ${date.getDate()}`, // "november 4"
              `${date.getDate()} nov`, // "4 nov"
            ];
            
            // Check if user input matches any of these formats
            const matches = dateOptions.some(option => {
              const optionLower = option.toLowerCase();
              // Normalize both strings for comparison (remove extra spaces, punctuation)
              const normalizedOption = optionLower.replace(/[^a-z0-9]/g, ' ');
              const normalizedUser = userLower.replace(/[^a-z0-9]/g, ' ');
              
              // Split into words and check if they match
              const optionWords = normalizedOption.split(/\s+/).filter(w => w.length > 0);
              const userWords = normalizedUser.split(/\s+/).filter(w => w.length > 0);
              
              // Check if all user words are in option words
              const allWordsMatch = userWords.every(uw => 
                optionWords.some(ow => ow.includes(uw) || uw.includes(ow))
              );
              
              return allWordsMatch && userWords.length > 0;
            });
            
            if (matches) {
              console.log(`Matched date "${userMessage}" to ${dateStr}`);
              selectedDate = dateStr;
              break;
            }
          }
          
          // Also try parsing the user input directly as a date
          if (!selectedDate) {
            try {
              // Try parsing as "Nov 5" format
              const dateMatch = userLower.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*(\d+)/i);
              if (dateMatch) {
                const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                const monthIndex = monthNames.indexOf(dateMatch[1].toLowerCase());
                const day = parseInt(dateMatch[2]);
                
                if (monthIndex >= 0 && day >= 1 && day <= 31) {
                  const currentYear = new Date().getFullYear();
                  const testDate = new Date(currentYear, monthIndex, day);
                  const testDateStr = testDate.toISOString().split('T')[0];
                  
                  if (availableDates.includes(testDateStr)) {
                    selectedDate = testDateStr;
                    console.log(`Parsed date "${userMessage}" to ${selectedDate}`);
                  }
                }
              }
            } catch (e) {
              console.log('Date parsing error:', e);
            }
          }
        }
      }
      
      if (selectedDate) {
        console.log(`✅ Date selected: ${selectedDate}`);
        bookingData.date = selectedDate;
        state.step = BOOKING_STEPS.TIME;
        state.data = bookingData;
        saveBookingState(sessionId, state);
        
        console.log('Saved date, moving to TIME step. State:', JSON.stringify(state, null, 2));
        console.log('Verifying state was saved...');
        
        // Double-check that state was saved correctly
        const verifyState = getBookingState(sessionId);
        if (verifyState && verifyState.data && verifyState.data.date === selectedDate) {
          console.log('✅ Date confirmed saved in state');
        } else {
          console.error('❌ Date NOT confirmed in saved state!');
          console.error('Expected date:', selectedDate);
          console.error('Saved state:', verifyState);
        }
        
        // Get available times for selected date
        const dateSlots = slots.filter(s => {
          const slotDate = new Date(s.start_time);
          return slotDate.toISOString().split('T')[0] === selectedDate;
        }).sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        
        if (dateSlots.length > 0) {
          const timeList = dateSlots.map((s, idx) => {
            const time = new Date(s.start_time);
            const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            return `${idx + 1}. ${timeStr}`;
          }).join('\n');
          
          return {
            response: `Great choice! 📅\n\nWhat time works best for you? Here are the available times:\n\n${timeList}\n\nYou can type the time or number.`,
            step: BOOKING_STEPS.TIME,
            continueBooking: true,
            quickReplies: dateSlots.slice(0, 5).map(s => {
              const time = new Date(s.start_time);
              return time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            }),
            availableSlots: dateSlots.map(s => ({
              id: s.id,
              time: new Date(s.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
              start_time: s.start_time
            }))
          };
        } else {
          return {
            response: `I'm sorry, but there are no available times for that date. Could you please choose a different date?`,
            step: BOOKING_STEPS.DATE,
            continueBooking: true,
            availableDates: availableDates.slice(0, 14)
          };
        }
      } else {
        console.error('❌ Could not parse date from user input:', userMessage);
        console.error('Available dates:', availableDates);
        
        // Return available dates again with better formatting
        const dateList = availableDates.slice(0, 10).map((d, idx) => {
          const date = new Date(d);
          return `${idx + 1}. ${date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
        }).join('\n');
        
        return {
          response: `I didn't recognize that date. Could you please type the date or number from the list?\n\nWhich date works best for you? Here are the available dates:\n\n${dateList}\n\nYou can type the date (e.g., "Nov 4" or "November 4"), number, or use the quick reply buttons below.`,
          step: BOOKING_STEPS.DATE,
          continueBooking: true,
          quickReplies: availableDates.slice(0, 5).map(d => {
            const date = new Date(d);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          }),
          availableDates: availableDates.slice(0, 14) // Show up to 14 dates in calendar
        };
      }
      
    case BOOKING_STEPS.CONFIRM:
      console.log('Processing confirmation, current booking data:', bookingData);
      console.log('User message:', userMessage);
      
      const confirmLower = userMessage.toLowerCase();
      if (confirmLower.includes('yes') || confirmLower.includes('confirm') || confirmLower.includes('correct')) {
          // Confirm booking
          try {
            console.log('Confirming booking with slotId:', bookingData.slotId);
            
            // First hold the slot
            const holdResult = bookingService.holdSlot(bookingData.slotId, sessionId);
            console.log('Slot held:', holdResult);
            
            // Then confirm the reservation
            const reservation = bookingService.confirmReservation(
              bookingData.slotId,
              sessionId,
              {
                name: bookingData.name,
                dob: bookingData.dob,
                phone: bookingData.phone,
                email: bookingData.email,
                reason: bookingData.reason || '',
                insurance: bookingData.insurance || ''
              }
            );
            
            console.log('Reservation created:', reservation);
          
          // Clear booking state
          state.step = BOOKING_STEPS.COMPLETED;
          state.data = {};
          saveBookingState(sessionId, state);
          
          const time = new Date(bookingData.slotTime);
          const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          const dateStr = new Date(bookingData.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
          
          return {
            response: `🎉 Excellent! Your appointment has been confirmed!\n\n📋 Reference Number: ${reservation.reservationId}\n👤 Name: ${bookingData.name}\n📅 Date: ${dateStr}\n⏰ Time: ${timeStr}\n👨‍⚕️ Doctor: ${bookingData.doctor}\n🏥 Service: ${bookingData.service}\n\nPlease save your reference number for your records. We look forward to seeing you! 😊\n\nIs there anything else I can help you with?`,
            step: BOOKING_STEPS.COMPLETED,
            continueBooking: false,
            reservationId: reservation.reservationId
          };
        } catch (error) {
          console.error('Booking error:', error);
          return {
            response: `I'm sorry, there was an error confirming your appointment: ${error.message}. Please try again or contact us directly.`,
            step: BOOKING_STEPS.CONFIRM,
            continueBooking: true,
            quickReplies: ['Yes, confirm', 'No, change']
          };
        }
      } else if (confirmLower.includes('no') || confirmLower.includes('change')) {
        // Reset to service selection
        state.step = BOOKING_STEPS.SERVICE;
        state.data = {
          name: bookingData.name,
          dob: bookingData.dob,
          phone: bookingData.phone,
          email: bookingData.email
        };
        saveBookingState(sessionId, state);
        
        const services = getServices();
        const serviceList = services.slice(0, 10).map((s, idx) => `${idx + 1}. ${s.name}`).join('\n');
        
        return {
          response: `No problem! Let's start over. Which service would you like to book?\n\n${serviceList}`,
          step: BOOKING_STEPS.SERVICE,
          continueBooking: true,
          quickReplies: services.slice(0, 5).map(s => s.name)
        };
      } else {
        return {
          response: `Could you please confirm? Type "yes" to confirm your appointment or "no" to make changes.`,
          step: BOOKING_STEPS.CONFIRM,
          continueBooking: true,
          quickReplies: ['Yes, confirm', 'No, change']
        };
      }
      
    default:
      return {
        response: "I'm ready to help you book an appointment. Let's get started!",
        step: BOOKING_STEPS.INIT,
        continueBooking: true
      };
  }
}

/**
 * Check if user wants to start booking
 */
export async function detectBookingStart(userMessage, conversationHistory = []) {
  const lowerMessage = userMessage.toLowerCase().trim();
  
  // Check for booking keywords - be more aggressive
  const bookingKeywords = [
    'book', 'appointment', 'schedule', 'booking', 
    'see doctor', 'meet doctor', 'visit doctor',
    'make appointment', 'need appointment', 'want appointment',
    'book with', 'book an', 'book a', 'i need to book',
    'i want to book', 'i would like to book', 'can i book',
    'general consultation', 'consultation', 'consultant',
    'want appointment', 'need appointment', 'would like appointment',
    'appointment please', 'book me', 'schedule me'
  ];
  
  const hasBookingKeyword = bookingKeywords.some(keyword => lowerMessage.includes(keyword));
  
  // Also check if message contains service name + booking intent
  const services = getServices();
  const hasServiceMention = services.some(s => {
    const serviceLower = s.name.toLowerCase();
    return lowerMessage.includes(serviceLower) || 
           serviceLower.includes('general consultation') && lowerMessage.includes('consultation');
  });
  
  // Simple check - if message is very short and contains booking keywords, it's likely a booking request
  const isShortMessage = lowerMessage.split(/\s+/).length <= 5;
  const isDirectBookingRequest = isShortMessage && (
    lowerMessage.includes('appointment') || 
    lowerMessage.includes('book') ||
    lowerMessage.includes('schedule')
  );
  
  // If it has booking keywords OR service mention with booking context OR is a direct short request, it's likely a booking request
  if (hasBookingKeyword || isDirectBookingRequest || (hasServiceMention && (lowerMessage.includes('book') || lowerMessage.includes('appointment') || lowerMessage.includes('need') || lowerMessage.includes('want')))) {
    // For very clear booking requests, don't even need OpenAI check
    if (isDirectBookingRequest || hasBookingKeyword) {
      console.log('Direct booking request detected:', lowerMessage);
      return true;
    }
    
    // Use OpenAI to confirm intent for ambiguous cases
    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OLLAMA_CHAT_MODEL || 'llama3.2',
        messages: [
          { role: 'system', content: 'You are a medical booking assistant. Determine if the user wants to book an appointment. Return only "yes" or "no". Be lenient - if they mention booking or appointment in any way, return "yes".' },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.3,
        max_tokens: 10
      });
      
      const response = completion.choices[0].message.content.toLowerCase();
      return response.includes('yes') || hasBookingKeyword;
    } catch (error) {
      console.error('Error in detectBookingStart:', error);
      return hasBookingKeyword || hasServiceMention || isDirectBookingRequest;
    }
  }
  
  return false;
}

