import { getAvailableSlots } from './booking.js';
import { getDoctors, getServices } from './websiteData.js';
import { openai } from './llm.js';

/**
 * Find doctor by flexible name matching
 */
function findDoctorByName(searchName) {
  if (!searchName) return null;
  
  const doctors = getDoctors();
  const searchLower = searchName.toLowerCase().trim();
  
  // Try exact match first
  let found = doctors.find(d => d.name.toLowerCase() === searchLower);
  if (found) return found.name;
  
  // Try partial match (contains)
  found = doctors.find(d => d.name.toLowerCase().includes(searchLower) || searchLower.includes(d.name.toLowerCase()));
  if (found) return found.name;
  
  // Try matching last name only
  const searchParts = searchLower.split(/\s+/);
  const lastName = searchParts[searchParts.length - 1];
  found = doctors.find(d => {
    const doctorParts = d.name.toLowerCase().split(/\s+/);
    return doctorParts.some(p => p === lastName || p.includes(lastName) || lastName.includes(p));
  });
  if (found) return found.name;
  
  return null;
}

/**
 * Extract booking intent from user message using OpenAI
 */
export async function extractBookingIntent(userMessage, conversationHistory = []) {
  try {
    const systemPrompt = `You are a medical appointment booking assistant. Extract booking-related information from user messages.

Extract the following information if mentioned:
- doctor_name: Name of the doctor (e.g., "Dr. Smith", "Dr. Jones", "Smith", "Jones")
- service_type: Type of service (e.g., "General Consultation", "Physical Therapy")
- preferred_date: Preferred date (e.g., "today", "tomorrow", "Monday", specific date)
- preferred_time: Preferred time (e.g., "morning", "afternoon", "9am", "2pm")
- urgency: Whether it's urgent (true/false)

Return ONLY a JSON object with the extracted fields, or {"no_booking": true} if no booking intent is detected.
Look for phrases like: "book", "appointment", "schedule", "see", "meet with", "visit", "consultation", "available", "free time", etc.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-5), // Last 5 messages for context
      { role: 'user', content: userMessage }
    ];

    const completion = await openai.chat.completions.create({
      model: process.env.OLLAMA_CHAT_MODEL || 'llama3.2',
      messages,
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    const intent = JSON.parse(completion.choices[0].message.content);
    
    // Check if booking intent was detected
    if (intent.no_booking || (!intent.doctor_name && !intent.service_type && !intent.preferred_date)) {
      // Check for common booking keywords as fallback
      const lowerMessage = userMessage.toLowerCase();
      const bookingKeywords = ['book', 'appointment', 'schedule', 'see', 'meet', 'visit', 'consultation', 'available'];
      const hasBookingKeyword = bookingKeywords.some(keyword => lowerMessage.includes(keyword));
      
      if (!hasBookingKeyword) {
        return null; // No booking intent
      }
    }
    
    return intent;
  } catch (error) {
    console.error('Error extracting booking intent:', error);
    return null;
  }
}

/**
 * Check availability for specific doctor or service
 */
export function checkAvailability(doctorName = null, serviceType = null, date = null) {
  const filters = {};
  
  if (doctorName) {
    filters.provider_name = doctorName;
  }
  
  if (serviceType) {
    filters.service_type = serviceType;
  }
  
  if (date) {
    const parsedDate = parseDate(date);
    if (parsedDate) {
      filters.date_from = parsedDate;
      filters.date_to = parsedDate;
    } else {
      // If parseDate fails, try using the date as-is
      filters.date_from = date;
      filters.date_to = date;
    }
  }
  
  const availableSlots = getAvailableSlots(filters);
  
  // Group by doctor and date
  const grouped = {};
  for (const slot of availableSlots) {
    const dateKey = slot.start_time.split('T')[0];
    const key = `${slot.provider_name}_${dateKey}`;
    
    if (!grouped[key]) {
      grouped[key] = {
        doctor: slot.provider_name,
        service: slot.service_type,
        date: dateKey,
        slots: []
      };
    }
    
    grouped[key].slots.push({
      id: slot.id,
      time: new Date(slot.start_time).toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      })
    });
  }
  
  return Object.values(grouped);
}

/**
 * Parse date from natural language
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  
  const lowerDate = dateStr.toLowerCase().trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (lowerDate === 'today' || lowerDate === 'now') {
    return today.toISOString().split('T')[0];
  }
  
  if (lowerDate === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }
  
  // Try parsing as ISO date string
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  
  return null;
}

/**
 * Format date for display
 */
function formatDate(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const checkDate = new Date(dateStr);
  checkDate.setHours(0, 0, 0, 0);
  
  const diffTime = checkDate - today;
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays === -1) return 'yesterday';
  
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/**
 * Generate quick reply buttons based on availability
 */
function generateQuickReplies(availabilityContext) {
  const replies = [];
  
  if (availabilityContext.requestedAvailable && availabilityContext.requestedSlots.length > 0) {
    // Requested doctor is available
    replies.push(`Yes, book with ${availabilityContext.requestedDoctor}`);
  }
  
  if (availabilityContext.tomorrowAvailable && availabilityContext.tomorrowSlots.length > 0) {
    // Requested doctor available tomorrow
    replies.push(`Book tomorrow with ${availabilityContext.requestedDoctor}`);
  }
  
  if (availabilityContext.alternativeDoctors.length > 0) {
    // Add alternatives
    availabilityContext.alternativeDoctors.slice(0, 2).forEach(alt => {
      replies.push(`Book with ${alt.doctor}`);
    });
  }
  
  // Always add a general "Book appointment" option
  if (replies.length === 0) {
    replies.push('Yes, book appointment');
  } else {
    replies.push('Book appointment');
  }
  
  // Add "No, thanks" option
  replies.push('No, thanks');
  
  return replies.slice(0, 4); // Max 4 quick replies
}

/**
 * Generate intelligent booking response
 */
export async function generateBookingResponse(userMessage, conversationHistory = []) {
  try {
    // Extract intent
    const intent = await extractBookingIntent(userMessage, conversationHistory);
    
    if (!intent || (intent.no_booking && !intent.doctor_name && !intent.service_type && !intent.preferred_date)) {
      return null; // No booking intent detected
    }
    
    const doctorName = intent.doctor_name || null;
    const serviceType = intent.service_type || null;
    const preferredDate = intent.preferred_date || null;
    
    // Try to find doctor by flexible matching
    let actualDoctorName = null;
    if (doctorName) {
      actualDoctorName = findDoctorByName(doctorName);
      if (!actualDoctorName) {
        // Doctor not found, return null to fall back to regular RAG
        return null;
      }
    }
    
    // Check availability for requested doctor
    let requestedAvailability = [];
    if (actualDoctorName) {
      // If no date specified, check today's availability
      const dateToCheck = preferredDate || new Date().toISOString().split('T')[0];
      requestedAvailability = checkAvailability(actualDoctorName, serviceType, dateToCheck);
    }
    
    // Check all available doctors (for today if no date specified)
    const dateToCheck = preferredDate || new Date().toISOString().split('T')[0];
    const allAvailability = checkAvailability(null, serviceType, dateToCheck);
    
    // Get tomorrow's availability for the requested doctor
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const tomorrowAvailability = checkAvailability(actualDoctorName, serviceType, tomorrowStr);
    
    // Generate response using OpenAI
    const availabilityContext = {
      requestedDoctor: actualDoctorName || doctorName,
      requestedService: serviceType,
      requestedDate: preferredDate,
      requestedAvailable: requestedAvailability.length > 0,
      requestedSlots: requestedAvailability,
      tomorrowAvailable: tomorrowAvailability.length > 0,
      tomorrowSlots: tomorrowAvailability,
      alternativeDoctors: allAvailability.filter(a => a.doctor !== actualDoctorName).slice(0, 3)
    };
    
    const systemPrompt = `You are a helpful medical appointment booking assistant for Functiomed.ch. You help patients book appointments in a conversational, empathetic way.

CRITICAL: Be EXPLAINABLE - Tell the user what you're checking. For example:
- "Let me check Dr. Smith's availability for today..."
- "I'm checking available appointments..."
- "Let me search for alternative doctors..."

When a patient requests an appointment or asks about availability:
1. FIRST: Explain what you're checking ("Let me check availability for...")
2. Then provide the availability information clearly
3. ALWAYS end by asking if they'd like to book an appointment

If their requested doctor is available: Confirm availability and ask if they want to proceed with booking
If their requested doctor is NOT available today: Apologize, inform them the doctor is not available today, mention when they ARE available (tomorrow if available), and suggest alternative doctors who ARE available today. Then ask if they want to book with an alternative or wait for their preferred doctor.

Format your response naturally, without markdown symbols. Use proper line breaks for readability.
ALWAYS end with a question like "Would you like to book an appointment?" or "Would you like to proceed with booking?"`;

    const userPrompt = `Patient request: "${userMessage}"

Availability information:
- Requested doctor: ${availabilityContext.requestedDoctor || 'Not specified'}
- Requested service: ${availabilityContext.requestedService || 'Not specified'}
- Requested date: ${availabilityContext.requestedDate || 'Not specified'}
- Requested doctor available today: ${availabilityContext.requestedAvailable ? 'Yes' : 'No'}

${availabilityContext.requestedAvailable ? `
Available slots for ${availabilityContext.requestedDoctor} today:
${availabilityContext.requestedSlots.map(g => `- ${formatDate(g.date)}: ${g.slots.map(s => s.time).join(', ')}`).join('\n')}
` : ''}

${availabilityContext.tomorrowAvailable ? `
Available slots for ${availabilityContext.requestedDoctor} tomorrow:
${availabilityContext.tomorrowSlots.map(g => `- ${formatDate(g.date)}: ${g.slots.map(s => s.time).join(', ')}`).join('\n')}
` : ''}

${availabilityContext.alternativeDoctors.length > 0 ? `
Alternative doctors available today:
${availabilityContext.alternativeDoctors.map(g => `- ${g.doctor} (${g.service}): ${formatDate(g.date)} - ${g.slots.map(s => s.time).join(', ')}`).join('\n')}
` : ''}

Generate a helpful, conversational response.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OLLAMA_CHAT_MODEL || 'llama3.2',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 400
    });
    
    const response = completion.choices[0].message.content;
    
    return {
      response,
      intent,
      availability: availabilityContext,
      shouldInitiateBooking: false, // Will be set based on user's next response
      quickReplies: generateQuickReplies(availabilityContext)
    };
  } catch (error) {
    console.error('Error generating booking response:', error);
    return null;
  }
}

