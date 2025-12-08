import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db, lowDb } from '../config/database.js';
import { extractDoctorsAndServices } from './websiteData.js';
import { createHash } from 'crypto';
import { openai } from './llm.js';
import { detectLanguage } from './rag.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simple sitemap parser
async function fetchSitemapUrls(siteUrl) {
  try {
    const sitemapUrl = new URL('/sitemap.xml', siteUrl).href;
    const response = await fetch(sitemapUrl);
    if (response.ok) {
      const text = await response.text();
      const urls = [];
      
      // Handle both <loc>URL</loc> and <loc><![CDATA[URL]]></loc> formats
      const urlRegex = /<loc>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/loc>/g;
      let match;
      while ((match = urlRegex.exec(text)) !== null) {
        const url = match[1].trim();
        if (url) {
          urls.push(url);
        }
      }
      
      return urls;
    }
  } catch (error) {
    console.log('No sitemap found, will crawl homepage and discover links');
  }
  return [];
}

// Extract contact information from HTML (before removing footer/header)
function extractContactInfo(html) {
  const $ = cheerio.load(html);
  const contactInfo = {
    phone: [],
    email: [],
    address: [],
    openingHours: [],
    links: []
  };
  
  // Extract phone numbers - look for Swiss phone patterns (+41 or 0xx)
  const phoneRegex = /(\+41\s?\d{1,2}\s?\d{3}\s?\d{2}\s?\d{2}|0\d{1,2}\s?\d{3}\s?\d{2}\s?\d{2}|\+?\d{1,4}[\s\-\.]?\(?\d{1,4}\)?[\s\-\.]?\d{1,4}[\s\-\.]?\d{1,9}[\s\-\.]?\d{1,9})/g;
  const bodyText = $('body').text();
  const phoneMatches = bodyText.match(phoneRegex);
  if (phoneMatches) {
    phoneMatches.forEach(phone => {
      const cleanPhone = phone.trim().replace(/\s+/g, ' ');
      // Filter out numbers that are too short or look like years/dates
      if (cleanPhone.length >= 8 && cleanPhone.length <= 20 && 
          !cleanPhone.match(/^\d{4}$/) && // Not a year
          !contactInfo.phone.includes(cleanPhone)) {
        contactInfo.phone.push(cleanPhone);
      }
    });
  }
  
  // Extract email addresses
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  $('body').text().match(emailRegex)?.forEach(email => {
    const cleanEmail = email.trim().toLowerCase();
    if (!contactInfo.email.includes(cleanEmail)) {
      contactInfo.email.push(cleanEmail);
    }
  });
  
  // Extract addresses - look for Swiss address patterns
  // Pattern 1: Street name + number + postal code + city
  const addressPattern1 = /([A-ZÄÖÜ][a-zäöüß]+(?:strasse|gasse|weg|platz|allee|ring|weg)\s+\d+[a-z]?)[^.]*(\d{4}\s+[A-ZÄÖÜ][a-zäöüß]+)/gi;
  // Pattern 2: CH-XXXX City format
  const addressPattern2 = /CH\s*-\s*\d{4}\s+[A-ZÄÖÜ][a-zäöüß]+/gi;
  // Pattern 3: Street name with number, postal code, city in proximity
  const addressPattern3 = /(Langgrütstrasse|Bahnhofstrasse|Hauptstrasse|Seestrasse|Bergstrasse)[^.]{0,50}(\d{4}\s+[A-ZÄÖÜ][a-zäöüß]+|Zürich|Zurich|Basel|Bern|Genf|Geneva)/gi;
  
  [addressPattern1, addressPattern2, addressPattern3].forEach(pattern => {
    const matches = bodyText.match(pattern);
    if (matches) {
      matches.forEach(addr => {
        const cleanAddr = addr.trim().replace(/\s+/g, ' ');
        if (cleanAddr.length > 10 && cleanAddr.length < 200 && 
            !contactInfo.address.includes(cleanAddr)) {
          contactInfo.address.push(cleanAddr);
        }
      });
    }
  });
  
  // Also look for structured address blocks
  $('[class*="address"], [id*="address"], [class*="contact"], [id*="contact"], [class*="location"], [id*="location"]').each((i, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    // Check if this looks like an address (contains street, postal code pattern)
    if (text.match(/\d{4}\s+[A-ZÄÖÜ][a-zäöüß]+/) && text.length > 15 && text.length < 200) {
      const cleanAddr = text.replace(/\s+/g, ' ').trim();
      if (!contactInfo.address.includes(cleanAddr)) {
        contactInfo.address.push(cleanAddr);
      }
    }
  });
  
  // Extract opening hours - look for common patterns
  // Pattern 1: Day name + time range
  const hoursPattern1 = /(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[^.]{0,100}(\d{1,2}[:.]\d{2}|\d{1,2})\s*(Uhr|AM|PM|am|pm|bis|to|-|–)\s*(\d{1,2}[:.]\d{2}|\d{1,2})/gi;
  // Pattern 2: Opening hours heading + time
  const hoursPattern2 = /(Öffnungszeiten|opening hours|business hours|hours|Heures d'ouverture)[^.]{0,150}(\d{1,2}[:.]\d{2}|\d{1,2})\s*(Uhr|AM|PM|am|pm|bis|to|-|–)\s*(\d{1,2}[:.]\d{2}|\d{1,2})/gi;
  // Pattern 3: Time range format (08:00 - 18:00)
  const hoursPattern3 = /\d{1,2}[:.]\d{2}\s*(Uhr|AM|PM|am|pm)?\s*(bis|to|-|–)\s*\d{1,2}[:.]\d{2}\s*(Uhr|AM|PM|am|pm)/gi;
  // Pattern 4: Monday-Friday format
  const hoursPattern4 = /(Montag|Monday)[^.]{0,50}(bis|to|-|–)[^.]{0,50}(Freitag|Friday)[^.]{0,100}(\d{1,2}[:.]\d{2}|\d{1,2})\s*(Uhr|AM|PM|am|pm|bis|to|-|–)\s*(\d{1,2}[:.]\d{2}|\d{1,2})/gi;
  
  [hoursPattern1, hoursPattern2, hoursPattern3, hoursPattern4].forEach(pattern => {
    const matches = bodyText.match(pattern);
    if (matches) {
      matches.forEach(hours => {
        const cleanHours = hours.trim().replace(/\s+/g, ' ');
        if (cleanHours.length > 5 && cleanHours.length < 150 && 
            !contactInfo.openingHours.includes(cleanHours)) {
          contactInfo.openingHours.push(cleanHours);
        }
      });
    }
  });
  
  // Also check specific sections that might contain hours
  $('[class*="hours"], [id*="hours"], [class*="öffnung"], [id*="öffnung"], [class*="opening"], [id*="opening"]').each((i, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    // Look for time patterns in these sections
    if (text.match(/\d{1,2}[:.]\d{2}/) && text.length > 10 && text.length < 300) {
      const cleanHours = text.replace(/\s+/g, ' ').trim();
      if (!contactInfo.openingHours.includes(cleanHours)) {
        contactInfo.openingHours.push(cleanHours);
      }
    }
  });
  
  // Extract contact-related links
  $('a[href^="mailto:"], a[href^="tel:"], a[href*="contact"], a[href*="kontakt"]').each((i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (href && !contactInfo.links.some(l => l.href === href)) {
      contactInfo.links.push({ href, text });
    }
  });
  
  // Also check footer and contact sections before they're removed
  $('footer, [class*="contact"], [class*="kontakt"], [id*="contact"], [id*="kontakt"]').each((i, el) => {
    const $el = $(el);
    const text = $el.text();
    
    // Extract phone from this section
    text.match(phoneRegex)?.forEach(phone => {
      const cleanPhone = phone.trim().replace(/\s+/g, ' ');
      if (cleanPhone.length >= 8 && cleanPhone.length <= 20 && 
          !cleanPhone.match(/^\d{4}$/) && 
          !contactInfo.phone.includes(cleanPhone)) {
        contactInfo.phone.push(cleanPhone);
      }
    });
    
    // Extract email from this section
    text.match(emailRegex)?.forEach(email => {
      const cleanEmail = email.trim().toLowerCase();
      if (!contactInfo.email.includes(cleanEmail)) {
        contactInfo.email.push(cleanEmail);
      }
    });
    
    // Extract address from this section using the same patterns
    [addressPattern1, addressPattern2, addressPattern3].forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(addr => {
          const cleanAddr = addr.trim().replace(/\s+/g, ' ');
          if (cleanAddr.length > 10 && cleanAddr.length < 200 && 
              !contactInfo.address.includes(cleanAddr)) {
            contactInfo.address.push(cleanAddr);
          }
        });
      }
    });
  });
  
  return contactInfo;
}

