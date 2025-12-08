import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { generateRAGResponse } from './services/rag.js';
import { processAudioFile } from './services/transcription.js';
import { crawlSite } from './services/crawler.js';
import { textToSpeech } from './services/textToSpeech.js';
import { getDoctors, getServices, extractDoctorsAndServices } from './services/websiteData.js';
import { db, lowDb } from './config/database.js';
import { detectProblemDescription, generateRecommendationResponse } from './services/doctorRecommendation.js';
import { classifyQueryIntent } from './services/queryClassifier.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

// Session management (simple in-memory for demo)
const sessions = new Map();

function getOrCreateSession(sessionId) {
  if (!sessionId || !sessions.has(sessionId)) {
    const newSessionId = randomUUID();
    sessions.set(newSessionId, {
      id: newSessionId,
      createdAt: new Date()
    });
    return newSessionId;
  }
  return sessionId;
}

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Helper function to detect doctor/service queries
async function detectDoctorServiceQuery(message) {
  const lowerMessage = message.toLowerCase().trim();
  
  // First, check if this is an informational query (should NOT be treated as doctor/service query)
  const informationalPatterns = [
    /tell\s+me\s+about/i,
    /what\s+is/i,
    /explain\s+(to\s+me)?/i,
    /how\s+does/i,
    /information\s+(about|on)/i,
    /describe/i,
    /learn\s+about/i
  ];
  
  const isInformational = informationalPatterns.some(pattern => pattern.test(message));
  if (isInformational) {
    console.log('Informational query detected in detectDoctorServiceQuery, skipping doctor/service detection');
    return { isDoctorQuery: false, isServiceQuery: false, serviceName: null };
  }
  
  // Check for doctor/service query patterns - be more aggressive
  // Match ANY question about doctors, even if word order varies
  const hasDoctorWord = /\bdoctors?\b/i.test(message);
  const hasAvailableWord = /\bavailable\b/i.test(message);
  const hasWhichWhat = /^(which|what|who|list|show)/i.test(message.trim());
  
  const doctorPatterns = [
    /which doctors?/i,
    /what doctors?/i,
    /list doctors?/i,
    /show doctors?/i,
    /available doctors?/i,
    /doctors? (available|for|in|who|that|are)/i,
    /who (are|is|can|provides?)/i,
    /doctor.*available/i,
    /available.*doctor/i
  ];
  
  // If message contains "doctor" and "available" or starts with question words, it's likely a doctor query
  const isDoctorQuery = (hasDoctorWord && (hasAvailableWord || hasWhichWhat)) || 
                         doctorPatterns.some(pattern => pattern.test(message));
  
  const servicePatterns = [
    /which service/i,
    /what service/i,
    /services? (available|for|in)/i,
    /available services?/i
  ];
  
  const isServiceQuery = servicePatterns.some(pattern => pattern.test(message));
  
      // Extract service name if mentioned - improved matching
      let serviceName = null;
      const services = getServices();
      
      // Normalize service names for matching
      const normalizeServiceName = (name) => {
        return name.toLowerCase()
          .replace(/physiotherapie/i, 'physiotherapy')
          .replace(/[^a-z0-9]/g, '');
      };
      
      const normalizedMessage = normalizeServiceName(lowerMessage);
      
      // First, try exact match (case-insensitive)
      for (const service of services) {
        if (lowerMessage.includes(service.name.toLowerCase()) || 
            service.name.toLowerCase().includes(normalizedMessage.split(' ').pop())) {
          serviceName = service.name;
          console.log(`Matched "${lowerMessage}" to service: "${serviceName}" (exact match)`);
          break;
        }
      }
      
      // If no exact match, try normalized matching
      if (!serviceName) {
        for (const service of services) {
          const serviceNormalized = normalizeServiceName(service.name);
          
          // Check if service name appears in message
          if (normalizedMessage.includes(serviceNormalized) || 
              serviceNormalized.includes(normalizedMessage.split(' ').pop()) ||
              lowerMessage.includes(service.name.toLowerCase())) {
            serviceName = service.name;
            console.log(`Matched "${lowerMessage}" to service: "${serviceName}" (normalized match)`);
            break;
          }
        }
      }
      
      // Also check for common service variations - prioritize "Physiotherapie"
      if (!serviceName) {
        if (lowerMessage.includes('physiotherapie') || lowerMessage.includes('physiotherapy')) {
          // Find the best matching service - prioritize exact match "Physiotherapie"
          const physioServices = services.filter(s => {
            const normalized = normalizeServiceName(s.name);
            return normalized.includes('physiotherapie') || normalized.includes('physiotherapy');
          });
          
          if (physioServices.length > 0) {
            // Prefer exact match "Physiotherapie" over variations
            const exactMatch = physioServices.find(s => 
              normalizeServiceName(s.name) === 'physiotherapie'
            );
            serviceName = exactMatch ? exactMatch.name : physioServices[0].name;
            console.log(`Matched "${lowerMessage}" to service: "${serviceName}" (physiotherapy match)`);
          }
        }
      }
  
  // Debug logging
  console.log('Doctor query detection:', {
    message,
    hasDoctorWord,
    hasAvailableWord,
    hasWhichWhat,
    isDoctorQuery,
    isServiceQuery,
    serviceName,
    lowerMessage
  });
  
  return { isDoctorQuery, isServiceQuery, serviceName };
}

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId, preferredLanguage } = req.body;
    const actualSessionId = getOrCreateSession(sessionId);
    
    // Get conversation history for context
    const historyRows = db.prepare(`
      SELECT user_message, bot_response 
      FROM chat_sessions 
      WHERE session_id = ? 
      ORDER BY created_at DESC 
      LIMIT 10
    `).all(actualSessionId);
    
    const conversationHistory = [];
    for (const row of historyRows.reverse()) {
      if (row.user_message) {
        conversationHistory.push({ role: 'user', content: row.user_message });
      }
      if (row.bot_response) {
        conversationHistory.push({ role: 'assistant', content: row.bot_response });
      }
    }
    
    // Classify query intent using OpenAI FIRST - this ensures proper routing
    const queryIntent = await classifyQueryIntent(message, conversationHistory);
    console.log('Query intent classification:', queryIntent);
    
    // Use preferred language from frontend, or detect from user message
    const { detectLanguage } = await import('./services/rag.js');
    const userLanguage = preferredLanguage || detectLanguage(message);
    console.log(`User language: ${userLanguage} (${preferredLanguage ? 'selected by user' : 'auto-detected'})`);

    // If query is informational, skip recommendation checks and go directly to RAG
    if (queryIntent === 'informational') {
      console.log('Informational query detected, using RAG...');
      const result = await generateRAGResponse(message, actualSessionId, userLanguage);
      return res.json({
        response: result.response,
        sources: result.sources,
        sessionId: actualSessionId
      });
    }
    
    // Check if user is describing a medical problem - PRIORITY BEFORE doctor/service queries
    const isProblemDescription = await detectProblemDescription(message, conversationHistory);
    if (isProblemDescription) {
      console.log('Problem description detected, generating recommendations...');
      const recommendationResult = await generateRecommendationResponse(message, actualSessionId, conversationHistory, userLanguage);
      
      if (recommendationResult) {
        console.log('Recommendation generated successfully');
        return res.json({
          response: recommendationResult.response,
          sources: recommendationResult.sources || [],
          sessionId: actualSessionId,
          bookingIntent: false,
          recommendationIntent: true,
          quickReplies: recommendationResult.quickReplies || []
        });
      }
      // If recommendation failed, fall through to doctor/service queries or RAG
    }
    
    // Check for doctor/service queries
    // BUT: Skip if query is informational or recommendation (already handled)
    if (queryIntent !== 'informational' && queryIntent !== 'recommendation') {
      const queryInfo = await detectDoctorServiceQuery(message);
      
      console.log('Query detection result:', queryInfo);
      
      if (queryInfo.isDoctorQuery) {
        console.log('Doctor query detected, fetching doctors...');
        const doctors = getDoctors();
        let relevantDoctors = doctors;
        
        // If service is mentioned, filter doctors by service
        if (queryInfo.serviceName) {
          console.log(`Filtering doctors for service: "${queryInfo.serviceName}"`);
          // For now, just return all doctors - service filtering can be added later if needed
          relevantDoctors = doctors;
        }
        
        if (relevantDoctors.length > 0) {
          // Format doctor list nicely
          const doctorList = relevantDoctors
            .map((d, idx) => `${idx + 1}. ${d.name}`)
            .join('\n');
          
          // Language-specific responses
          const responses = {
            en: queryInfo.serviceName 
              ? `Here are the doctors available for ${queryInfo.serviceName}:\n\n${doctorList}`
              : `Here are our doctors:\n\n${doctorList}`,
            de: queryInfo.serviceName
              ? `Hier sind die Ärzte, die für ${queryInfo.serviceName} verfügbar sind:\n\n${doctorList}`
              : `Hier sind unsere Ärzte:\n\n${doctorList}`,
            fr: queryInfo.serviceName
              ? `Voici les médecins disponibles pour ${queryInfo.serviceName}:\n\n${doctorList}`
              : `Voici nos médecins:\n\n${doctorList}`
          };
          
          const response = responses[userLanguage] || responses.en;
          
          console.log('Returning doctor list response');
          return res.json({
            response: response,
            sources: [],
            sessionId: actualSessionId
          });
        }
      }
      
      // Handle service queries
      if (queryInfo.isServiceQuery) {
        const services = getServices();
        const serviceList = services.slice(0, 10).map((s, idx) => `${idx + 1}. ${s.name}`).join('\n');
        
        // Language-specific responses
        const responses = {
          en: `Here are our services:\n\n${serviceList}`,
          de: `Hier sind unsere Dienstleistungen:\n\n${serviceList}`,
          fr: `Voici nos services:\n\n${serviceList}`
        };
        
        return res.json({
          response: responses[userLanguage] || responses.en,
          sources: [],
          sessionId: actualSessionId
        });
      }
    }
    
    // Regular RAG response
    const result = await generateRAGResponse(message, actualSessionId, userLanguage);
    
    res.json({
      response: result.response,
      sources: result.sources,
      sessionId: actualSessionId
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

// Text-to-Speech endpoint using FishSpeech
app.post('/api/text-to-speech', async (req, res) => {
  try {
    const { text, voiceRef, language } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    if (!process.env.REPLICATE_API_TOKEN) {
      return res.status(500).json({ 
        error: 'Replicate API token not configured', 
        details: 'Please add REPLICATE_API_TOKEN to your .env file. Get your token from https://replicate.com/account/api-tokens' 
      });
    }

    // Detect language from text if not provided
    const { detectLanguage } = await import('./services/rag.js');
    const detectedLang = language || detectLanguage(text).substring(0, 2); // Get 2-letter code (en, de, fr)
    
    // Map language codes to FishSpeech supported codes
    const langMap = {
      'en': 'en',
      'de': 'de', 
      'fr': 'fr',
      'es': 'es',
      'it': 'it',
      'pt': 'pt',
      'ja': 'ja',
      'zh': 'zh',
      'ko': 'ko',
      'ar': 'ar',
      'ru': 'ru',
      'nl': 'nl',
      'pl': 'pl'
    };
    const fishSpeechLang = langMap[detectedLang] || 'en';

    try {
      const { textToSpeech } = await import('./services/textToSpeech.js');
      
      console.log(`🎤 Generating speech with FishSpeech (language: ${fishSpeechLang})...`);
      
      // Generate audio using FishSpeech
      const audioBuffer = await textToSpeech(text, voiceRef, fishSpeechLang);

      // Set appropriate headers for WAV audio
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Content-Length', audioBuffer.length);
      
      // Send audio buffer
      res.send(audioBuffer);
    } catch (error) {
      console.error('FishSpeech TTS error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to generate speech', details: error.message });
      } else {
        res.end();
      }
    }
  } catch (error) {
    console.error('TTS error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to process TTS request', details: error.message });
    }
  }
});

