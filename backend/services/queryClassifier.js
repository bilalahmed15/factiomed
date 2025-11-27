import { openai } from './llm.js';

/**
 * Classify user query intent using OpenAI
 * Returns: 'informational' | 'booking' | 'recommendation' | 'doctor_query' | 'service_query'
 */
export async function classifyQueryIntent(message, conversationHistory = []) {
  try {
    const systemPrompt = `You are a query classifier for a medical chatbot. Classify user queries into one of these categories:

1. **informational** - User wants general information, explanation, or advice (e.g., "Tell me about physiotherapy", "How does infusion therapy work?", "What is acupuncture?", "How can I get relief from back pain?")

2. **booking** - User wants to book an appointment (e.g., "I want to book an appointment", "Book me a slot", "Schedule an appointment", "I need to see a doctor")

3. **recommendation** - User describes a problem and wants doctor recommendations (e.g., "I have back pain, which doctor should I see?", "I'm experiencing knee pain, recommend someone", "Who can help with my condition?")

4. **doctor_query** - User asks specifically about doctors (e.g., "Which doctors are available?", "List all doctors", "Who are the doctors?")

5. **service_query** - User asks specifically about services (e.g., "What services do you offer?", "List all services", "Which services are available?")

Return ONLY the category name as a single word (informational, booking, recommendation, doctor_query, or service_query).`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-3), // Last 3 messages for context
      { role: 'user', content: message }
    ];

    const completion = await openai.chat.completions.create({
      model: process.env.OLLAMA_CHAT_MODEL || 'llama3.2',
      messages: messages,
      temperature: 0.1, // Low temperature for consistent classification
      max_tokens: 10
    });

    const classification = completion.choices[0]?.message?.content?.trim().toLowerCase();
    
    // Validate classification
    const validCategories = ['informational', 'booking', 'recommendation', 'doctor_query', 'service_query'];
    if (validCategories.includes(classification)) {
      console.log(`Query classified as: ${classification}`);
      return classification;
    }
    
    // Fallback: use simple keyword matching
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('tell me about') || 
        lowerMessage.includes('what is') || 
        lowerMessage.includes('explain') ||
        lowerMessage.includes('how does') ||
        lowerMessage.includes('information about')) {
      return 'informational';
    }
    
    if (lowerMessage.includes('book') || 
        lowerMessage.includes('appointment') || 
        lowerMessage.includes('schedule')) {
      return 'booking';
    }
    
    if (lowerMessage.includes('doctor') && (lowerMessage.includes('which') || lowerMessage.includes('who') || lowerMessage.includes('recommend'))) {
      return 'doctor_query';
    }
    
    if (lowerMessage.includes('service') && (lowerMessage.includes('which') || lowerMessage.includes('what'))) {
      return 'service_query';
    }
    
    // Default to informational for questions
    if (message.trim().endsWith('?') || lowerMessage.startsWith('how') || lowerMessage.startsWith('what') || lowerMessage.startsWith('tell')) {
      return 'informational';
    }
    
    return 'informational'; // Default fallback
  } catch (error) {
    console.error('Error classifying query intent:', error);
    // Fallback to informational on error
    return 'informational';
  }
}

