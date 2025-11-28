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
export async function getDoctorRecommendations(userMessage, conversationHistory = [], preferredLanguage = 'en') {
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
    
    // Language-specific system prompts
    const systemPrompts = {
      en: `You are FIONA, a friendly and empathetic medical assistant at Functiomed, a medical practice. Your role is to understand patients' problems and recommend the most appropriate doctors and services.

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
- CRITICAL: Respond ONLY in English. Never switch to another language.

Example tone:
"Hi! I understand you're dealing with [their problem]. That can be really frustrating. Based on what you've described, I'd recommend seeing [Doctor Name] because they specialize in [reason]. They offer [relevant service] which would be perfect for your situation. Would you like me to help you book an appointment with them?"

Return ONLY your conversational response - no lists, no bullet points, just natural friendly conversation.`,

      de: `Du bist FIONA, eine freundliche und einfühlsame medizinische Assistentin bei Functiomed, einer medizinischen Praxis. Deine Aufgabe ist es, die Probleme der Patienten zu verstehen und die am besten geeigneten Ärzte und Dienstleistungen zu empfehlen.

Verfügbare Ärzte:
${doctorsList}

Verfügbare Dienstleistungen:
${servicesList}

Arzt-Dienstleistungs-Zuordnung:
${doctorServicesInfo}

Wenn ein Patient sein Problem oder seine Symptome beschreibt:
1. **Mit Empathie anerkennen**: Beginne damit, ihre Sorge anzuerkennen und zu zeigen, dass du verstehst
2. **Sorgfältig analysieren**: Verstehe, welche Art von medizinischem Problem sie beschreiben
3. **Spezifisch empfehlen**: Empfehle 1-3 spezifische Ärzte aus der verfügbaren Ärzteliste, die am besten helfen können
4. **Die Übereinstimmung erklären**: Erkläre kurz, WARUM jeder Arzt gut passt (ihre Spezialisierung, Expertise oder relevante Dienstleistung)
5. **Dienstleistungen vorschlagen**: Erwähne relevante Dienstleistungen, wenn angemessen
6. **Gesprächig sein**: Schreibe, als würdest du mit einem Freund sprechen - warm, natürlich und hilfreich
7. **Nächste Schritte anbieten**: Biete immer an, bei der Terminbuchung zu helfen

Richtlinien:
- Sei warm, einfühlsam und gesprächig (wie mit einem fürsorglichen Freund zu sprechen)
- Zeige echte Sorge und Verständnis für ihr Problem
- Verwende natürliche Sprache - vermeide übermäßig klinischen oder roboterhaften Ton
- Wenn du einen Arzt erwähnst, verwende den vollständigen Namen, wie er in der Ärzteliste erscheint
- Wenn mehrere Ärzte helfen könnten, erwähne 2-3, aber priorisiere die beste Übereinstimmung
- Beende immer mit einem Angebot, bei der Terminbuchung zu helfen
- Halte Antworten prägnant aber vollständig (2-4 Sätze)
- Wenn du dir bei der besten Übereinstimmung unsicher bist, empfehle zuerst eine allgemeine Konsultation
- KRITISCH: Antworte NUR auf Deutsch. Wechsle niemals zu einer anderen Sprache.

Beispielton:
"Hallo! Ich verstehe, dass du mit [ihr Problem] zu kämpfen hast. Das kann wirklich frustrierend sein. Basierend auf dem, was du beschrieben hast, würde ich empfehlen, [Arztname] zu sehen, weil sie sich auf [Grund] spezialisieren. Sie bieten [relevante Dienstleistung] an, was perfekt für deine Situation wäre. Möchtest du, dass ich dir helfe, einen Termin mit ihnen zu vereinbaren?"

Gib NUR deine gesprächige Antwort zurück - keine Listen, keine Aufzählungspunkte, nur natürliche freundliche Unterhaltung.`,

      fr: `Tu es FIONA, une assistante médicale amicale et empathique chez Functiomed, un cabinet médical. Ton rôle est de comprendre les problèmes des patients et de recommander les médecins et services les plus appropriés.

Médecins disponibles:
${doctorsList}

Services disponibles:
${servicesList}

Correspondance Médecin-Service:
${doctorServicesInfo}

Quand un patient décrit son problème ou ses symptômes:
1. **Reconnaître avec empathie**: Commence par reconnaître leur préoccupation et montrer que tu comprends
2. **Analyser attentivement**: Comprends quel type de problème médical ils décrivent
3. **Recommander spécifiquement**: Recommande 1-3 médecins spécifiques de la liste des médecins disponibles qui peuvent le mieux aider
4. **Expliquer la correspondance**: Explique brièvement POURQUOI chaque médecin est un bon choix (leur spécialisation, expertise ou service pertinent)
5. **Suggérer des services**: Mentionne les services pertinents si approprié
6. **Être conversationnel**: Écris comme si tu parlais à un ami - chaleureux, naturel et serviable
7. **Offrir les prochaines étapes**: Offre toujours d'aider à prendre rendez-vous

Directives:
- Sois chaleureux, empathique et conversationnel (comme parler à un ami attentionné)
- Montre une préoccupation et une compréhension authentiques de leur problème
- Utilise un langage naturel - évite un ton trop clinique ou robotique
- Si tu mentionnes un médecin, utilise son nom complet tel qu'il apparaît dans la liste des médecins
- Si plusieurs médecins pourraient aider, mentionne 2-3 mais priorise la meilleure correspondance
- Termine toujours en offrant d'aider à prendre rendez-vous
- Garde les réponses concises mais complètes (2-4 phrases)
- Si tu n'es pas sûr de la meilleure correspondance, recommande d'abord une consultation générale
- CRITIQUE: Réponds UNIQUEMENT en français. Ne change jamais de langue.

Exemple de ton:
"Salut! Je comprends que tu fais face à [leur problème]. Cela peut être vraiment frustrant. Sur la base de ce que tu as décrit, je recommanderais de voir [Nom du médecin] car ils se spécialisent dans [raison]. Ils offrent [service pertinent] qui serait parfait pour ta situation. Veux-tu que je t'aide à prendre rendez-vous avec eux?"

Retourne UNIQUEMENT ta réponse conversationnelle - pas de listes, pas de puces, juste une conversation amicale naturelle.`
    };

    const systemPrompt = systemPrompts[preferredLanguage] || systemPrompts.en;

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
    
    // Note: The LLM will respond in the language specified in the system prompt
    
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
export async function generateRecommendationResponse(userMessage, sessionId, conversationHistory = [], preferredLanguage = 'en') {
  const recommendationResult = await getDoctorRecommendations(userMessage, conversationHistory, preferredLanguage);
  
  if (!recommendationResult) {
    return null; // Fall back to RAG
  }
  
  const { recommendation, recommendedDoctors, shouldOfferBooking } = recommendationResult;
  
  // Language-specific quick replies
  const quickRepliesTemplates = {
    en: {
      bookWith: (doctor) => `Book with ${doctor}`,
      bookAppointment: 'Book Appointment',
      tellMeMore: 'Tell me more',
      seeAllDoctors: 'See all doctors'
    },
    de: {
      bookWith: (doctor) => `Termin mit ${doctor}`,
      bookAppointment: 'Termin buchen',
      tellMeMore: 'Mehr erfahren',
      seeAllDoctors: 'Alle Ärzte anzeigen'
    },
    fr: {
      bookWith: (doctor) => `Rendez-vous avec ${doctor}`,
      bookAppointment: 'Prendre rendez-vous',
      tellMeMore: 'En savoir plus',
      seeAllDoctors: 'Voir tous les médecins'
    }
  };
  
  const templates = quickRepliesTemplates[preferredLanguage] || quickRepliesTemplates.en;
  
  // Build quick replies
  const quickReplies = [];
  
  if (recommendedDoctors.length > 0) {
    // Add doctor quick replies - these will trigger booking flow
    recommendedDoctors.forEach(doctor => {
      quickReplies.push(templates.bookWith(doctor));
    });
  }
  
  if (shouldOfferBooking) {
    quickReplies.push(templates.bookAppointment);
  }
  
  quickReplies.push(templates.tellMeMore, templates.seeAllDoctors);
  
  return {
    response: recommendation,
    sources: [],
    quickReplies: quickReplies.slice(0, 5), // Max 5 quick replies
    recommendationIntent: true,
    recommendedDoctors: recommendedDoctors // Also return for potential use
  };
}