// Get available doctors
app.get('/api/doctors', (req, res) => {
  try {
    const doctors = getDoctors();
    console.log(`Returning ${doctors.length} doctors`);
    res.json(doctors);
  } catch (error) {
    console.error('Error fetching doctors:', error);
    res.json([]);
  }
});

// Get available services
app.get('/api/services', (req, res) => {
  try {
    const services = getServices();
    console.log(`Returning ${services.length} services`);
    res.json(services);
  } catch (error) {
    console.error('Error fetching services:', error);
    // Return default services on error
    const defaultServices = [
      { id: 'default_1', name: 'General Consultation', created_at: new Date().toISOString() },
      { id: 'default_2', name: 'Physical Therapy', created_at: new Date().toISOString() },
      { id: 'default_3', name: 'Physiotherapy', created_at: new Date().toISOString() },
      { id: 'default_4', name: 'Infusion Therapy', created_at: new Date().toISOString() },
      { id: 'default_5', name: 'Consultation', created_at: new Date().toISOString() }
    ];
    res.json(defaultServices);
  }
});

// Upload and process audio
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const { createReadStream } = await import('fs');
    const fileStream = createReadStream(req.file.path);
    
    const result = await processAudioFile(
      fileStream,
      req.file.originalname,
      req.file.size
    );
    
    res.json(result);
  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: 'Failed to process audio file' });
  }
});

