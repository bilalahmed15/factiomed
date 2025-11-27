import { db } from '../config/database.js';
import { openai } from './llm.js';
import { randomUUID } from 'crypto';

// Simple cosine similarity (for small datasets)
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Detect language from query (simple heuristic)
function detectLanguage(query) {
  const germanWords = ['der', 'die', 'das', 'und', 'ist', 'für', 'von', 'mit', 'auf', 'zu'];
  const frenchWords = ['le', 'la', 'les', 'et', 'est', 'pour', 'de', 'avec', 'sur', 'à'];
  
  const lowerQuery = query.toLowerCase();
  const germanCount = germanWords.filter(word => lowerQuery.includes(word)).length;
  const frenchCount = frenchWords.filter(word => lowerQuery.includes(word)).length;
  
  if (germanCount > frenchCount && germanCount > 0) return 'de';
  if (frenchCount > germanCount && frenchCount > 0) return 'fr';
  return 'en'; // Default to English
}

// Get query embedding and find similar chunks
export async function searchKnowledgeBase(query, topK = 5, preferredLanguage = null) {
  try {
    // Detect language if not provided
    const language = preferredLanguage || detectLanguage(query);
    
    // Create query embedding
    const response = await openai.embeddings.create({
      model: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
      input: query
    });
    const queryEmbedding = response.data[0].embedding;
    
    // Get chunks, prefer matching language but include others if needed
    let chunks = db.prepare('SELECT * FROM knowledge_chunks').all();
    
    // Filter by language if available, otherwise get all
    const languageChunks = chunks.filter(c => c.language === language);
    const otherChunks = chunks.filter(c => c.language !== language);
    
    // Prioritize language-matched chunks
    const allChunks = [...languageChunks, ...otherChunks];
    
    const scored = allChunks.map(chunk => {
      const chunkEmbedding = JSON.parse(chunk.embedding);
      let similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);
      
      // Boost similarity for matching language
      if (chunk.language === language) {
        similarity *= 1.1; // 10% boost
      }
      
      return {
        ...chunk,
        similarity
      };
    });
    
    // Sort by similarity and return top K
    scored.sort((a, b) => b.similarity - a.similarity);
    
    return scored.slice(0, topK).map(item => ({
      id: item.id,
      url: item.url,
      page_title: item.page_title,
      heading_path: item.heading_path,
      chunk_text: item.chunk_text,
      language: item.language || 'en',
      similarity: item.similarity
    }));
  } catch (error) {
    console.error('Error searching knowledge base:', error);
    throw error;
  }
}

