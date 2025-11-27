import { openai } from './llm.js';
import { getDoctors, getServices } from './websiteData.js';
import { getAvailableSlots } from './booking.js';

/**
 * Detect if user is describing a medical problem/condition AND wants a doctor recommendation
 * (vs. asking for general health advice/information)
 */
export async function detectProblemDescription(message, conversationHistory = []) {
  const lowerMessage = message.toLowerCase().trim();
  
  // Questions asking for general advice/information (should go to RAG, not recommendations)
  const informationalPatterns = [
    /how\s+(can|do|to|will|should)\s+(i|you|one)/i,
    /what\s+(is|are|can|should|do|does)/i,
    /tell\s+me\s+(about|more)/i,
    /explain\s+(to\s+me)?/i,
    /information\s+(about|on)/i,
    /what\s+are\s+(the|some)/i,
    /how\s+does\s+/i,
    /how\s+to\s+/i,
    /ways?\s+to\s+/i,
    /relief\s+(from|with|for)/i,
    /treatment\s+(for|of)/i,
    /cure\s+(for|of)/i,
    /help\s+with\s+(relief|pain|symptoms)/i
  ];
  
  // Check if this is an informational question (should use RAG)
  const isInformationalQuestion = informationalPatterns.some(pattern => pattern.test(message));
  
  if (isInformationalQuestion) {
    console.log('Informational question detected - will use RAG instead of recommendations');
    return false; // Don't trigger recommendations, let it go to RAG
  }
  
  // Keywords that suggest a request for doctor recommendation/appointment
  const recommendationKeywords = [
    'recommend', 'suggest', 'which doctor', 'what doctor', 'who should',
    'need to see', 'should see', 'want to see', 'looking for',
    'appointment', 'book', 'schedule', 'visit', 'consultation',
    'need help', 'need appointment', 'want appointment'
  ];
  
  // Problem keywords that suggest needing a doctor (not just information)
  const problemKeywords = [
    'pain', 'ache', 'hurt', 'sore', 'discomfort',
    'problem', 'issue', 'symptom', 'condition', 'injury',
    'problem with', 'having trouble', 'experiencing',
    'suffering from', 'dealing with', 'have a',
    'feel', 'feeling', 'cannot', "can't", 'unable',
    'difficulty', 'difficult', 'struggling', 'concerned about',
    'worry about', 'worried', 'need help with',
    'check', 'examine', 'evaluate', 'diagnose'
  ];
  
  // Check if message contains problem indicators AND recommendation intent
  const hasProblemKeywords = problemKeywords.some(keyword => 
    lowerMessage.includes(keyword)
  );
  
  const hasRecommendationIntent = recommendationKeywords.some(keyword =>
    lowerMessage.includes(keyword)
  );
  
  // Check if message is asking about a specific condition AND wants to see someone
  const isConditionQuery = /\b(what|how|why|when|where)\b.*\b(pain|problem|issue|symptom|condition|injury)\b/i.test(message);
  
  // Check if message describes symptoms or problems AND wants to see someone
  const isSymptomDescription = /\b(have|having|feel|feeling|experience|suffering|dealing)\b.*\b(pain|problem|issue|symptom|ache|discomfort|trouble)\b/i.test(message);
  
  // Only trigger recommendations if:
  // 1. Has problem keywords AND recommendation intent, OR
  // 2. Has problem keywords AND explicitly wants to see/book someone, OR
  // 3. Describes symptoms AND wants appointment/doctor
  const shouldRecommend = (hasProblemKeywords && hasRecommendationIntent) ||
                          (hasProblemKeywords && (lowerMessage.includes('see') || lowerMessage.includes('doctor') || lowerMessage.includes('appointment'))) ||
                          (isSymptomDescription && hasRecommendationIntent);
  
  return shouldRecommend;
}

/**
 * Get doctor recommendations based on medical problem description
 */