// Get transcript
app.get('/api/transcripts/:transcriptId', (req, res) => {
  try {
    const { transcriptId } = req.params;
    const transcript = db.prepare('SELECT * FROM transcripts WHERE id = ?').get(transcriptId);
    
    if (!transcript) {
      return res.status(404).json({ error: 'Transcript not found' });
    }
    
    res.json({
      ...transcript,
      attendees: JSON.parse(transcript.attendees || '[]'),
      action_items: JSON.parse(transcript.action_items || '[]'),
      extracted_info: JSON.parse(transcript.extracted_info || '{}')
    });
  } catch (error) {
    console.error('Error fetching transcript:', error);
    res.status(500).json({ error: 'Failed to fetch transcript' });
  }
});

// Crawl site endpoint (admin)
// Admin endpoint to trigger doctor/service extraction
app.post('/api/admin/extract-doctors-services', async (req, res) => {
  try {
    console.log('Manual extraction triggered...');
    const { doctors, services } = await extractDoctorsAndServices();
    res.json({ 
      success: true, 
      doctors: doctors.length, 
      services: services.length,
      doctorList: doctors,
      serviceList: services
    });
  } catch (error) {
    console.error('Extraction error:', error);
    res.status(500).json({ error: 'Failed to extract doctors and services', details: error.message });
  }
});