/**
 * Check if user wants to proceed with booking
 */
export async function checkBookingConfirmation(userMessage, conversationHistory = []) {
  try {
    const systemPrompt = `Determine if the user wants to proceed with booking an appointment. Look for:
- Positive confirmation: "yes", "sure", "okay", "let's do it", "book it", "proceed", etc.
- Specific doctor selection: "Dr. Smith", "Dr. Jones", etc.
- Date/time selection: "tomorrow", "Monday", "2pm", etc.

Return JSON: { "wantsToBook": true/false, "selectedDoctor": "doctor name or null", "selectedDate": "date or null" }`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-3),
      { role: 'user', content: userMessage }
    ];

    const completion = await openai.chat.completions.create({
      model: process.env.OLLAMA_CHAT_MODEL || 'llama3.2',
      messages,
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(completion.choices[0].message.content);
    return result;
  } catch (error) {
    console.error('Error checking booking confirmation:', error);
    // Fallback: simple keyword check
    const lowerMessage = userMessage.toLowerCase();
    return {
      wantsToBook: lowerMessage.includes('yes') || 
                   lowerMessage.includes('book') || 
                   lowerMessage.includes('proceed') ||
                   lowerMessage.includes('ok') ||
                   lowerMessage.includes('sure'),
      selectedDoctor: null,
      selectedDate: null
    };
  }
}

