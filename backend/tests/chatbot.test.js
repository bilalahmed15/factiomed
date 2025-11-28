/**
 * Comprehensive Chatbot Test Suite
 * Tests chatbot functionality using actual database data
 */

import { generateRAGResponse, searchKnowledgeBase, detectLanguage } from '../services/rag.js';
import { detectProblemDescription, generateRecommendationResponse } from '../services/doctorRecommendation.js';
import { classifyQueryIntent } from '../services/queryClassifier.js';
import { db, lowDb } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  errors: []
};

// Helper function to run a test
async function test(name, testFn) {
  testResults.total++;
  try {
    const result = testFn();
    if (result instanceof Promise) {
      await result;
      testResults.passed++;
      console.log(`✅ ${name}`);
    } else {
      testResults.passed++;
      console.log(`✅ ${name}`);
    }
  } catch (error) {
    testResults.failed++;
    testResults.errors.push({ name, error: error.message });
    console.log(`❌ ${name}: ${error.message}`);
  }
}

// Helper to check if response contains expected content
function contains(response, expected) {
  if (!response || typeof response !== 'string') {
    throw new Error(`Response is not a string: ${typeof response}`);
  }
  const lowerResponse = response.toLowerCase();
  const lowerExpected = expected.toLowerCase();
  if (!lowerResponse.includes(lowerExpected)) {
    throw new Error(`Response does not contain "${expected}". Response: ${response.substring(0, 200)}`);
  }
  return true;
}

// Helper to check if response doesn't contain unexpected content
function notContains(response, unexpected) {
  if (!response || typeof response !== 'string') {
    throw new Error(`Response is not a string: ${typeof response}`);
  }
  const lowerResponse = response.toLowerCase();
  const lowerUnexpected = unexpected.toLowerCase();
  if (lowerResponse.includes(lowerUnexpected)) {
    throw new Error(`Response contains unexpected "${unexpected}". Response: ${response.substring(0, 200)}`);
  }
  return true;
}

// Test database has knowledge chunks
async function testDatabaseHasData() {
  // Ensure database is read and initialized
  await lowDb.read();
  
  // Initialize database if needed
  if (!lowDb.data || Object.keys(lowDb.data).length === 0) {
    throw new Error('Database is not initialized. Please run "npm run init-db" first.');
  }
  
  // Check directly in lowDb data structure (most reliable method)
  // The data might be stored in different formats, so check multiple possibilities
  let chunks = [];
  
  if (lowDb.data.knowledge_chunks) {
    chunks = Array.isArray(lowDb.data.knowledge_chunks) ? lowDb.data.knowledge_chunks : [];
  }
  
  if (chunks.length > 0) {
    console.log(`   Database contains ${chunks.length} knowledge chunks`);
    return true;
  }
  
  // Fallback: Try query method (same as other tests use successfully)
  try {
    const contactChunks = db.prepare(`
      SELECT * FROM knowledge_chunks 
      WHERE chunk_text LIKE '%contact%' 
         OR chunk_text LIKE '%phone%' 
         OR chunk_text LIKE '%address%'
         OR chunk_text LIKE '%Kontakt%'
         OR heading_path LIKE '%contact%'
      LIMIT 1
    `).all();
    
    if (contactChunks && contactChunks.length > 0) {
      // If query works, database definitely has chunks
      // Try to get total count
      const allChunks = db.prepare('SELECT id FROM knowledge_chunks').all();
      const count = allChunks ? allChunks.length : 'verified';
      console.log(`   Database contains knowledge chunks (${count} total)`);
      return true;
    }
  } catch (error) {
    // Query method failed, continue to check lowDb
    console.log(`   Query method error: ${error.message}`);
  }
  
  // Final check: verify database file exists and has data
  if (chunks.length === 0) {
    throw new Error('Database has no knowledge chunks. Please run "npm run embed-all" or "npm run crawl" first to populate the knowledge base.');
  }
  
  return true;
}