app.post('/api/admin/crawl', async (req, res) => {
  try {
    const { siteUrl } = req.body;
    const targetUrl = siteUrl || process.env.TARGET_SITE || 'https://functiomed.ch';
    console.log(`Starting crawl of ${targetUrl}...`);
    const result = await crawlSite(targetUrl);
    res.json({ 
      success: true,
      message: `Crawled ${result.pages} pages and stored ${result.chunks} chunks`,
      ...result 
    });
  } catch (error) {
    console.error('Crawl error:', error);
    res.status(500).json({ error: 'Failed to crawl site', details: error.message });
  }
});

// Check knowledge base status
app.get('/api/admin/knowledge-status', async (req, res) => {
  try {
    const chunks = db.prepare('SELECT COUNT(*) as count FROM knowledge_chunks').get();
    const pages = db.prepare('SELECT COUNT(DISTINCT url) as count FROM knowledge_chunks').get();
    res.json({
      totalChunks: chunks?.count || 0,
      totalPages: pages?.count || 0,
      hasContent: (chunks?.count || 0) > 0
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// Check knowledge base on startup
(async () => {
  try {
    const chunks = db.prepare('SELECT COUNT(*) as count FROM knowledge_chunks').get();
    const chunkCount = chunks?.count || 0;
    
    if (chunkCount === 0) {
      const pages = db.prepare('SELECT COUNT(DISTINCT url) as count FROM knowledge_chunks').get();
      console.log(`\n⚠️  Knowledge base is empty!`);
    } else {
      const pages = db.prepare('SELECT COUNT(DISTINCT url) as count FROM knowledge_chunks').get();
      console.log(`\n✅ Knowledge base loaded: ${pages?.count || 0} pages, ${chunkCount} chunks\n`);
    }
  } catch (error) {
    console.error('Error checking knowledge base:', error);
  }
})();

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  
  // Check knowledge base status (but don't auto-crawl)
  setTimeout(async () => {
    try {
      const chunks = db.prepare('SELECT COUNT(*) as count FROM knowledge_chunks').get();
      const chunkCount = chunks?.count || 0;
      
      if (chunkCount === 0) {
        console.log('\n⚠️  Knowledge base is empty!');
        console.log('   To populate the knowledge base, please:');
        console.log('   - Run: npm run crawl');
        console.log('   - Or POST to /api/admin/crawl endpoint\n');
      } else {
        const pages = db.prepare('SELECT COUNT(DISTINCT url) as count FROM knowledge_chunks').get();
        console.log(`\n✅ Knowledge base loaded: ${pages?.count || 0} pages, ${chunkCount} chunks\n`);
      }
    } catch (error) {
      console.error('Error checking knowledge base:', error);
    }
  }, 2000); // Wait 2 seconds after server starts
});

