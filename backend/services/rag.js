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

// Detect language from query (improved heuristic)
export function detectLanguage(query) {
  if (!query || typeof query !== 'string') return 'en';
  
  const lowerQuery = query.toLowerCase();
  
  // German indicators
  const germanWords = ['der', 'die', 'das', 'und', 'ist', 'für', 'von', 'mit', 'auf', 'zu', 'sind', 'haben', 'kann', 'wird', 'wie', 'was', 'wo', 'wann', 'warum', 'öffnungszeiten', 'termin', 'arzt', 'ärzte', 'behandlung', 'kosten', 'versicherung'];
  const germanPatterns = [/ä|ö|ü/g, /ß/g, /ich|du|er|sie|es|wir|ihr/g];
  
  // French indicators
  const frenchWords = ['le', 'la', 'les', 'et', 'est', 'pour', 'de', 'avec', 'sur', 'à', 'un', 'une', 'des', 'dans', 'par', 'que', 'qui', 'quoi', 'comment', 'où', 'quand', 'pourquoi', 'heures', 'rendez-vous', 'médecin', 'traitement', 'coût', 'assurance'];
  const frenchPatterns = [/é|è|ê|ë|à|â|ç|ô|ù|û/g];
  
  // Count matches
  const germanCount = germanWords.filter(word => lowerQuery.includes(word)).length;
  const frenchCount = frenchWords.filter(word => lowerQuery.includes(word)).length;
  
  // Check for German-specific characters
  const germanCharMatches = germanPatterns.reduce((sum, pattern) => sum + (lowerQuery.match(pattern) || []).length, 0);
  const frenchCharMatches = frenchPatterns.reduce((sum, pattern) => sum + (lowerQuery.match(pattern) || []).length, 0);
  
  // Weighted scoring
  const germanScore = germanCount * 2 + germanCharMatches * 3;
  const frenchScore = frenchCount * 2 + frenchCharMatches * 3;
  
  if (germanScore > frenchScore && germanScore > 2) return 'de';
  if (frenchScore > germanScore && frenchScore > 2) return 'fr';
  return 'en'; // Default to English
}

// Query expansion for common terms
function expandQuery(query) {
  const lowerQuery = query.toLowerCase();
  const expansions = {
    // Hours/opening times
    'hours': ['opening hours', 'business hours', 'öffnungszeiten', 'opening times', 'hours of operation'],
    'opening hours': ['hours', 'business hours', 'öffnungszeiten', 'opening times', 'hours of operation'],
    'what are your hours': ['opening hours', 'business hours', 'öffnungszeiten', 'opening times'],
    'öffnungszeiten': ['opening hours', 'business hours', 'hours', 'opening times'],
    
    // Appointment/booking
    'appointment': ['booking', 'termin', 'schedule', 'book an appointment'],
    'book': ['appointment', 'booking', 'termin', 'schedule'],
    'termin': ['appointment', 'booking', 'book'],
    
    // Contact
    'contact': ['phone', 'email', 'address', 'kontakt', 'reach us'],
    'phone': ['contact', 'telephone', 'call', 'telefon'],
    
    // Services
    'services': ['angebot', 'treatments', 'what do you offer'],
    'treatments': ['services', 'angebot', 'what treatments'],
  };
  
  // Check if query matches any expansion key
  for (const [key, synonyms] of Object.entries(expansions)) {
    if (lowerQuery.includes(key)) {
      return [query, ...synonyms].join(' ');
    }
  }
  
  return query;
}

