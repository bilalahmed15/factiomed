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
  // Minimal query expansion - only for basic multilingual synonyms
  // Rely on semantic search (embeddings) to find all relevant content
  const lowerQuery = query.toLowerCase();
  
  // Only expand very common multilingual terms that might not match semantically
  const basicExpansions = {
    // Hours/opening times (multilingual)
    'hours': ['öffnungszeiten', 'heures'],
    'öffnungszeiten': ['hours', 'opening hours'],
    'heures': ['hours', 'opening hours'],
    
    // Contact (multilingual)
    'contact': ['kontakt'],
    'kontakt': ['contact'],
  };
  
  // Check for basic multilingual expansions
  for (const [key, synonyms] of Object.entries(basicExpansions)) {
    if (lowerQuery.includes(key)) {
      return [query, ...synonyms].join(' ');
    }
  }
  
  // Return original query - let semantic search handle the rest
  return query;
}

// Cache for parsed embeddings to avoid repeated JSON parsing
const embeddingCache = new Map();
const CACHE_SIZE = 500; // Cache up to 500 embeddings

// Get query embedding and find similar chunks (OPTIMIZED)
export async function searchKnowledgeBase(query, topK = 5, preferredLanguage = null) {
  try {
    // Detect language if not provided
    const language = preferredLanguage || detectLanguage(query);
    
    // Expand query with synonyms for better matching
    const expandedQuery = expandQuery(query);
    
    // Create query embedding (parallel with other prep work)
    const embeddingPromise = openai.embeddings.create({
      model: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
      input: expandedQuery
    });
    
    // Get query embedding
    const response = await embeddingPromise;
    const queryEmbedding = response.data[0].embedding;
    
    // Get chunks - optimize by only selecting needed fields
    let chunks = db.prepare('SELECT id, url, page_title, heading_path, chunk_text, embedding, language FROM knowledge_chunks').all();
    
    // Pre-filter chunks by language for faster processing
    const languageChunks = chunks.filter(c => c.language === language);
    const otherChunks = chunks.filter(c => c.language !== language && c.language !== null);
    // Process ALL chunks to ensure we find all relevant information
    // Prioritize language-matched chunks, but include all others for comprehensive search
    const allChunks = [...languageChunks, ...otherChunks];
    
    console.log(`   Searching through ${allChunks.length} chunks (${languageChunks.length} language-matched, ${otherChunks.length} others)`);
    
    // Extract query words for basic text matching
    const queryLower = query.toLowerCase().trim();
    // Extract meaningful words (length > 2) and also keep important single words
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2 || ['iv', 'acp', 'tcm'].includes(w.toLowerCase()));
    // Also extract the main topic (remove common words like "tell", "me", "about")
    const stopWords = ['tell', 'me', 'about', 'what', 'is', 'are', 'the', 'your', 'you', 'do', 'does', 'can', 'could', 'would', 'how', 'when', 'where', 'who', 'which'];
    const mainTopic = queryWords.filter(w => !stopWords.includes(w.toLowerCase())).join(' ') || queryLower;
    
    console.log(`   Query: "${query}", Main topic: "${mainTopic}", Query words: [${queryWords.join(', ')}]`);
    
    // Semantic search - rely primarily on embedding similarity
    const scored = [];
    for (const chunk of allChunks) {
      // Parse embedding with caching
      let chunkEmbedding;
      if (embeddingCache.has(chunk.id)) {
        chunkEmbedding = embeddingCache.get(chunk.id);
      } else {
        chunkEmbedding = JSON.parse(chunk.embedding);
        // Cache management - remove oldest if cache is full
        if (embeddingCache.size >= CACHE_SIZE) {
          const firstKey = embeddingCache.keys().next().value;
          embeddingCache.delete(firstKey);
        }
        embeddingCache.set(chunk.id, chunkEmbedding);
      }
      
      // Primary similarity score from embeddings (semantic search)
      let similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);
      
      // Boost similarity for matching language
      if (chunk.language === language) {
        similarity *= 1.1;
      }
      
      const chunkTextLower = (chunk.chunk_text || '').toLowerCase();
      const pageTitleLower = (chunk.page_title || '').toLowerCase();
      const headingLower = (chunk.heading_path || '').toLowerCase();
      const urlLower = (chunk.url || '').toLowerCase();
      const combinedText = `${chunkTextLower} ${pageTitleLower} ${headingLower} ${urlLower}`;
      
      // STRONG boost for exact term matches in title, URL, or text (very strong indicator)
      // This works generically for ANY service, treatment, or topic
      if (mainTopic && mainTopic.length > 3) {
        // Check for exact match of main topic
        if (pageTitleLower.includes(mainTopic) || urlLower.includes(mainTopic) || chunkTextLower.includes(mainTopic)) {
          similarity += 0.5; // Very strong boost for exact topic matches
        }
        
        // Also check for topic with spaces replaced by hyphens (common in URLs)
        const topicHyphenated = mainTopic.replace(/\s+/g, '-');
        const topicNoSpaces = mainTopic.replace(/\s+/g, '');
        if (urlLower.includes(topicHyphenated) || urlLower.includes(topicNoSpaces)) {
          similarity += 0.4; // Strong boost for URL matches
        }
      }
      
      // Boost for exact word matches (works for any service or topic)
      for (const word of queryWords) {
        if (combinedText.includes(word)) {
          similarity += 0.1; // Increased boost for exact word matches
        }
      }
      
      // Additional boost if query words appear in page title (strong indicator of relevance)
      if (pageTitleLower) {
        const titleWordMatches = queryWords.filter(word => pageTitleLower.includes(word)).length;
        if (titleWordMatches > 0) {
          similarity += 0.2 * titleWordMatches; // Strong boost for title matches
        }
      }
      
      // Additional boost if URL contains the topic (works for any /angebot/ service)
      if (urlLower && mainTopic && urlLower.includes('/angebot/')) {
        const topicInUrl = mainTopic.replace(/\s+/g, '-').toLowerCase();
        const topicNoSpaces = mainTopic.replace(/\s+/g, '').toLowerCase();
        if (urlLower.includes(topicInUrl) || urlLower.includes(topicNoSpaces) || urlLower.includes(mainTopic.toLowerCase())) {
          similarity += 0.3; // Additional boost for /angebot/ URL matches
        }
      }
      
      scored.push({
        ...chunk,
        similarity
      });
    }
    
    // Partial sort - only sort top results (faster than full sort)
    scored.sort((a, b) => b.similarity - a.similarity);
    
    // Return top K chunks - no minimum similarity threshold, return best matches
    const chunksToReturn = Math.min(Math.max(topK, 10), 15);
    
    const topChunks = scored.slice(0, chunksToReturn);
    
    // Log top matches for debugging with more detail
    if (topChunks.length > 0) {
      console.log(`   Top ${topChunks.length} matches:`);
      topChunks.slice(0, 5).forEach((c, idx) => {
        console.log(`     ${idx + 1}. ${c.page_title} (sim: ${c.similarity.toFixed(3)}, url: ${c.url})`);
      });
      
      // Check if we found chunks with the main topic
      const topicMatches = topChunks.filter(c => {
        const text = `${c.page_title} ${c.chunk_text} ${c.url}`.toLowerCase();
        return mainTopic && text.includes(mainTopic);
      });
      if (topicMatches.length > 0) {
        console.log(`   ✓ Found ${topicMatches.length} chunks containing main topic "${mainTopic}"`);
      } else if (mainTopic && mainTopic.length > 3) {
        console.log(`   ⚠ No chunks found containing main topic "${mainTopic}" in top results`);
        // Fallback: search for chunks containing the main topic (generic for any service)
        // Check for exact match, hyphenated version, and no-space version
        const topicVariations = [
          mainTopic,
          mainTopic.replace(/\s+/g, '-'),
          mainTopic.replace(/\s+/g, ''),
        ];
        const fallbackChunks = allChunks.filter(c => {
          const text = `${c.page_title} ${c.chunk_text} ${c.url}`.toLowerCase();
          return topicVariations.some(variation => text.includes(variation.toLowerCase()));
        }).slice(0, 5);
        if (fallbackChunks.length > 0) {
          console.log(`   → Found ${fallbackChunks.length} fallback chunks with topic, adding to results`);
          // Add fallback chunks with high similarity score
          fallbackChunks.forEach(chunk => {
            if (!topChunks.find(tc => tc.id === chunk.id)) {
              topChunks.push({...chunk, similarity: 0.8}); // High similarity for exact matches
            }
          });
        }
      }
    }
    
    // Re-sort after potentially adding fallback chunks
    topChunks.sort((a, b) => b.similarity - a.similarity);
    
    return topChunks.slice(0, chunksToReturn).map(item => ({
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
    
    // Search knowledge base - increased to 15 chunks for comprehensive coverage of all services and information
    const relevantChunks = await searchKnowledgeBase(userMessage, 15, detectedLanguage);
    
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
    
    // Build context from chunks - increased limit to include more information
    const maxContextLength = 4000; // Increased to 4000 chars to include more relevant chunks
    let contextLength = 0;
    const contextParts = [];
    
    // Prioritize chunks with higher similarity scores
    const sortedChunks = [...relevantChunks].sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
    
    for (let idx = 0; idx < sortedChunks.length && contextLength < maxContextLength; idx++) {
      const chunk = sortedChunks[idx];
      const chunkContext = `[Source ${idx + 1}: ${chunk.page_title} (${chunk.url})]\n${chunk.chunk_text}`;
      if (contextLength + chunkContext.length > maxContextLength && idx > 0) {
        break; // Stop if adding this chunk would exceed limit
      }
      contextParts.push(chunkContext);
      contextLength += chunkContext.length;
    }
    
    const context = contextParts.join('\n\n---\n\n');
    
    console.log(`   Using ${contextParts.length} chunks for context (${contextLength} chars)`);
    
    // Build sources with proper URL filtering and normalization
    const sources = relevantChunks
      .map(chunk => {
        let url = chunk.url;
        
        // Filter out internal URLs - convert to website URL or skip
        if (url && url.startsWith('internal://')) {
          // For internal content, use the main website URL
          url = 'https://functiomed.ch';
        }
        
        // Ensure URL is valid and absolute
        if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
          // If relative URL, make it absolute
          if (url.startsWith('/')) {
            url = `https://functiomed.ch${url}`;
          } else {
            url = `https://functiomed.ch/${url}`;
          }
        }
        
        // Only include sources with valid URLs
        if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
          return null;
        }
        
        // Create a descriptive title from page title and heading
        let title = chunk.page_title || 'Functiomed';
        if (chunk.heading_path && chunk.heading_path !== title && !title.includes(chunk.heading_path)) {
          // Add heading to title if it's different and provides context
          title = `${chunk.page_title || 'Functiomed'} - ${chunk.heading_path}`;
        }
        
        return {
          url: url,
          title: title,
          heading: chunk.heading_path || '',
          snippet: chunk.chunk_text.substring(0, 200) + '...'
        };
      })
      .filter(source => source !== null) // Remove invalid sources
      .filter((source, index, self) => 
        // Remove duplicates based on URL
        index === self.findIndex(s => s.url === source.url)
      );
    
    // Language-specific system prompts
    const systemPrompts = {
      en: `You are FIONA, a friendly and professional medical assistant for Functiomed.ch, a medical practice in Zurich specializing in functional medicine.

Your responses must be:
- STRICTLY question-focused: Answer ONLY the exact question asked. If asked about hours, provide ONLY hours information. Do NOT add any unrelated topics, suggestions, or additional information.
- Clear and concise: Get to the point quickly, avoid unnecessary repetition
- Well-structured: Use proper spacing and line breaks, clear headings in ALL CAPS or Title Case
- Professional but friendly: Medical practice tone - respectful, helpful, warm, and conversational
- Accurate: ALWAYS base answers on the provided context from the website. If the context contains ANY information related to the question, you MUST use it. NEVER say "we don't have information" or "I don't have access" if the context contains relevant information. Extract and present information from the context even if it's not a perfect match.
- Complete: Include all relevant details for the question asked, but nothing beyond that
- Empathetic: Show understanding and care, especially for health concerns
- CRITICAL: Respond ONLY in English. Never switch to another language.
- CRITICAL: If context is provided, it means the information exists. You MUST extract and present it. Never claim information is unavailable when context is provided.
- CRITICAL: The website contains information about services, treatments, and offerings in the /angebot/ (offers) section. If the user asks about ANY service, treatment, or offering, search the context thoroughly. The information EXISTS in the context if it's on the website. Extract ALL relevant details about the service, treatment, or offering from the context.

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
- CRITICAL: The context provided contains information from the website. If ANY part of the context relates to the user's question, you MUST extract and present that information. NEVER say "we don't have information" or "I don't have access" when context is provided.
- ALWAYS check the provided context FIRST - if context exists, the information is available. Extract and present it clearly.
- If the context contains ANY relevant information (even partial), extract and present it. Do NOT say you couldn't find it.
- If the user asks "Tell me about X" and the context mentions X, you MUST provide information about X from the context.
- If the user asks about a service, treatment, or offering, search ALL provided context chunks for information about that topic. Even if the information is spread across multiple chunks, combine and present it comprehensively.
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
- Genau: STÜTZE Antworten IMMER auf den bereitgestellten Kontext von der Website. Wenn der Kontext IRGENDEINE Information zum Thema enthält, MUSST du sie verwenden. NIEMALS sagen "wir haben keine Informationen" oder "ich habe keinen Zugriff", wenn der Kontext relevante Informationen enthält. Extrahiere und präsentiere Informationen aus dem Kontext, auch wenn es keine perfekte Übereinstimmung ist.
- KRITISCH: Wenn Kontext bereitgestellt wird, bedeutet dies, dass die Information existiert. Du MUSST sie extrahieren und präsentieren. Niemals behaupten, dass Informationen nicht verfügbar sind, wenn Kontext bereitgestellt wurde.
- KRITISCH: Die Website enthält Informationen über Dienstleistungen, Behandlungen und Angebote im /angebot/ (Angebote) Bereich. Wenn der Nutzer nach IRGENDEINER Dienstleistung, Behandlung oder einem Angebot fragt, durchsuche den Kontext gründlich. Die Information EXISTIERT im Kontext, wenn sie auf der Website steht. Extrahiere ALLE relevanten Details über die Dienstleistung, Behandlung oder das Angebot aus dem Kontext.
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
- KRITISCH: Der bereitgestellte Kontext enthält Informationen von der Website. Wenn IRGENDEIN Teil des Kontexts zur Frage des Nutzers passt, MUSST du diese Information extrahieren und präsentieren. NIEMALS sagen "wir haben keine Informationen" oder "ich habe keinen Zugriff", wenn Kontext bereitgestellt wurde.
- PRÜFE IMMER zuerst den bereitgestellten Kontext - wenn Kontext existiert, ist die Information verfügbar. Extrahiere und präsentiere sie klar.
- Wenn der Kontext IRGENDEINE relevante Information enthält (auch teilweise), extrahiere und präsentiere sie. Sage NICHT, dass du sie nicht finden konntest.
- Wenn der Nutzer fragt "Erzähl mir von X" und der Kontext erwähnt X, MUSST du Informationen über X aus dem Kontext bereitstellen.
- Wenn der Nutzer nach einer Dienstleistung, Behandlung oder einem Angebot fragt, durchsuche ALLE bereitgestellten Kontext-Chunks nach Informationen zu diesem Thema. Auch wenn die Information über mehrere Chunks verteilt ist, kombiniere und präsentiere sie umfassend.
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
- Précises: Base les réponses principalement sur le contexte fourni du site web. Si le contexte contient l'information, utilise-la directement. JAMAIS dire "nous n'avons pas d'information" ou "je n'ai pas accès" si le contexte contient des informations pertinentes.
- CRITIQUE: Si le contexte est fourni, cela signifie que l'information existe. Tu DOIS l'extraire et la présenter. Ne prétends jamais que les informations ne sont pas disponibles lorsque le contexte est fourni.
- CRITIQUE: Le site web contient des informations sur les services, traitements et offres dans la section /angebot/ (offres). Si l'utilisateur demande des informations sur N'IMPORTE QUEL service, traitement ou offre, recherche dans TOUT le contexte fourni. L'information EXISTE dans le contexte si elle est sur le site web. Extrais TOUS les détails pertinents sur le service, traitement ou offre du contexte.
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
- CRITIQUE: Le contexte fourni contient des informations du site web. Si N'IMPORTE QUELLE partie du contexte concerne la question de l'utilisateur, tu DOIS extraire et présenter cette information. Ne dis JAMAIS "nous n'avons pas d'information" ou "je n'ai pas accès" lorsque le contexte est fourni.
- Vérifie TOUJOURS d'abord le contexte fourni - si le contexte existe, l'information est disponible. Extrais-la et présente-la clairement.
- Si le contexte contient N'IMPORTE QUELLE information pertinente (même partielle), extrais-la et présente-la. Ne dis PAS que tu ne l'as pas trouvée.
- Si l'utilisateur demande "Parle-moi de X" et que le contexte mentionne X, tu DOIS fournir des informations sur X à partir du contexte.
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

IMPORTANT: The context above contains information from the Functiomed.ch website. You MUST use this information to answer the user's question.

Provide a well-structured, friendly, and professional response in English using markdown formatting:
- Extract and present information from the provided context. If the context mentions the topic, provide that information.
- Answer ONLY the question asked. Do NOT add any unrelated information or topics.
- Use # for section headings only if the question requires multiple sections
- Use ** for bold text (e.g., **Important term**)
- Use - for lists
- Use proper line breaks and spacing
- Start with a brief, direct answer to the question
- Do NOT say "we don't have information" if the context contains relevant information
- Do NOT add suggestions, recommendations, or additional topics unless explicitly asked
- Do NOT include "next steps" or "other questions" unless the user asks for them

Be conversational and warm, but stay strictly focused on answering only what was asked using the provided context.`,

      de: `WICHTIG: Der Kontext oben enthält Informationen von der Functiomed.ch-Website. Du MUSST diese Informationen verwenden, um die Frage des Nutzers zu beantworten.

Kontext von der Functiomed.ch-Website:

${context}

Benutzerfrage: ${userMessage}

Gib eine gut strukturierte, freundliche und professionelle Antwort auf Deutsch mit Markdown-Formatierung:
- Extrahiere und präsentiere Informationen aus dem bereitgestellten Kontext. Wenn der Kontext das Thema erwähnt, stelle diese Informationen bereit.
- Beantworte NUR die gestellte Frage. Füge KEINE unverwandten Informationen oder Themen hinzu.
- Verwende # für Abschnittsüberschriften nur, wenn die Frage mehrere Abschnitte erfordert
- Verwende ** für fetten Text (z.B., **Wichtiger Begriff**)
- Verwende - für Listen
- Verwende angemessene Zeilenumbrüche und Abstände
- Beginne mit einer kurzen, direkten Antwort auf die Frage
- Sage NICHT "wir haben keine Informationen", wenn der Kontext relevante Informationen enthält
- Füge KEINE Vorschläge, Empfehlungen oder zusätzliche Themen hinzu, es sei denn, sie werden ausdrücklich verlangt
- Füge KEINE "nächsten Schritte" oder "weitere Fragen" hinzu, es sei denn, der Nutzer fragt danach

Sei gesprächig und warm, aber bleibe streng fokussiert darauf, nur das zu beantworten, was gefragt wurde, unter Verwendung des bereitgestellten Kontexts.`,

      fr: `IMPORTANT: Le contexte ci-dessus contient des informations du site Functiomed.ch. Tu DOIS utiliser ces informations pour répondre à la question de l'utilisateur.

Contexte du site web Functiomed.ch:

${context}

Question de l'utilisateur: ${userMessage}

Fournis une réponse bien structurée, amicale et professionnelle en français en utilisant le formatage markdown:
- Extrais et présente des informations du contexte fourni. Si le contexte mentionne le sujet, fournis ces informations.
- Réponds UNIQUEMENT à la question posée. N'ajoute AUCUNE information ou sujet non lié.
- Utilise # pour les titres de section uniquement si la question nécessite plusieurs sections
- Utilise ** pour le texte en gras (ex: **Terme important**)
- Utilise - pour les listes
- Utilise des sauts de ligne et un espacement appropriés
- Commence par une réponse brève et directe à la question
- Ne dis PAS "nous n'avons pas d'information" si le contexte contient des informations pertinentes
- N'ajoute AUCUNE suggestion, recommandation ou sujet supplémentaire sauf si explicitement demandé
- N'inclus PAS de "prochaines étapes" ou "autres questions" sauf si l'utilisateur les demande

Sois conversationnel et chaleureux, mais reste strictement concentré sur la réponse à ce qui a été demandé en utilisant le contexte fourni.`
    };

    const userPrompt = userPrompts[validLanguage] || userPrompts.en;

    // Call LLM with optimized parameters for faster response
    const completion = await openai.chat.completions.create({
      model: process.env.OLLAMA_CHAT_MODEL || 'llama3.2',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.6, // Slightly lower for faster, more focused responses
      max_tokens: 500    // Further reduced for faster generation
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