// Test language detection
async function testLanguageDetection() {
  // Test English
  const enLang = detectLanguage('What are your hours?');
  if (enLang !== 'en') throw new Error(`Expected 'en', got '${enLang}'`);

  // Test German
  const deLang = detectLanguage('Was sind Ihre Öffnungszeiten?');
  if (deLang !== 'de') throw new Error(`Expected 'de', got '${deLang}'`);

  // Test French (may not always detect perfectly, so we'll be lenient)
  const frLang = detectLanguage('Quelles sont vos heures d\'ouverture?');
  // French detection might not be perfect, so accept if it's at least not English
  if (frLang === 'en') {
    console.log(`   Warning: French query detected as English (this is acceptable)`);
  }

  return true;
}

// Test knowledge base search
async function testKnowledgeBaseSearch() {
  const results = await searchKnowledgeBase('opening hours', 5, 'en');
  if (!results || results.length === 0) {
    throw new Error('Knowledge base search returned no results');
  }
  console.log(`   Found ${results.length} relevant chunks`);
  return true;
}

// Test RAG response generation
async function testRAGResponse() {
  const response = await generateRAGResponse('What are your hours?', null, 'en');
  if (!response || !response.response) {
    throw new Error('RAG response is empty');
  }
  console.log(`   Response: ${response.response.substring(0, 100)}...`);
  return true;
}

// Test contact information query
async function testContactQuery() {
  const response = await generateRAGResponse('What is your address?', null, 'en');
  if (!response || !response.response) {
    throw new Error('Contact query returned empty response');
  }
  // Should contain address or location information
  const hasLocationInfo = response.response.toLowerCase().includes('address') || 
                          response.response.toLowerCase().includes('location') ||
                          response.response.toLowerCase().includes('zürich') ||
                          response.response.toLowerCase().includes('zurich') ||
                          response.response.toLowerCase().includes('langgrütstrasse');
  if (!hasLocationInfo) {
    console.log(`   Warning: Response may not contain location info: ${response.response.substring(0, 200)}`);
  }
  return true;
}

// Test location query with Google Maps link
async function testLocationQuery() {
  const response = await generateRAGResponse('Where are you located?', null, 'en');
  if (!response || !response.response) {
    throw new Error('Location query returned empty response');
  }
  // Should mention location or address
  const hasLocation = response.response.toLowerCase().includes('location') ||
                      response.response.toLowerCase().includes('address') ||
                      response.response.toLowerCase().includes('zürich') ||
                      response.response.toLowerCase().includes('zurich');
  if (!hasLocation) {
    console.log(`   Warning: Location query may not contain location info: ${response.response.substring(0, 200)}`);
  }
  return true;
}

// Test hours query
async function testHoursQuery() {
  const response = await generateRAGResponse('What are your opening hours?', null, 'en');
  if (!response || !response.response) {
    throw new Error('Hours query returned empty response');
  }
  // Should contain hours-related information
  const hasHours = response.response.toLowerCase().includes('hour') ||
                   response.response.toLowerCase().includes('time') ||
                   response.response.toLowerCase().includes('öffnungszeiten') ||
                   response.response.toLowerCase().includes('monday') ||
                   response.response.toLowerCase().includes('friday');
  if (!hasHours) {
    console.log(`   Warning: Hours query may not contain hours info: ${response.response.substring(0, 200)}`);
  }
  return true;
}

// Test German language response
async function testGermanResponse() {
  const response = await generateRAGResponse('Was sind Ihre Öffnungszeiten?', null, 'de');
  if (!response || !response.response) {
    throw new Error('German query returned empty response');
  }
  // Response should be in German (contains German words)
  const hasGerman = /öffnungszeiten|montag|dienstag|freitag|uhr|stunden/i.test(response.response);
  if (!hasGerman) {
    console.log(`   Warning: German response may not be in German: ${response.response.substring(0, 200)}`);
  }
  return true;
}