// Extract text content from HTML
function extractText(html, url) {
  const $ = cheerio.load(html);
  
  // Extract contact information BEFORE removing footer/header
  const contactInfo = extractContactInfo(html);
  
  // Get title and h1 BEFORE removing elements
  const title = $('title').text().trim() || $('h1').first().text().trim() || '';
  const h1 = $('h1').first().text().trim() || '';
  const metaDescription = $('meta[name="description"]').attr('content') || '';
  
  // Remove script, style, nav, footer, cookie banners, but keep content
  $('script, style, nav, footer, header, [class*="cookie"], [class*="banner"], [class*="menu"], [class*="navigation"]').remove();
  
  // Get ALL headings for context (h1-h6) - get them before they might be removed
  const headings = [];
  $('h1, h2, h3, h4, h5, h6').each((i, el) => {
    const headingText = $(el).text().trim();
    // Capture ALL headings, even long ones - they might contain important info
    if (headingText && headingText.length > 0 && headingText.length < 500) { // Increased max length
      headings.push(headingText);
    }
  });
  
  // Extract main content - try multiple selectors, be more aggressive
  let mainContent = $('main').first();
  if (!mainContent.length || mainContent.text().trim().length < 50) {
    mainContent = $('article').first();
  }
  if (!mainContent.length || mainContent.text().trim().length < 50) {
    mainContent = $('[class*="content"], [class*="main"], [id*="content"], [id*="main"]').first();
  }
  if (!mainContent.length || mainContent.text().trim().length < 50) {
    mainContent = $('body');
  }
  
  // If still no content, try to get everything from body
  if (mainContent.text().trim().length < 20) {
    mainContent = $('body');
  }
  
  const paragraphs = [];
  
  // Strategy 1: Get ALL paragraph elements (even very short ones - capture everything)
  mainContent.find('p').each((i, el) => {
    const text = $(el).text().trim();
    if (text.length > 5) {  // Very low threshold - capture even short paragraphs
      paragraphs.push(text);
    }
  });
  
  // Strategy 2: Get ALL list items (capture everything)
  mainContent.find('li').each((i, el) => {
    const text = $(el).text().trim();
    if (text.length > 5 && !text.match(/^(Home|About|Services|Contact|Menu|Navigation|Skip to|Cookie|Accept|Decline)$/i)) {
      paragraphs.push(text);
    }
  });
  
  // Strategy 3: Get all text from main content area (be VERY aggressive - capture everything)
  const allText = mainContent.text();
  if (allText.trim().length > 20) {
    // Split by sentences, periods, newlines - capture even short snippets
    const sentences = allText.split(/[.\n!?]+/).filter(s => s.trim().length > 10); // Lower threshold
    sentences.forEach(s => {
      const clean = s.trim().replace(/\s+/g, ' ');
      if (clean.length > 10 && clean.length < 2000) { // Increased max length, lower min
        paragraphs.push(clean);
      }
    });
  }
  
  // Strategy 4: Extract from divs with content-related classes/IDs (capture everything)
  mainContent.find('[class*="text"], [class*="content"], [class*="description"], [class*="info"], [id*="content"], [class*="section"], [id*="section"]').each((i, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    if (text.length > 10 && text.length < 3000) { // Lower threshold, higher max
      paragraphs.push(text);
    }
  });
  
  // Strategy 5: Extract from ANY div, span, section, article - capture ALL text
  mainContent.find('div, span, section, article, aside, blockquote, pre').each((i, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    // Be more lenient - capture more content
    const childElements = $el.children().length;
    if (text.length > 10 && text.length < 3000 && childElements < 15) { // Lower threshold, higher limits
      paragraphs.push(text);
    }
  });
  
  // Strategy 6: Extract from ALL text nodes directly (capture every piece of text)
  mainContent.find('*').each((i, el) => {
    const $el = $(el);
    // Only process leaf nodes (elements with no text children, only direct text)
    const hasTextChildren = $el.children().filter((idx, child) => {
      return $(child).text().trim().length > 0;
    }).length > 0;
    
    if (!hasTextChildren) {
      const text = $el.text().trim();
      // Capture even very short text snippets
      if (text.length > 5 && text.length < 500 && !text.match(/^(Home|About|Services|Contact|Menu|Navigation|Skip|Cookie|Accept|Decline|Close|×)$/i)) {
        paragraphs.push(text);
      }
    }
  });
  
  // Strategy 7: Extract from table cells (often contains structured info like CEO, management, etc.)
  mainContent.find('td, th').each((i, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    if (text.length > 5 && text.length < 1000) { // Lower threshold, higher max
      paragraphs.push(text);
    }
  });
  
  // Strategy 8: Extract from definition lists (dl, dt, dd) - often contains structured info
  mainContent.find('dt, dd').each((i, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    if (text.length > 5 && text.length < 1000) { // Lower threshold, higher max
      paragraphs.push(text);
    }
  });
  
  // Strategy 9: Extract from ALL headings (h1-h6) - they often contain important info
  mainContent.find('h1, h2, h3, h4, h5, h6').each((i, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    if (text.length > 3 && text.length < 500) { // Capture even short headings
      paragraphs.push(text);
    }
  });
  
  // Strategy 10: Extract from strong, em, b, i tags - often emphasize important info
  mainContent.find('strong, em, b, i, mark, small').each((i, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    if (text.length > 3 && text.length < 500) {
      paragraphs.push(text);
    }
  });
  
  // Strategy 11: Last resort - extract ALL text from body and split intelligently (capture everything)
  const allBodyText = $('body').text().trim();
  if (allBodyText.length > 20) {
    // Split by sentences, newlines, periods - capture everything
    const sentences = allBodyText.split(/([.!?\n]+)/).filter(s => s.trim().length > 5); // Lower threshold
    // Group sentences into paragraphs (every 2-3 sentences) or add individually if short
    for (let i = 0; i < sentences.length; i += 2) {
      const para = sentences.slice(i, i + 3).join(' ').trim();
      if (para.length > 10 && para.length < 2000) { // Lower min, higher max
        paragraphs.push(para);
      }
    }
  }
  
  // Remove only exact duplicates (keep all similar content to preserve details)
  const uniqueParagraphs = [];
  const seen = new Set();
  paragraphs.forEach(p => {
    // Normalize: remove extra whitespace, lowercase
    const normalized = p.toLowerCase().replace(/\s+/g, ' ').trim();
    // Only skip if EXACT match - keep all variations to preserve details
    if (!seen.has(normalized) && normalized.length > 3) { // Very low threshold
      seen.add(normalized);
      uniqueParagraphs.push(p);
    }
  });
  
  // Extract alt text from images
  const altTexts = [];
  mainContent.find('img[alt]').each((i, el) => {
    const alt = $(el).attr('alt');
    if (alt && alt.length > 10) {
      altTexts.push(alt);
    }
  });
  
  // Detect language from content (title, h1, and first few paragraphs)
  const contentText = `${title} ${h1} ${uniqueParagraphs.slice(0, 3).join(' ')}`;
  const detectedLang = detectLanguage(contentText);
  
  // Also check URL for language hints (/en/ = English, /fr/ = French, default = German)
  let language = detectedLang;
  if (url.includes('/en/') || url.includes('/english')) {
    language = 'en';
  } else if (url.includes('/fr/') || url.includes('/french') || url.includes('/francais')) {
    language = 'fr';
  } else if (url.includes('/de/') || url.includes('/german') || url.includes('/deutsch')) {
    language = 'de';
  } else if (detectedLang === 'en' && !url.includes('/en/')) {
    // If detected as English but URL doesn't indicate English, might be German page with English content
    // Check if more German indicators
    const germanIndicators = (contentText.match(/ä|ö|ü|ß/g) || []).length;
    if (germanIndicators > 2) {
      language = 'de';
    }
  }
  
  return {
    title: title || 'Untitled',
    h1: h1 || title,
    headings,
    paragraphs: uniqueParagraphs,
    altTexts,
    metaDescription,
    url,
    contactInfo, // Include extracted contact information
    language // Include detected language
  };
}