// Generate RAG response
export async function generateRAGResponse(userMessage, sessionId = null) {
  try {
    // Search knowledge base - reduced to 6 chunks for faster response
    const relevantChunks = await searchKnowledgeBase(userMessage, 6);
    
    // Check if we have any content
    if (!relevantChunks || relevantChunks.length === 0) {
      return {
        response: "I don't have access to the website content yet. Please have an administrator crawl the Functiomed.ch website first by calling the /api/admin/crawl endpoint. Once the knowledge base is populated, I'll be able to answer questions about your services.",
        sources: []
      };
    }
    
    // Build context from chunks
    const context = relevantChunks.map((chunk, idx) => {
      return `[Source ${idx + 1}: ${chunk.page_title} (${chunk.url})]\n${chunk.chunk_text}`;
    }).join('\n\n---\n\n');
    
    const sources = relevantChunks.map(chunk => ({
      url: chunk.url,
      title: chunk.page_title,
      heading: chunk.heading_path,
      snippet: chunk.chunk_text.substring(0, 200) + '...'
    }));
    
    // Create prompt with improved structure guidance
    const systemPrompt = `You are Madi, a friendly and professional medical assistant for Functiomed.ch, a medical practice in Zurich specializing in functional medicine.

Your responses must be:
- Clear and concise: Get to the point quickly, avoid unnecessary repetition
- Well-structured: Use proper spacing and line breaks, clear headings in ALL CAPS or Title Case
- Professional but friendly: Medical practice tone - respectful, helpful, warm, and conversational
- Accurate: Base answers primarily on the provided context from the website, but you can also provide general medical advice when appropriate
- Complete: Include all relevant details but in an organized way
- Empathetic: Show understanding and care, especially for health concerns

CRITICAL FORMATTING RULES:
1. Start with a brief, direct answer (1-2 sentences)
2. Use markdown headings (# Heading) for section headings - they will be displayed as bold
3. Use markdown bold (**text**) for important terms or emphasis - they will be displayed as bold
4. Use simple dashes (-) or numbers (1., 2., 3.) for lists
5. Keep paragraphs to 3-4 sentences maximum with proper line breaks between paragraphs
6. End with a helpful next step or invitation if appropriate
7. NEVER list sources at the end - they are provided separately

You CAN use markdown formatting:
- # Heading (will be bold)
- **Bold text** (will be bold)
- *Italic text* (will be italic)

When answering general health questions (like "how can I get relief from back pain"):
- If the website content provides relevant information, use it as the primary source
- You can supplement with general medical knowledge when appropriate
- Always be empathetic and helpful
- End by suggesting they consult with a healthcare provider for personalized advice
- Offer to help book an appointment if relevant

When asked about booking appointments:
- Acknowledge the request professionally
- Explain you can guide them through the booking process
- Mention what information will be needed (service type, preferred date/time, patient details)
- Invite them to proceed with booking

IMPORTANT:
- Do NOT include "Sources:" section at the end
- You CAN use markdown for formatting - headings with # and bold with **
- Do NOT repeat the same information multiple times
- Keep responses focused and avoid fluff
- Be empathetic but concise
- Use proper spacing: blank lines between sections, single line breaks between paragraphs
- For general health advice questions, provide helpful information while encouraging professional consultation`;

    const userPrompt = `Context from Functiomed.ch website:

${context}

User Question: ${userMessage}

Provide a well-structured, friendly, and professional response using markdown formatting:
- Use # for section headings (e.g., # BACK PAIN RELIEF)
- Use ** for bold text (e.g., **Important term**)
- Use - for lists
- Use proper line breaks and spacing
- Start with a brief, empathetic answer, then organize with clear headings
- If the question is about general health advice (like relief from pain, treatment options, etc.), provide helpful information while encouraging professional consultation
- Always end with an offer to help book an appointment if relevant

Be conversational and warm, like you're talking to a friend, but maintain professionalism.

Example format:
# BACK PAIN RELIEF

I understand back pain can be really uncomfortable. Here are some approaches that may help:

**Self-Care Strategies**:
- Item one
- Item two

**When to Seek Professional Help**: Details here.

Would you like me to help you book an appointment with one of our specialists?`;

    // Call LLM with optimized parameters for faster response
    const completion = await openai.chat.completions.create({
      model: process.env.OLLAMA_CHAT_MODEL || 'llama3.2',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7, // Higher for more conversational and helpful responses
      max_tokens: 600    // Reduced for faster generation
    });
    
    let botResponse = completion.choices[0].message.content;
    
    // Convert markdown to HTML - aggressive conversion and cleanup
    // Process in multiple passes to catch all patterns
    
    // PASS 1: Convert markdown bold (**text**) - must do this FIRST
    // Use non-greedy matching to catch multiple instances per line
    botResponse = botResponse.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    botResponse = botResponse.replace(/__([^_]+?)__/g, '<strong>$1</strong>');
    
    // PASS 2: Convert markdown headings (#, ##, ###, etc.) - process line by line
    let lines = botResponse.split('\n');
    let processedLines = [];
    
    for (let line of lines) {
      // Convert headings at start of line (any number of #)
      if (line.trim().match(/^#{1,6}\s/)) {
        line = line.replace(/^(\s*)#{1,6}\s*(.+?)$/g, (match, indent, text) => {
          const cleanText = text.trim().replace(/\*\*/g, ''); // Remove any remaining **
          return `${indent}<strong style="font-weight: 600; font-size: 1.1em; display: block; margin: 0.75em 0 0.5em 0;">${cleanText}</strong>`;
        });
      }
      
      // Convert markdown bullets (* item) to dashes
      if (line.match(/^\s*[*•]\s+/) && !line.includes('<')) {
        line = line.replace(/^(\s*)[*•]\s+/, '$1- ');
      }
      
      processedLines.push(line);
    }
    
    botResponse = processedLines.join('\n');
    
    // PASS 3: Final cleanup - remove ALL remaining markdown symbols
    // Split into HTML tags and text content
    const parts = botResponse.split(/(<[^>]+>)/);
    const cleanedParts = parts.map((part, idx) => {
      // Skip HTML tags (odd indices are tags)
      if (idx % 2 === 1) return part;
      
      // Process text content - remove ALL markdown symbols
      return part
        .replace(/#/g, '')           // Remove ALL # symbols
        .replace(/\*\*/g, '')        // Remove ALL ** pairs
        .replace(/\*/g, '')          // Remove ALL remaining * symbols
        .replace(/`/g, '');          // Remove backticks
    });
    
    botResponse = cleanedParts.join('');
    
    // PASS 4: One more pass to catch any ** that might be in headings or other places
    // Convert any remaining **text** patterns that weren't caught
    botResponse = botResponse.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    
    // PASS 5: Final removal of any remaining markdown symbols
    botResponse = botResponse.replace(/#/g, '');
    botResponse = botResponse.replace(/\*\*/g, '');
    botResponse = botResponse.replace(/\*/g, '');
    
    // Normalize whitespace
    botResponse = botResponse
      .replace(/\n\n\n+/g, '\n\n')  // Multiple line breaks to double
      .replace(/[ \t]{2,}/g, ' ')  // Multiple spaces to single
      .trim();
    
    // Store chat session
    if (sessionId) {
      db.prepare(`
        INSERT INTO chat_sessions (id, session_id, user_message, bot_response, sources)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        sessionId,
        userMessage,
        botResponse,
        JSON.stringify(sources)
      );
    }
    
    return {
      response: botResponse,
      sources
    };
  } catch (error) {
    console.error('Error generating RAG response:', error);
    throw error;
  }
}