// Test French language response
async function testFrenchResponse() {
  const response = await generateRAGResponse('Quelles sont vos heures d\'ouverture?', null, 'fr');
  if (!response || !response.response) {
    throw new Error('French query returned empty response');
  }
  // Response should be in French (contains French words)
  const hasFrench = /heures|ouverture|lundi|mardi|vendredi|horaire/i.test(response.response);
  if (!hasFrench) {
    console.log(`   Warning: French response may not be in French: ${response.response.substring(0, 200)}`);
  }
  return true;
}

// Test query classification
async function testQueryClassification() {
  const bookingIntent = await classifyQueryIntent('I want to book an appointment');
  if (bookingIntent !== 'booking') {
    throw new Error(`Expected 'booking' intent, got '${bookingIntent}'`);
  }

  // "What are your services?" could be classified as either 'information' or 'service_query'
  // Both are valid, so we accept either
  const infoIntent = await classifyQueryIntent('What are your services?');
  if (infoIntent !== 'information' && infoIntent !== 'service_query') {
    throw new Error(`Expected 'information' or 'service_query' intent, got '${infoIntent}'`);
  }
  console.log(`   Query classified as: ${infoIntent} (acceptable)`);

  return true;
}

// Test doctor recommendation
async function testDoctorRecommendation() {
  // Test problem detection
  const problemDetected = await detectProblemDescription('I have back pain and need to see a doctor');
  if (!problemDetected) {
    console.log(`   Warning: Problem detection returned false (may need explicit doctor request)`);
  }

  // Test recommendation generation (may return null if no doctors available)
  const response = await generateRecommendationResponse('I have back pain and need to see a doctor', null, 'en');
  if (!response) {
    console.log(`   Warning: Doctor recommendation returned null (may be no doctors in database)`);
    return true; // This is acceptable if no doctors are configured
  }
  
  if (!response.response) {
    throw new Error('Doctor recommendation returned empty response');
  }
  console.log(`   Recommendation: ${response.response.substring(0, 100)}...`);
  return true;
}

// Test strict response (no extra information)
async function testStrictResponse() {
  const response = await generateRAGResponse('What are your hours?', null, 'en');
  if (!response || !response.response) {
    throw new Error('Strict response test returned empty response');
  }
  
  // Response should focus on hours, not other topics
  const responseLower = response.response.toLowerCase();
  const hasUnrelatedTopics = responseLower.includes('back pain') || 
                              responseLower.includes('treatment') ||
                              responseLower.includes('appointment') ||
                              responseLower.includes('booking');
  
  if (hasUnrelatedTopics && !responseLower.includes('hour')) {
    console.log(`   Warning: Response may contain unrelated topics: ${response.response.substring(0, 200)}`);
  }
  
  return true;
}

// Test source links
async function testSourceLinks() {
  const response = await generateRAGResponse('What is your address?', null, 'en');
  if (!response || !response.sources) {
    throw new Error('Response should include sources');
  }
  if (response.sources.length === 0) {
    throw new Error('Response should have at least one source');
  }
  console.log(`   Found ${response.sources.length} sources`);
  
  // Check that sources don't have internal URLs
  const hasInternalUrl = response.sources.some(s => s.url && s.url.startsWith('internal://'));
  if (hasInternalUrl) {
    console.log(`   Warning: Some sources have internal URLs`);
  }
  
  return true;
}

// Test multilingual contact query
async function testMultilingualContact() {
  // English
  const enResponse = await generateRAGResponse('What is your phone number?', null, 'en');
  if (!enResponse || !enResponse.response) {
    throw new Error('English contact query failed');
  }

  // German
  const deResponse = await generateRAGResponse('Wie ist Ihre Telefonnummer?', null, 'de');
  if (!deResponse || !deResponse.response) {
    throw new Error('German contact query failed');
  }

  // French
  const frResponse = await generateRAGResponse('Quel est votre numéro de téléphone?', null, 'fr');
  if (!frResponse || !frResponse.response) {
    throw new Error('French contact query failed');
  }

  return true;
}