// Chunk text into smaller pieces
function chunkText(content, maxChunkSize = 1000, overlap = 200) {
  const chunks = [];
  let fullText = '';
  
  // Combine all content with proper structure
  if (content.title) fullText += `Title: ${content.title}\n\n`;
  if (content.h1 && content.h1 !== content.title) fullText += `${content.h1}\n\n`;
  
  if (content.metaDescription) {
    fullText += `Description: ${content.metaDescription}\n\n`;
  }
  
  // Add ALL headings as context (not just first 5)
  content.headings.forEach(h => {
    fullText += `${h}\n`;
  });
  if (content.headings.length > 0) fullText += '\n';
  
  // Add all paragraphs
  content.paragraphs.forEach(p => {
    fullText += `${p}\n\n`;
  });
  
  // Add ALL alt texts if available (not just first 5)
  if (content.altTexts.length > 0) {
    fullText += '\nImages:\n';
    content.altTexts.forEach(alt => {
      fullText += `- ${alt}\n`;
    });
  }
  
  // Add contact information if available
  if (content.contactInfo) {
    const ci = content.contactInfo;
    if (ci.phone && ci.phone.length > 0) {
      fullText += '\nContact Phone: ';
      fullText += ci.phone.join(', ') + '\n';
    }
    if (ci.email && ci.email.length > 0) {
      fullText += 'Contact Email: ';
      fullText += ci.email.join(', ') + '\n';
    }
    if (ci.address && ci.address.length > 0) {
      fullText += 'Address: ';
      fullText += ci.address.join(' | ') + '\n';
    }
    if (ci.openingHours && ci.openingHours.length > 0) {
      fullText += 'Opening Hours: ';
      fullText += ci.openingHours.join(' | ') + '\n';
    }
  }
  
  // Split into words for chunking
  const words = fullText.split(/\s+/);
  
  // Create overlapping chunks - capture ALL content, even small pieces
  for (let i = 0; i < words.length; i += maxChunkSize - overlap) {
    const chunkWords = words.slice(i, i + maxChunkSize);
    const chunkText = chunkWords.join(' ');
    
    // Store ALL chunks, even very short ones - don't filter anything out
    if (chunkText.trim().length > 10) { // Very low threshold - capture everything
      chunks.push({
        text: chunkText.trim(),
        index: chunks.length,
        startWord: i,
        headingPath: content.headings.slice(0, 5).join(' → ') || content.title // Include more headings
      });
    }
  }
  
  // ALWAYS create at least one chunk if we have ANY text at all
  if (chunks.length === 0 && fullText.trim().length > 5) {
    chunks.push({
      text: fullText.trim(),
      index: 0,
      startWord: 0,
      headingPath: content.headings[0] || content.title || content.h1 || 'Untitled'
    });
  }
  
  // If we have content but no chunks were created (shouldn't happen), create one anyway
  if (chunks.length === 0 && (content.title || content.h1 || content.paragraphs.length > 0)) {
    chunks.push({
      text: fullText.trim() || content.title || content.h1 || 'Content',
      index: 0,
      startWord: 0,
      headingPath: content.headings[0] || content.title || content.h1 || 'Untitled'
    });
  }
  
  // Debug: log if no chunks created
  if (chunks.length === 0) {
    console.log(`Warning: No chunks created. Text length: ${fullText.trim().length}, Title: ${content.title || 'none'}, Paragraphs: ${content.paragraphs.length}`);
  }
  
  return chunks;
}