// Get query embedding and find similar chunks
export async function searchKnowledgeBase(query, topK = 5, preferredLanguage = null) {
  try {
    // Detect language if not provided
    const language = preferredLanguage || detectLanguage(query);
    
    // Expand query with synonyms for better matching
    const expandedQuery = expandQuery(query);
    
    // Create query embedding
    const response = await openai.embeddings.create({
      model: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
      input: expandedQuery
    });
    const queryEmbedding = response.data[0].embedding;
    
    // Get chunks, prefer matching language but include others if needed
    let chunks = db.prepare('SELECT * FROM knowledge_chunks').all();
    
    // Filter by language if available, otherwise get all
    const languageChunks = chunks.filter(c => c.language === language);
    const otherChunks = chunks.filter(c => c.language !== language);
    
    // Prioritize language-matched chunks
    const allChunks = [...languageChunks, ...otherChunks];
    
    // Extract keywords from query for text-based boosting
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    
    // Common term mappings for keyword matching
    const keywordMappings = {
      'hours': ['öffnungszeiten', 'opening', 'hours', 'business hours', 'opening times', '08:00', '18:00', 'montag', 'friday', 'freitag'],
      'opening': ['öffnungszeiten', 'opening', 'hours', 'business hours'],
      'öffnungszeiten': ['öffnungszeiten', 'opening', 'hours', 'business hours', '08:00', '18:00'],
      'contact': ['kontakt', 'phone', 'telefon', 'email', 'address'],
      'appointment': ['termin', 'appointment', 'booking', 'book'],
      'location': ['location', 'standort', 'adresse', 'address', 'where', 'wo', 'où', 'find', 'finden', 'trouver', 'maps', 'google maps', 'langgrütstrasse', 'zürich', 'zurich'],
      'address': ['adresse', 'address', 'standort', 'location', 'langgrütstrasse', 'zürich', 'zurich'],
      'where': ['where', 'wo', 'où', 'location', 'standort', 'adresse', 'address'],
    };
    
    const scored = allChunks.map(chunk => {
      const chunkEmbedding = JSON.parse(chunk.embedding);
      let similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);
      
      // Boost similarity for matching language
      if (chunk.language === language) {
        similarity *= 1.1; // 10% boost
      }
      
      // Keyword-based boosting for better matching
      const chunkTextLower = (chunk.chunk_text || '').toLowerCase();
      const pageTitleLower = (chunk.page_title || '').toLowerCase();
      const headingLower = (chunk.heading_path || '').toLowerCase();
      const combinedText = `${chunkTextLower} ${pageTitleLower} ${headingLower}`;
      
      // Check for keyword matches
      for (const [queryTerm, keywords] of Object.entries(keywordMappings)) {
        if (queryLower.includes(queryTerm)) {
          for (const keyword of keywords) {
            if (combinedText.includes(keyword)) {
              similarity += 0.15; // Significant boost for keyword match
              break;
            }
          }
        }
      }
      
      // Boost for direct word matches in query
      for (const word of queryWords) {
        if (combinedText.includes(word)) {
          similarity += 0.05; // Small boost for word match
        }
      }
      
      return {
        ...chunk,
        similarity
      };
    });
    
    // Sort by similarity and return top K (increased from 5 to 10 for better coverage)
    scored.sort((a, b) => b.similarity - a.similarity);
    
    // Return more chunks for better context (increased to 10)
    const chunksToReturn = Math.max(topK, 10);
    
    return scored.slice(0, chunksToReturn).map(item => ({
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
export async function generateRAGResponse(userMessage, sessionId = null, preferredLanguage = null) {
  try {
    // Use preferred language from frontend, or detect from user message
    const detectedLanguage = preferredLanguage || detectLanguage(userMessage);
    console.log(`Language for response: ${detectedLanguage} (${preferredLanguage ? 'user-selected' : 'auto-detected'}) for query: "${userMessage.substring(0, 50)}..."`);
    
    // Search knowledge base - increased to 10 chunks for better coverage
    const relevantChunks = await searchKnowledgeBase(userMessage, 10, detectedLanguage);
    
    // Language-specific fallback messages
    const fallbackMessages = {
      en: "I don't have access to the website content yet. Please have an administrator crawl the Functiomed.ch website first by calling the /api/admin/crawl endpoint. Once the knowledge base is populated, I'll be able to answer questions about your services.",
      de: "Ich habe noch keinen Zugriff auf die Website-Inhalte. Bitte lassen Sie einen Administrator zuerst die Functiomed.ch-Website durchsuchen, indem Sie den /api/admin/crawl-Endpunkt aufrufen. Sobald die Wissensdatenbank gefüllt ist, kann ich Fragen zu Ihren Dienstleistungen beantworten.",
      fr: "Je n'ai pas encore accès au contenu du site web. Veuillez demander à un administrateur de parcourir d'abord le site Functiomed.ch en appelant le point de terminaison /api/admin/crawl. Une fois la base de connaissances remplie, je pourrai répondre aux questions sur vos services."
    };
    
    // Check if we have any content
    if (!relevantChunks || relevantChunks.length === 0) {
      return {
        response: fallbackMessages[detectedLanguage] || fallbackMessages.en,
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
    
    // Language-specific system prompts
    const systemPrompts = {
      en: `You are FIONA, a friendly and professional medical assistant for Functiomed.ch, a medical practice in Zurich specializing in functional medicine.

Your responses must be:
- STRICTLY question-focused: Answer ONLY the exact question asked. If asked about hours, provide ONLY hours information. Do NOT add any unrelated topics, suggestions, or additional information.
- Clear and concise: Get to the point quickly, avoid unnecessary repetition
- Well-structured: Use proper spacing and line breaks, clear headings in ALL CAPS or Title Case
- Professional but friendly: Medical practice tone - respectful, helpful, warm, and conversational
- Accurate: ALWAYS base answers on the provided context from the website. If the context contains the information, use it directly. Only provide general advice if the context doesn't contain the specific information requested
- Complete: Include all relevant details for the question asked, but nothing beyond that
- Empathetic: Show understanding and care, especially for health concerns
- CRITICAL: Respond ONLY in English. Never switch to another language.

CRITICAL FORMATTING RULES:
1. Start with a brief, direct answer (1-2 sentences)
2. Use markdown headings (# Heading) for section headings - they will be displayed as bold
3. Use markdown bold (**text**) for important terms or emphasis - they will be displayed as bold
4. Use simple dashes (-) or numbers (1., 2., 3.) for lists
5. Keep paragraphs to 3-4 sentences maximum with proper line breaks between paragraphs
6. End with a helpful next step or invitation if appropriate
7. NEVER list sources at the end - they are provided separately

CRITICAL RULES - STRICTLY ENFORCE:
- Answer ONLY the question asked. If the user asks "What are your hours?", provide ONLY hours information. Do NOT mention other services, treatments, or topics.
- Do NOT add suggestions, recommendations, or additional information unless explicitly asked
- Do NOT include "next steps" or "other questions" unless the user asks for them
- ALWAYS check the provided context FIRST before saying information is not available
- If the context contains the answer, extract and present it clearly - do NOT say you couldn't find it
- Stay strictly on topic. If the question is narrow, keep the answer narrow.
- Do NOT include "Sources:" section at the end
- You CAN use markdown for formatting - headings with # and bold with **
- Do NOT repeat the same information multiple times
- Keep responses focused and avoid fluff
- Be empathetic but concise
- Use proper spacing: blank lines between sections, single line breaks between paragraphs
- IMPORTANT: When users ask about location, address, or "where", ALWAYS include the Google Maps link (https://maps.app.goo.gl/Wqm6sfWQUJUC1t1N6) along with the address and description`,

      de: `Du bist FIONA, eine freundliche und professionelle medizinische Assistentin für Functiomed.ch, eine medizinische Praxis in Zürich, die sich auf funktionelle Medizin spezialisiert hat.

Deine Antworten müssen sein:
- STRENG fragenfokussiert: Beantworte NUR die exakt gestellte Frage. Wenn nach Öffnungszeiten gefragt wird, gib NUR Informationen zu Öffnungszeiten. Füge KEINE unverwandten Themen, Vorschläge oder zusätzliche Informationen hinzu.
- Klar und prägnant: Komm schnell zum Punkt, vermeide unnötige Wiederholungen
- Gut strukturiert: Verwende angemessene Abstände und Zeilenumbrüche, klare Überschriften in GROSSBUCHSTABEN oder Title Case
- Professionell aber freundlich: Medizinischer Praxiston - respektvoll, hilfreich, warm und gesprächig
- Genau: STÜTZE Antworten IMMER auf den bereitgestellten Kontext von der Website. Wenn der Kontext die Information enthält, verwende sie direkt. Ergänze nur allgemeines Wissen, wenn der Kontext die spezifische Information nicht enthält
- Vollständig: Enthalte alle relevanten Details für die gestellte Frage, aber nichts darüber hinaus
- Einfühlsam: Zeige Verständnis und Fürsorge, besonders bei Gesundheitsproblemen
- KRITISCH: Antworte NUR auf Deutsch. Wechsle niemals zu einer anderen Sprache.

KRITISCHE FORMATIERUNGSREGELN:
1. Beginne mit einer kurzen, direkten Antwort (1-2 Sätze)
2. Verwende Markdown-Überschriften (# Überschrift) für Abschnittsüberschriften - sie werden als fett angezeigt
3. Verwende Markdown-Fettdruck (**Text**) für wichtige Begriffe oder Betonung - wird als fett angezeigt
4. Verwende einfache Striche (-) oder Zahlen (1., 2., 3.) für Listen
5. Halte Absätze auf 3-4 Sätze maximal mit angemessenen Zeilenumbrüchen zwischen Absätzen
6. Beende mit einem hilfreichen nächsten Schritt oder einer Einladung, wenn angemessen
7. NIEMALS Quellen am Ende auflisten - sie werden separat bereitgestellt

KRITISCHE REGELN - STRENG EINHALTEN:
- Beantworte NUR die gestellte Frage. Wenn der Nutzer "Wie sind Ihre Öffnungszeiten?" fragt, gib NUR Informationen zu Öffnungszeiten. Erwähne KEINE anderen Dienstleistungen, Behandlungen oder Themen.
- Füge KEINE Vorschläge, Empfehlungen oder zusätzliche Informationen hinzu, es sei denn, sie werden ausdrücklich verlangt
- Füge KEINE "nächsten Schritte" oder "weitere Fragen" hinzu, es sei denn, der Nutzer fragt danach
- PRÜFE IMMER zuerst den bereitgestellten Kontext, bevor du sagst, dass Informationen nicht verfügbar sind
- Wenn der Kontext die Antwort enthält, extrahiere und präsentiere sie klar - sage NICHT, dass du sie nicht finden konntest
- Bleibe streng beim Thema. Wenn die Frage eng ist, halte die Antwort ebenso eng.
- Füge KEIN "Quellen:"-Abschnitt am Ende ein
- Du KANNST Markdown zur Formatierung verwenden - Überschriften mit # und Fettdruck mit **
- Wiederhole NICHT dieselben Informationen mehrmals
- Halte Antworten fokussiert und vermeide Füllmaterial
- Sei einfühlsam aber prägnant
- Verwende angemessene Abstände: Leerzeilen zwischen Abschnitten, einzelne Zeilenumbrüche zwischen Absätzen
- WICHTIG: Wenn Nutzer nach Standort, Adresse oder "wo" fragen, füge IMMER den Google Maps-Link (https://maps.app.goo.gl/Wqm6sfWQUJUC1t1N6) zusammen mit der Adresse und Beschreibung ein`,

      fr: `Tu es FIONA, une assistante médicale amicale et professionnelle pour Functiomed.ch, un cabinet médical à Zurich spécialisé en médecine fonctionnelle.

Tes réponses doivent être:
- STRICTEMENT centrées sur la question: Réponds UNIQUEMENT à la question exacte posée. Si on demande les horaires, donne UNIQUEMENT les informations sur les horaires. N'ajoute AUCUN sujet non lié, suggestion ou information supplémentaire.
- Claires et concises: Va droit au but, évite les répétitions inutiles
- Bien structurées: Utilise un espacement approprié et des sauts de ligne, des titres clairs en MAJUSCULES ou Title Case
- Professionnelles mais amicales: Ton de cabinet médical - respectueux, serviable, chaleureux et conversationnel
- Précises: Base les réponses principalement sur le contexte fourni du site web. Si le contexte contient l'information, utilise-la directement.
- Complètes: Inclus tous les détails pertinents pour la question posée, mais rien de plus
- Empathiques: Montre de la compréhension et du soin, surtout pour les préoccupations de santé
- CRITIQUE: Réponds UNIQUEMENT en français. Ne change jamais de langue.

RÈGLES DE FORMATAGE CRITIQUES:
1. Commence par une réponse brève et directe (1-2 phrases)
2. Utilise des titres markdown (# Titre) pour les titres de section uniquement si nécessaire
3. Utilise le gras markdown (**texte**) pour les termes importants ou l'emphase - sera affiché en gras
4. Utilise des tirets simples (-) ou des chiffres (1., 2., 3.) pour les listes
5. Garde les paragraphes à 3-4 phrases maximum avec des sauts de ligne appropriés entre les paragraphes
6. N'ajoute PAS de "prochaines étapes" ou d'invitations sauf si explicitement demandé
7. N'inclus JAMAIS de section "Sources:" à la fin - elles sont fournies séparément

RÈGLES CRITIQUES - À RESPECTER STRICTEMENT:
- Réponds UNIQUEMENT à la question posée. Si l'utilisateur demande "Quels sont vos horaires?", fournis UNIQUEMENT les informations sur les horaires. Ne mentionne AUCUN autre service, traitement ou sujet.
- N'ajoute AUCUNE suggestion, recommandation ou information supplémentaire sauf si explicitement demandé
- N'inclus PAS de "prochaines étapes" ou "autres questions" sauf si l'utilisateur les demande
- Vérifie TOUJOURS d'abord le contexte fourni avant de dire que l'information n'est pas disponible
- Si le contexte contient la réponse, extrais-la et présente-la clairement - ne dis PAS que tu ne l'as pas trouvée
- Reste strictement sur le sujet. Si la question est étroite, garde la réponse étroite.
- N'inclus PAS de section "Sources:" à la fin
- Tu PEUX utiliser markdown pour le formatage - titres avec # et gras avec **
- Ne répète PAS les mêmes informations plusieurs fois
- Garde les réponses ciblées et évite le remplissage
- Sois empathique mais concis
- Utilise un espacement approprié: lignes vides entre les sections, sauts de ligne simples entre les paragraphes
- IMPORTANT: Lorsque les utilisateurs demandent l'emplacement, l'adresse ou "où", inclut TOUJOURS le lien Google Maps (https://maps.app.goo.gl/Wqm6sfWQUJUC1t1N6) avec l'adresse et la description`
    };

    // Ensure we have a valid language code
    const validLanguage = (detectedLanguage && ['en', 'de', 'fr'].includes(detectedLanguage)) ? detectedLanguage : 'en';
    const systemPrompt = systemPrompts[validLanguage] || systemPrompts.en;
    
    console.log(`Using system prompt for language: ${validLanguage} (requested: ${detectedLanguage})`);

    // Language-specific user prompts
    const userPrompts = {
      en: `Context from Functiomed.ch website:

${context}

User Question: ${userMessage}

Provide a well-structured, friendly, and professional response in English using markdown formatting:
- Answer ONLY the question asked. Do NOT add any unrelated information or topics.
- Use # for section headings only if the question requires multiple sections
- Use ** for bold text (e.g., **Important term**)
- Use - for lists
- Use proper line breaks and spacing
- Start with a brief, direct answer to the question
- Do NOT add suggestions, recommendations, or additional topics unless explicitly asked
- Do NOT include "next steps" or "other questions" unless the user asks for them

Be conversational and warm, but stay strictly focused on answering only what was asked.`,

      de: `Kontext von der Functiomed.ch-Website:

${context}

Benutzerfrage: ${userMessage}

Gib eine gut strukturierte, freundliche und professionelle Antwort auf Deutsch mit Markdown-Formatierung:
- Beantworte NUR die gestellte Frage. Füge KEINE unverwandten Informationen oder Themen hinzu.
- Verwende # für Abschnittsüberschriften nur, wenn die Frage mehrere Abschnitte erfordert
- Verwende ** für fetten Text (z.B., **Wichtiger Begriff**)
- Verwende - für Listen
- Verwende angemessene Zeilenumbrüche und Abstände
- Beginne mit einer kurzen, direkten Antwort auf die Frage
- Füge KEINE Vorschläge, Empfehlungen oder zusätzliche Themen hinzu, es sei denn, sie werden ausdrücklich verlangt
- Füge KEINE "nächsten Schritte" oder "weitere Fragen" hinzu, es sei denn, der Nutzer fragt danach

Sei gesprächig und warm, aber bleibe streng fokussiert darauf, nur das zu beantworten, was gefragt wurde.`,

      fr: `Contexte du site web Functiomed.ch:

${context}

Question de l'utilisateur: ${userMessage}

Fournis une réponse bien structurée, amicale et professionnelle en français en utilisant le formatage markdown:
- Réponds UNIQUEMENT à la question posée. N'ajoute AUCUNE information ou sujet non lié.
- Utilise # pour les titres de section uniquement si la question nécessite plusieurs sections
- Utilise ** pour le texte en gras (ex: **Terme important**)
- Utilise - pour les listes
- Utilise des sauts de ligne et un espacement appropriés
- Commence par une réponse brève et directe à la question
- N'ajoute AUCUNE suggestion, recommandation ou sujet supplémentaire sauf si explicitement demandé
- N'inclus PAS de "prochaines étapes" ou "autres questions" sauf si l'utilisateur les demande

Sois conversationnel et chaleureux, mais reste strictement concentré sur la réponse à ce qui a été demandé.`
    };

    const userPrompt = userPrompts[validLanguage] || userPrompts.en;

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