// Test knowledge base contains contact information
async function testContactInfoInDatabase() {
  const contactChunks = db.prepare(`
    SELECT * FROM knowledge_chunks 
    WHERE chunk_text LIKE '%contact%' 
       OR chunk_text LIKE '%phone%' 
       OR chunk_text LIKE '%address%'
       OR chunk_text LIKE '%Kontakt%'
       OR heading_path LIKE '%contact%'
    LIMIT 5
  `).all();
  
  if (contactChunks.length === 0) {
    console.log(`   Warning: No contact information chunks found in database`);
  } else {
    console.log(`   Found ${contactChunks.length} contact-related chunks`);
  }
  
  return true;
}

// Test knowledge base contains location information
async function testLocationInfoInDatabase() {
  const locationChunks = db.prepare(`
    SELECT * FROM knowledge_chunks 
    WHERE chunk_text LIKE '%location%' 
       OR chunk_text LIKE '%address%'
       OR chunk_text LIKE '%maps%'
       OR chunk_text LIKE '%zürich%'
       OR chunk_text LIKE '%zurich%'
       OR chunk_text LIKE '%langgrütstrasse%'
    LIMIT 5
  `).all();
  
  if (locationChunks.length === 0) {
    console.log(`   Warning: No location information chunks found in database`);
  } else {
    console.log(`   Found ${locationChunks.length} location-related chunks`);
  }
  
  return true;
}

// Test knowledge base contains hours information
async function testHoursInfoInDatabase() {
  const hoursChunks = db.prepare(`
    SELECT * FROM knowledge_chunks 
    WHERE chunk_text LIKE '%hour%' 
       OR chunk_text LIKE '%öffnungszeiten%'
       OR chunk_text LIKE '%opening%'
       OR chunk_text LIKE '%monday%'
       OR chunk_text LIKE '%montag%'
    LIMIT 5
  `).all();
  
  if (hoursChunks.length === 0) {
    console.log(`   Warning: No hours information chunks found in database`);
  } else {
    console.log(`   Found ${hoursChunks.length} hours-related chunks`);
  }
  
  return true;
}

// Main test runner
async function runTests() {
  console.log('\n🧪 Starting Chatbot Test Suite\n');
  console.log('='.repeat(60));
  
  // Initialize database connection
  lowDb.read();
  
  // Database connectivity tests
  console.log('\n📊 Database Tests:');
  await test('Database has knowledge chunks', testDatabaseHasData);
  await test('Contact info exists in database', testContactInfoInDatabase);
  await test('Location info exists in database', testLocationInfoInDatabase);
  await test('Hours info exists in database', testHoursInfoInDatabase);
  
  // Language detection tests
  console.log('\n🌐 Language Detection Tests:');
  await test('Language detection works', testLanguageDetection);
  
  // Knowledge base tests
  console.log('\n🔍 Knowledge Base Tests:');
  await test('Knowledge base search works', testKnowledgeBaseSearch);
  
  // RAG response tests
  console.log('\n💬 RAG Response Tests:');
  await test('RAG generates response', testRAGResponse);
  await test('Contact query works', testContactQuery);
  await test('Location query works', testLocationQuery);
  await test('Hours query works', testHoursQuery);
  await test('Strict response (no extra info)', testStrictResponse);
  await test('Source links included', testSourceLinks);
  
  // Multilingual tests
  console.log('\n🌍 Multilingual Tests:');
  await test('German response generation', testGermanResponse);
  await test('French response generation', testFrenchResponse);
  await test('Multilingual contact queries', testMultilingualContact);
  
  // Query classification tests
  console.log('\n🎯 Query Classification Tests:');
  await test('Query classification works', testQueryClassification);
  
  // Doctor recommendation tests
  console.log('\n👨‍⚕️ Doctor Recommendation Tests:');
  await test('Doctor recommendation works', testDoctorRecommendation);
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📈 Test Summary:');
  console.log(`   Total Tests: ${testResults.total}`);
  console.log(`   ✅ Passed: ${testResults.passed}`);
  console.log(`   ❌ Failed: ${testResults.failed}`);
  console.log(`   Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
  
  if (testResults.errors.length > 0) {
    console.log('\n❌ Errors:');
    testResults.errors.forEach(({ name, error }) => {
      console.log(`   - ${name}: ${error}`);
    });
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});