// Embedding queue to prevent overwhelming Ollama
let embeddingQueue = [];
let isProcessingQueue = false;
let modelPreloaded = false;

// Ensure embedding model is loaded before processing
async function ensureModelLoaded() {
  if (modelPreloaded) {
    return true;
  }
  
  try {
    // Import the LLM service - it exports { default: LLMService } or { openai }
    const llmModule = await import('./llm.js');
    const llmService = llmModule.default || new llmModule.LLMService();
    const modelName = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
    console.log('Ensuring embedding model is loaded before processing...');
    
    // Try to use ensureModelLoaded if available, otherwise use preloadEmbeddingModel
    let loaded = false;
    if (llmService.ensureModelLoaded) {
      loaded = await llmService.ensureModelLoaded(modelName);
    } else if (llmService.preloadEmbeddingModel) {
      loaded = await llmService.preloadEmbeddingModel(modelName, 5);
    } else {
      // Fallback: just try a test embedding
      console.log('No model loading method found, attempting test embedding...');
      try {
        await openai.embeddings.create({
          model: modelName,
          input: 'test'
        });
        loaded = true;
      } catch (e) {
        console.log('Test embedding failed, but continuing anyway...');
        loaded = true; // Continue anyway
      }
    }
    
    if (loaded) {
      modelPreloaded = true;
      console.log('✓ Embedding model ready for processing');
      // Give it a moment to stabilize
      await new Promise(resolve => setTimeout(resolve, 1000));
      return true;
    }
    // Even if loading failed, continue - the queue will handle retries
    console.log('⚠️  Model loading uncertain, but continuing with processing...');
    modelPreloaded = true; // Mark as "attempted" to avoid repeated failures
    return true;
  } catch (error) {
    console.error('Error ensuring model is loaded:', error);
    // Continue anyway - the embedding queue will handle errors
    modelPreloaded = true;
    return true;
  }
}