export async function getDoctorRecommendations(userMessage, conversationHistory = []) {
  try {
    const doctors = getDoctors();
    const services = getServices();
    
    if (doctors.length === 0 || services.length === 0) {
      return null; // No doctors/services available, fall back to RAG
    }
    
    // Build context about available doctors and services
    const doctorsList = doctors.map(d => `- ${d.name}`).join('\n');
    const servicesList = services.map(s => `- ${s.name}`).join('\n');
    
    // Get available slots to understand which doctors offer which services
    const allSlots = getAvailableSlots({});
    const doctorServiceMap = {};
    
    for (const slot of allSlots) {
      if (!doctorServiceMap[slot.provider_name]) {
        doctorServiceMap[slot.provider_name] = new Set();
      }
      doctorServiceMap[slot.provider_name].add(slot.service_type);
    }
    
    const doctorServicesInfo = Object.entries(doctorServiceMap)
      .map(([doctor, services]) => {
        const serviceList = Array.from(services).join(', ');
        return `${doctor}: ${serviceList}`;
      })
      .join('\n');
    
    const systemPrompt = `You are Madi, a friendly and empathetic medical assistant at Functiomed, a medical practice. Your role is to understand patients' problems and recommend the most appropriate doctors and services.

Available Doctors:
${doctorsList}

Available Services:
${servicesList}

Doctor-Service Mapping:
${doctorServicesInfo}

When a patient describes their problem or symptoms:
1. **Acknowledge with empathy**: Start by acknowledging their concern and showing you understand
2. **Analyze carefully**: Understand what type of medical issue they're describing
3. **Recommend specifically**: Recommend 1-3 specific doctors from the available doctors list who can best help
4. **Explain the match**: Briefly explain WHY each doctor is a good fit (their specialization, expertise, or relevant service)
5. **Suggest services**: Mention relevant services if appropriate
6. **Be conversational**: Write like you're talking to a friend - warm, natural, and helpful
7. **Offer next steps**: Always offer to help book an appointment

Guidelines:
- Be warm, empathetic, and conversational (like talking to a caring friend)
- Show genuine concern and understanding for their problem
- Use natural language - avoid overly clinical or robotic tone
- If you mention a doctor, use their full name as it appears in the doctors list
- If multiple doctors could help, mention 2-3 but prioritize the best match
- Always end by offering to help book an appointment
- Keep responses concise but complete (2-4 sentences)
- If you're unsure about the best match, recommend general consultation first

Example tone:
"Hi! I understand you're dealing with [their problem]. That can be really frustrating. Based on what you've described, I'd recommend seeing [Doctor Name] because they specialize in [reason]. They offer [relevant service] which would be perfect for your situation. Would you like me to help you book an appointment with them?"

Return ONLY your conversational response - no lists, no bullet points, just natural friendly conversation.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-6), // Last 6 messages for context
      { role: 'user', content: userMessage }
    ];
    
    const completion = await openai.chat.completions.create({
      model: process.env.OLLAMA_CHAT_MODEL || 'llama3.2',
      messages: messages,
      temperature: 0.8, // More conversational and empathetic
      max_tokens: 400
    });
    
    const recommendation = completion.choices[0]?.message?.content?.trim();
    
    if (!recommendation || recommendation.length < 20) {
      return null; // Invalid response, fall back to RAG
    }
    
    // Extract recommended doctors from the response
    // Try to match doctor names mentioned in the recommendation
    const recommendedDoctors = [];
    const recommendationLower = recommendation.toLowerCase();
    
    // First, try exact name matching
    for (const doctor of doctors) {
      const doctorNameLower = doctor.name.toLowerCase();
      const doctorNameParts = doctor.name.split(/\s+/);
      
      // Check if full name or significant parts are mentioned
      if (recommendationLower.includes(doctorNameLower)) {
        recommendedDoctors.push(doctor.name);
        continue;
      }
      
      // Check if last name is mentioned (common when referring to doctors)
      if (doctorNameParts.length > 1) {
        const lastName = doctorNameParts[doctorNameParts.length - 1].toLowerCase();
        if (lastName.length > 3 && recommendationLower.includes(lastName)) {
          recommendedDoctors.push(doctor.name);
          continue;
        }
      }
      
      // Check if "Dr." + last name is mentioned
      if (doctorNameParts.length > 1) {
        const lastName = doctorNameParts[doctorNameParts.length - 1].toLowerCase();
        if (recommendationLower.includes(`dr. ${lastName}`) || 
            recommendationLower.includes(`dr ${lastName}`)) {
          recommendedDoctors.push(doctor.name);
        }
      }
    }
    
    // If no doctors were explicitly mentioned, try to match based on services
    if (recommendedDoctors.length === 0) {
      // Get services mentioned in recommendation
      const mentionedServices = [];
      for (const service of services) {
        const serviceLower = service.name.toLowerCase();
        if (recommendationLower.includes(serviceLower)) {
          mentionedServices.push(service.name);
        }
      }
      
      // Find doctors who offer these services
      if (mentionedServices.length > 0) {
        for (const service of mentionedServices) {
          const slots = getAvailableSlots({ service_type: service });
          const doctorsForService = [...new Set(slots.map(s => s.provider_name))];
          recommendedDoctors.push(...doctorsForService.slice(0, 2)); // Top 2 doctors per service
        }
      } else {
        // If no specific service match, recommend doctors who offer general consultation
        const generalSlots = getAvailableSlots({ service_type: 'General Consultation' });
        const generalDoctors = [...new Set(generalSlots.map(s => s.provider_name))];
        recommendedDoctors.push(...generalDoctors.slice(0, 2));
      }
    }
    
    // Remove duplicates and limit to 3
    const uniqueDoctors = [...new Set(recommendedDoctors)].slice(0, 3);
    
    return {
      recommendation: recommendation,
      recommendedDoctors: uniqueDoctors.slice(0, 3), // Max 3 doctors
      shouldOfferBooking: true
    };
    
  } catch (error) {
    console.error('Error getting doctor recommendations:', error);
    return null; // Fall back to RAG on error
  }
}

/**
 * Generate a friendly response with doctor recommendations
 */
export async function generateRecommendationResponse(userMessage, sessionId, conversationHistory = []) {
  const recommendationResult = await getDoctorRecommendations(userMessage, conversationHistory);
  
  if (!recommendationResult) {
    return null; // Fall back to RAG
  }
  
  const { recommendation, recommendedDoctors, shouldOfferBooking } = recommendationResult;
  
  // Build quick replies
  const quickReplies = [];
  
  if (recommendedDoctors.length > 0) {
    // Add doctor quick replies - these will trigger booking flow
    recommendedDoctors.forEach(doctor => {
      quickReplies.push(`Book with ${doctor}`);
    });
  }
  
  if (shouldOfferBooking) {
    quickReplies.push('Book Appointment');
  }
  
  quickReplies.push('Tell me more', 'See all doctors');
  
  return {
    response: recommendation,
    sources: [],
    quickReplies: quickReplies.slice(0, 5), // Max 5 quick replies
    recommendationIntent: true,
    recommendedDoctors: recommendedDoctors // Also return for potential use
  };
}