// Keep model warm with periodic requests
let lastWarmRequest = 0;
const WARM_INTERVAL = 30000; // 30 seconds

async function keepModelWarm() {
  const now = Date.now();
  if (now - lastWarmRequest < WARM_INTERVAL) {
    return;
  }
  
  try {
    const llmService = (await import('./llm.js')).default;
    const modelName = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
    
    // Quick warm-up request
    await fetch(`${llmService.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelName, prompt: 'warm' })
    });
    
    lastWarmRequest = now;
  } catch (error) {
    // Silently fail - warming is optional
  }
}

// Process embedding queue sequentially
async function processEmbeddingQueue() {
  if (isProcessingQueue || embeddingQueue.length === 0) {
    return;
  }
  
  // Ensure model is loaded before processing
  if (!modelPreloaded) {
    await ensureModelLoaded();
  }
  
  isProcessingQueue = true;
  
  while (embeddingQueue.length > 0) {
    const { text, resolve, reject } = embeddingQueue.shift();
    
    // Keep model warm periodically
    await keepModelWarm();
    
    let retries = 3;
    let success = false;
    
    while (retries > 0 && !success) {
      try {
        const response = await openai.embeddings.create({
          model: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
          input: text
        });
        resolve(response.data[0].embedding);
        success = true;
        
        // Delay between requests to avoid overwhelming Ollama
        await new Promise(resolve => setTimeout(resolve, 800));
      } catch (error) {
        retries--;
        
        // If it's a model loading error, try to reload
        if ((error.message.includes('EOF') || error.message.includes('500')) && retries > 0) {
          console.log(`Model error (${retries} retries left), reloading model...`);
          modelPreloaded = false;
          await ensureModelLoaded();
          
          // Wait longer before retry
          await new Promise(resolve => setTimeout(resolve, 3000));
        } else if (retries === 0) {
          // Final failure - reject and log
          console.error(`✗ Failed to create embedding after 3 attempts: ${error.message}`);
          reject(error);
        }
      }
    }
  }
  
  isProcessingQueue = false;
}

// Create embeddings using Ollama (queued)
async function createEmbedding(text) {
  return new Promise((resolve, reject) => {
    embeddingQueue.push({ text, resolve, reject });
    processEmbeddingQueue();
  });
}

// Crawl a single page
async function crawlPage(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });
    
    if (!response.ok) {
      console.log(`Failed to fetch ${url}: ${response.status}`);
      return null;
    }
    
    const html = await response.text();
    const content = extractText(html, url);
    
    // VERY lenient check - keep ANY page that was successfully fetched
    // Even if extraction is minimal, we'll still try to create chunks
    const hasContent = content.title || content.h1 || content.headings.length > 0 || 
                      content.paragraphs.length > 0 || content.metaDescription || html.length > 100;
    
    // Always return content - let chunking decide if it's usable
    // Don't skip pages - store everything we can extract
    return content;
  } catch (error) {
    console.error(`Error crawling ${url}:`, error.message);
    return null;
  }
}

// Discover links from a page
async function discoverLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const links = new Set();
  
  // Find all anchor tags
  $('a[href]').each((i, el) => {
    let href = $(el).attr('href');
    if (!href) return;
    
    // Convert relative URLs to absolute
    try {
      const absoluteUrl = new URL(href, baseUrl).href;
      // Only include URLs from the same domain
      if (absoluteUrl.startsWith(baseUrl) && !absoluteUrl.includes('#') && !absoluteUrl.includes('mailto:') && !absoluteUrl.includes('tel:')) {
        // Remove query parameters and fragments for cleaner URLs
        const cleanUrl = absoluteUrl.split('#')[0].split('?')[0];
        links.add(cleanUrl);
      }
    } catch (e) {
      // Invalid URL, skip
    }
  });
  
  return Array.from(links);
}

// Main crawl function
export async function crawlSite(siteUrl = 'https://functiomed.ch') {
  console.log('Starting comprehensive site crawl...');
  
  const visited = new Set();
  const toVisit = new Set();
  const results = [];
  
  // Normalize site URL (remove trailing slash)
  const normalizedSiteUrl = siteUrl.replace(/\/$/, '');
  
  // Try sitemap first
  const sitemapUrls = await fetchSitemapUrls(normalizedSiteUrl);
  if (sitemapUrls.length > 0) {
    console.log(`Found ${sitemapUrls.length} URLs in sitemap`);
    let addedCount = 0;
    sitemapUrls.forEach(url => {
      // Normalize URL (remove trailing slash)
      const normalizedUrl = url.replace(/\/$/, '');
      
      // Normalize both URLs - remove www and protocol for comparison
      const normalizeDomain = (u) => u.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
      const siteDomain = normalizeDomain(normalizedSiteUrl);
      const urlDomain = normalizeDomain(normalizedUrl);
      
      // Match if domains are the same (with or without www, http/https)
      if (urlDomain === siteDomain || urlDomain.startsWith(siteDomain) || siteDomain.startsWith(urlDomain)) {
        // Use the URL from sitemap as-is (preserve www if present)
        toVisit.add(normalizedUrl);
        addedCount++;
      }
    });
    console.log(`Added ${addedCount} URLs to crawl queue (filtered from ${sitemapUrls.length} sitemap URLs)`);
    
    // If no URLs matched, add the homepage
    if (toVisit.size === 0) {
      console.log(`No matching URLs found, adding homepage: ${normalizedSiteUrl}`);
      toVisit.add(normalizedSiteUrl);
    }
  } else {
    // Start with homepage
    toVisit.add(normalizedSiteUrl);
    console.log(`No sitemap found, starting with homepage`);
  }
  
  const initialQueueSize = toVisit.size;
  // Crawl ALL pages - no limit to ensure comprehensive coverage
  const maxPagesToCrawl = initialQueueSize > 0 ? initialQueueSize : 500; // Crawl all pages from sitemap, or up to 500 if discovered
  console.log(`Starting crawl of ${initialQueueSize} URLs (will crawl up to ${maxPagesToCrawl} pages to capture ALL content)...\n`);
  
  // Crawl pages and discover new links
  let pagesCrawled = 0;
  
  while (toVisit.size > 0 && pagesCrawled < maxPagesToCrawl) {
    const urlArray = Array.from(toVisit);
    if (urlArray.length === 0) {
      console.log('No more URLs to visit');
      break;
    }
    
    const url = urlArray[0];
    toVisit.delete(url);
    
    if (visited.has(url)) {
      console.log(`  Already visited: ${url}`);
      continue;
    }
    
    visited.add(url);
    
    console.log(`\n[${pagesCrawled + 1}/${maxPagesToCrawl}] Crawling: ${url}`);
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      });
      
      console.log(`  Response status: ${response.status}`);
      
      if (response.ok) {
        const html = await response.text();
        console.log(`  HTML length: ${html.length} bytes`);
        
        const content = extractText(html, url);
        const metaPreview = content.metaDescription ? content.metaDescription.substring(0, 50) + '...' : 'none';
        console.log(`  Extracted - Title: "${content.title || 'none'}", H1: "${content.h1 || 'none'}", Headings: ${content.headings.length}, Paragraphs: ${content.paragraphs.length}, Meta: "${metaPreview}"`);
        
        // VERY lenient check - accept ANY page that was successfully fetched
        // Even if extraction is minimal, we'll still create chunks from what we have
        const hasContent = content && html.length > 200;  // If page exists and has HTML, accept it
        
        // But also check if we have actual extracted content
        const hasExtractedContent = content && (
          content.title || 
          content.h1 || 
          content.headings.length > 0 || 
          content.paragraphs.length > 0 || 
          content.metaDescription
        );
        
        if (!hasExtractedContent && hasContent) {
          // If page has HTML but extraction failed, try a fallback extraction
          console.log(`  ⚠️  Minimal extraction, trying fallback...`);
          const $ = cheerio.load(html);
          
          // Remove script, style, nav, footer before extracting
          $('script, style, nav, footer, header, [class*="cookie"], [class*="banner"], [class*="menu"], [class*="navigation"]').remove();
          
          const bodyText = $('body').text().trim();
          if (bodyText.length > 10) { // Lower threshold - capture more
            // Split body text into sentences/paragraphs - capture everything
            const sentences = bodyText.split(/[.!?\n]+/).filter(s => s.trim().length > 5); // Lower threshold
            sentences.forEach(s => {
              const clean = s.trim().replace(/\s+/g, ' ');
              if (clean.length > 5 && clean.length < 2000) { // Lower min, higher max
                content.paragraphs.push(clean);
              }
            });
            console.log(`  ✓ Fallback: Added ${sentences.length} sentences from body text (${bodyText.length} total chars)`);
          }
          
          // Also try to get headings if we don't have any
          if (content.headings.length === 0) {
            $('h1, h2, h3, h4, h5, h6').each((i, el) => {
              const headingText = $(el).text().trim();
              if (headingText && headingText.length > 0 && headingText.length < 200) {
                content.headings.push(headingText);
              }
            });
            if (content.headings.length > 0) {
              console.log(`  ✓ Fallback: Found ${content.headings.length} headings`);
            }
          }
        }
        
        // Accept page if we have ANY content at all - be very lenient
        // Even if extraction is minimal, store what we have
        if (hasContent || hasExtractedContent || html.length > 100) {
          results.push({ url, content });
          console.log(`  ✓ SUCCESS: Added page with ${content.paragraphs.length} paragraphs, ${content.headings.length} headings`);
          
          // Discover links from this page
          const newLinks = await discoverLinks(html, siteUrl);
          console.log(`  Found ${newLinks.length} links on this page`);
          newLinks.forEach(link => {
            if (!visited.has(link) && link.startsWith(siteUrl)) {
              toVisit.add(link);
            }
          });
        } else {
          // Even if minimal, try to store something
          if (html.length > 50) {
            // Create minimal content from URL or HTML
            content.title = content.title || url.split('/').pop() || 'Page';
            content.paragraphs = content.paragraphs.length > 0 ? content.paragraphs : ['Content from ' + url];
            results.push({ url, content });
            console.log(`  ⚠ MINIMAL: Stored page with minimal content (${content.paragraphs.length} paragraphs)`);
          } else {
            console.log(`  ✗ SKIPPED: Truly no content (HTML length: ${html.length})`);
          }
        }
        
        pagesCrawled++;
      } else {
        console.log(`  ✗ HTTP ${response.status} - Skipping`);
      }
    } catch (error) {
      console.error(`  ✗ ERROR: ${error.message}`);
    }
    
    // Small delay to be respectful
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`Crawled ${results.length} pages with content`);
  
  // Collect all contact information from all pages
  const allContactInfo = {
    phone: new Set(),
    email: new Set(),
    address: new Set(),
    openingHours: new Set(),
    links: []
  };
  
  results.forEach(({ content }) => {
    if (content.contactInfo) {
      content.contactInfo.phone?.forEach(p => allContactInfo.phone.add(p));
      content.contactInfo.email?.forEach(e => allContactInfo.email.add(e));
      content.contactInfo.address?.forEach(a => allContactInfo.address.add(a));
      content.contactInfo.openingHours?.forEach(h => allContactInfo.openingHours.add(h));
      content.contactInfo.links?.forEach(l => {
        if (!allContactInfo.links.some(existing => existing.href === l.href)) {
          allContactInfo.links.push(l);
        }
      });
    }
  });
  
  // Create a comprehensive contact information chunk
  if (allContactInfo.phone.size > 0 || allContactInfo.email.size > 0 || 
      allContactInfo.address.size > 0 || allContactInfo.openingHours.size > 0) {
    console.log('\n📞 Extracted contact information:');
    console.log(`   Phones: ${Array.from(allContactInfo.phone).join(', ')}`);
    console.log(`   Emails: ${Array.from(allContactInfo.email).join(', ')}`);
    console.log(`   Addresses: ${Array.from(allContactInfo.address).join(' | ')}`);
    console.log(`   Opening Hours: ${Array.from(allContactInfo.openingHours).join(' | ')}`);
    console.log(`   Links: ${allContactInfo.links.length}`);
    
    // Create contact information text for embedding
    let contactText = 'Kontaktinformationen / Contact Information / Informations de contact\n\n';
    
    if (allContactInfo.address.size > 0) {
      contactText += 'Adresse / Address / Adresse:\n';
      Array.from(allContactInfo.address).forEach(addr => {
        contactText += `- ${addr}\n`;
      });
      contactText += '\n';
    }
    
    if (allContactInfo.phone.size > 0) {
      contactText += 'Telefon / Phone / Téléphone:\n';
      Array.from(allContactInfo.phone).forEach(phone => {
        contactText += `- ${phone}\n`;
      });
      contactText += '\n';
    }
    
    if (allContactInfo.email.size > 0) {
      contactText += 'E-Mail / Email:\n';
      Array.from(allContactInfo.email).forEach(email => {
        contactText += `- ${email}\n`;
      });
      contactText += '\n';
    }
    
    if (allContactInfo.openingHours.size > 0) {
      contactText += 'Öffnungszeiten / Opening Hours / Heures d\'ouverture:\n';
      Array.from(allContactInfo.openingHours).forEach(hours => {
        contactText += `- ${hours}\n`;
      });
      contactText += '\n';
    }
    
    if (allContactInfo.links.length > 0) {
      contactText += 'Links:\n';
      allContactInfo.links.forEach(link => {
        contactText += `- ${link.text || link.href}: ${link.href}\n`;
      });
    }
    
    // Store contact information as a special chunk
    const contactChunkId = createHash('sha256')
      .update('functiomed-contact-information')
      .digest('hex');
    
    try {
      const contactEmbedding = await createEmbedding(contactText);
      
      // Check if contact chunk already exists
      const existingContact = db.prepare('SELECT id FROM knowledge_chunks WHERE id = ?').get(contactChunkId);
      
      if (existingContact) {
        db.prepare(`
          UPDATE knowledge_chunks 
          SET page_title = ?, chunk_text = ?, embedding = ?, heading_path = ?, url = ?, updated_at = ?
          WHERE id = ?
        `).run(
          'Kontaktinformationen Functiomed',
          contactText,
          JSON.stringify(contactEmbedding),
          'contact-information',
          'https://functiomed.ch',
          new Date().toISOString(),
          contactChunkId
        );
        console.log('✓ Updated contact information chunk');
      } else {
        db.prepare(`
          INSERT INTO knowledge_chunks 
          (id, url, page_title, heading_path, chunk_text, chunk_index, embedding, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          contactChunkId,
          'https://functiomed.ch',
          'Kontaktinformationen Functiomed',
          'contact-information',
          contactText,
          0,
          JSON.stringify(contactEmbedding),
          JSON.stringify({ type: 'contact_info', extracted: true })
        );
        console.log('✓ Created contact information chunk');
      }
    } catch (error) {
      console.error('Error creating contact information chunk:', error);
    }
  }
  
  // Process and store chunks
  let totalChunks = 0;
  let chunksProcessed = 0;
  let chunksSkipped = 0;
  let totalChunksProcessed = 0;
  
  console.log(`\nProcessing ${results.length} pages into chunks...`);
  
  // Ensure embedding model is loaded before starting chunk processing
  console.log('Preparing embedding model...');
  await ensureModelLoaded();
  console.log('Starting chunk processing...\n');
  
  for (const { url, content } of results) {
    // Debug: Log what content we have
    console.log(`  📄 Content for ${url}:`);
    console.log(`     Title: ${content.title || 'none'}`);
    console.log(`     H1: ${content.h1 || 'none'}`);
    console.log(`     Headings: ${content.headings.length}`);
    console.log(`     Paragraphs: ${content.paragraphs.length}`);
    console.log(`     Meta: ${content.metaDescription ? 'yes' : 'no'}`);
    
    // If we have minimal content, try to extract more aggressively
    if (content.paragraphs.length === 0 && content.headings.length === 0) {
      console.log(`     ⚠️  No paragraphs or headings found, trying aggressive extraction...`);
      // Try to get any text from the page
      // This should have been done in extractText, but let's add a fallback
    }
    
    const chunks = chunkText(content);
    
    if (chunks.length === 0) {
      console.log(`  ⚠️  No chunks created for ${url}`);
      console.log(`     Debug: fullText would be ~${(content.title?.length || 0) + (content.h1?.length || 0) + (content.paragraphs.join(' ').length || 0)} chars`);
      // Create a minimal chunk even if extraction was poor
      if (content.title || content.h1 || content.metaDescription) {
        const minimalText = `${content.title || ''}\n${content.h1 || ''}\n${content.metaDescription || ''}`.trim();
        if (minimalText.length > 10) {
          console.log(`     Creating minimal chunk from available content...`);
          chunks.push({
            text: minimalText,
            index: 0,
            startWord: 0,
            headingPath: content.title || content.h1 || 'Untitled'
          });
        }
      }
      
      // If no chunks created, try to create at least one from whatever we have
      if (chunks.length === 0) {
        // Create a minimal chunk from title, h1, or first paragraph
        const minimalText = content.title || content.h1 || content.paragraphs[0] || content.metaDescription || 'Content from ' + url;
        if (minimalText && minimalText.length > 5) {
          chunks.push({
            text: minimalText,
            index: 0,
            startWord: 0,
            headingPath: content.title || content.h1 || 'Untitled'
          });
          console.log(`     ⚠ Created minimal chunk from available content`);
        } else {
          console.log(`     ✗ Skipping - truly no content available`);
          continue;
        }
      }
    }
    
    console.log(`  ✓ Processing ${url}: ${chunks.length} chunks`);
    totalChunksProcessed += chunks.length;
    
    for (const chunk of chunks) {
      const chunkId = createHash('sha256')
        .update(`${url}-${chunk.index}`)
        .digest('hex');
      
      // Check if chunk already exists
      const existing = db.prepare('SELECT id FROM knowledge_chunks WHERE id = ?').get(chunkId);
      
      if (!existing) {
        try {
          // Create embedding
          const embedding = await createEmbedding(chunk.text);
          
          // Detect language for this chunk (use content language or detect from chunk text)
          const chunkLanguage = content.language || detectLanguage(chunk.text) || 'en';
          
          // Store in database with language field - CRITICAL for proper language filtering
          db.prepare(`
            INSERT INTO knowledge_chunks 
            (id, url, page_title, heading_path, chunk_text, chunk_index, embedding, metadata, language, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            chunkId,
            url,
            content.title || content.h1 || 'Untitled',
            chunk.headingPath || content.title || 'Untitled',
            chunk.text,
            chunk.index,
            JSON.stringify(embedding),
            JSON.stringify({ altTexts: content.altTexts || [] }),
            chunkLanguage, // Store language for proper filtering
            new Date().toISOString(),
            new Date().toISOString()
          );
          
          totalChunks++;
          chunksProcessed++;
          
          // Progress indicator
          if (chunksProcessed % 10 === 0) {
            console.log(`    ... processed ${chunksProcessed} new chunks so far`);
            // Write to disk every 10 chunks to ensure persistence
            lowDb.write();
          }
          
          // Note: Delay is handled by the embedding queue
        } catch (error) {
          console.error(`    ✗ Error processing chunk ${chunk.index} from ${url}:`, error.message);
          // Continue processing other chunks even if one fails
          // The chunk will be skipped but won't block the entire crawl
        }
      } else {
        // Chunk already exists, skip
        chunksSkipped++;
      }
    }
  }
  
  // Final write to ensure all data is persisted
  lowDb.write();
  console.log('   ✓ All data written to disk');
  
  // Get total chunks in database
  const totalInDb = db.prepare('SELECT COUNT(*) as count FROM knowledge_chunks').get().count;
  
  // Verify language distribution
  const langStats = {};
  const allChunks = db.prepare('SELECT language FROM knowledge_chunks').all();
  allChunks.forEach(chunk => {
    const lang = chunk.language || 'unknown';
    langStats[lang] = (langStats[lang] || 0) + 1;
  });
  
  console.log(`\n📊 Chunk Processing Summary:`);
  console.log(`   Total chunks processed: ${totalChunksProcessed}`);
  console.log(`   New chunks stored: ${totalChunks}`);
  console.log(`   Chunks skipped (already exist): ${chunksSkipped}`);
  console.log(`   Total chunks in database: ${totalInDb}`);
  console.log(`   Language distribution:`, langStats);
  console.log(`\n✅ Crawl completed: ${results.length} pages processed`);
  
  // Extract doctors and services from crawled content
  console.log('\n📋 Extracting doctors and services from website...');
  try {
    const { doctors, services } = await extractDoctorsAndServices();
    console.log(`✅ Extracted ${doctors.length} doctors and ${services.length} services`);
  } catch (error) {
    console.error('⚠️  Error extracting doctors/services:', error.message);
  }
  
  return { 
    pages: results.length, 
    chunks: totalChunks,
    chunksProcessed: totalChunksProcessed,
    chunksSkipped: chunksSkipped,
    totalInDatabase: totalInDb
  };
}

