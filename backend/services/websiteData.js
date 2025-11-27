import { db } from '../config/database.js';
import { openai } from './llm.js';

/**
 * Extract doctors and services from website content using OpenAI
 */
export async function extractDoctorsAndServices() {
  try {
    // Get all knowledge chunks - prioritize team/about/staff pages
    const allChunks = db.prepare(`
      SELECT DISTINCT chunk_text, url, page_title 
      FROM knowledge_chunks 
      ORDER BY 
        CASE 
          WHEN url LIKE '%team%' OR url LIKE '%about%' OR url LIKE '%staff%' OR url LIKE '%doctor%' OR url LIKE '%physician%' THEN 1
          WHEN page_title LIKE '%team%' OR page_title LIKE '%about%' OR page_title LIKE '%staff%' OR page_title LIKE '%doctor%' THEN 2
          ELSE 3
        END,
        created_at DESC
    `).all();
    
    if (!allChunks || allChunks.length === 0) {
      console.log('No knowledge chunks found. Please crawl the website first.');
      return { doctors: [], services: [] };
    }
    
    console.log(`Processing ${allChunks.length} chunks for doctor/service extraction...`);
    
    // Process in batches to handle more content
    const batchSize = 50000; // Increased from 15000
    const batches = [];
    let currentBatch = '';
    
    for (const chunk of allChunks) {
      const chunkText = `${chunk.page_title}\n${chunk.chunk_text}\n`;
      if (currentBatch.length + chunkText.length > batchSize && currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = chunkText;
      } else {
        currentBatch += chunkText;
      }
    }
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }
    
    const allDoctors = new Set();
    const allServices = new Set();
    
    // Process each batch
    for (let i = 0; i < batches.length; i++) {
      const batchText = batches[i];
      console.log(`Processing batch ${i + 1}/${batches.length} (${batchText.length} chars)...`);
      
      const systemPrompt = `You are extracting structured information from a medical practice website (functiomed.ch).

CRITICAL: Extract ALL team members, doctors, physicians, practitioners, and staff mentioned on the website.

Extract:
1. **Doctors/Physicians/Team Members**: 
   - ALL medical professionals (doctors, physicians, therapists, specialists, practitioners)
   - Include titles: "Dr.", "Dr", "MD", "Physician", "Specialist", "Therapist", etc.
   - Include full names: "Dr. Martin Schwendenmann", "Martin Schwendenmann", "Dr. Smith", "John Doe"
   - Include team members, staff members, practitioners
   - Look for names in sections like "Team", "About Us", "Staff", "Doctors", "Physicians", "Our Team"
   - Extract from headings, paragraphs, lists, team pages, about pages
   - Include variations (e.g., both "Dr. Martin Schwendenmann" and "Martin Schwendenmann" if both appear)
   
2. **Services**: 
   - ALL medical services offered (e.g., "General Consultation", "Physical Therapy", "Infusion Therapy", "Physiotherapy", "Massage Therapy", "Nutrition Counseling")
   - Include specific treatments, therapies, consultations
   - Extract from service pages, lists, descriptions

Return ONLY a JSON object with this structure:
{
  "doctors": ["Dr. Martin Schwendenmann", "Martin Schwendenmann", "Dr. Name2", "Team Member Name", ...],
  "services": ["Service Name 1", "Service Name 2", ...]
}

Important:
- Extract EVERY doctor/physician/team member mentioned, not just the main ones
- Include ALL variations of names (with/without titles)
- Only include doctors/services that are explicitly mentioned on the website
- Use full names as they appear on the website
- Services should be specific medical services, not generic terms like "medical care"
- Be thorough - extract from team pages, about pages, staff pages, doctor pages, etc.`;

      const completion = await openai.chat.completions.create({
        model: process.env.OLLAMA_CHAT_MODEL || 'llama3.2',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract ALL doctors/team members and services from this website content (batch ${i + 1}/${batches.length}):\n\n${batchText}` }
        ],
        temperature: 0.2, // Lower temperature for more consistent extraction
        response_format: { type: 'json_object' }
      });
      
      const result = JSON.parse(completion.choices[0].message.content);
      
      // Add to sets to avoid duplicates
      if (result.doctors && Array.isArray(result.doctors)) {
        result.doctors.forEach(doctor => {
          if (doctor && typeof doctor === 'string' && doctor.trim().length > 0) {
            allDoctors.add(doctor.trim());
          }
        });
      }
      
      if (result.services && Array.isArray(result.services)) {
        result.services.forEach(service => {
          if (service && typeof service === 'string' && service.trim().length > 0) {
            allServices.add(service.trim());
          }
        });
      }
    }
    
    console.log(`Found ${allDoctors.size} unique doctors and ${allServices.size} unique services`);
    
    // Store doctors with deduplication (normalize names)
    const existingDoctors = db.prepare('SELECT DISTINCT name FROM doctors').all().map(d => d.name);
    const newDoctors = Array.from(allDoctors).filter(d => !existingDoctors.includes(d));
    
    // Normalize and deduplicate doctor names
    const normalizedDoctors = new Map();
    for (const doctorName of Array.from(allDoctors)) {
      if (!doctorName || doctorName.length === 0) continue;
      
      // Normalize: remove extra spaces, convert to lowercase for comparison
      const normalized = doctorName.trim().replace(/\s+/g, ' ').toLowerCase();
      
      // Check if we already have a similar name
      let found = false;
      for (const [key, value] of normalizedDoctors.entries()) {
        // Check if names are similar (same person, different format)
        const keyNormalized = key.replace(/^(dr\.?\s*|prof\.?\s*dr\.?\s*)/i, '').trim();
        const nameNormalized = normalized.replace(/^(dr\.?\s*|prof\.?\s*dr\.?\s*)/i, '').trim();
        
        // If the core name (without title) matches, prefer the one with title
        if (keyNormalized === nameNormalized || 
            keyNormalized.includes(nameNormalized) || 
            nameNormalized.includes(keyNormalized)) {
          // Prefer the version with more complete title/name
          if (doctorName.length > value.length || doctorName.match(/^(Dr\.?|Prof\.?\s*Dr\.?)/i)) {
            normalizedDoctors.delete(key);
            normalizedDoctors.set(normalized, doctorName);
          }
          found = true;
          break;
        }
      }
      
      if (!found) {
        normalizedDoctors.set(normalized, doctorName);
      }
    }
    
    // Store unique doctors
    const uniqueDoctors = Array.from(normalizedDoctors.values());
    const doctorsToAdd = uniqueDoctors.filter(d => !existingDoctors.includes(d));
    
    for (const doctorName of doctorsToAdd) {
      if (doctorName && doctorName.length > 0) {
        db.prepare(`
          INSERT INTO doctors (id, name, created_at)
          VALUES (?, ?, ?)
        `).run(
          `doctor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          doctorName,
          new Date().toISOString()
        );
      }
    }
    
    // Store services
    const existingServices = db.prepare('SELECT DISTINCT name FROM services').all().map(s => s.name);
    const newServices = Array.from(allServices).filter(s => !existingServices.includes(s));
    
    for (const serviceName of newServices) {
      if (serviceName && serviceName.length > 0) {
        db.prepare(`
          INSERT INTO services (id, name, created_at)
          VALUES (?, ?, ?)
        `).run(
          `service_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          serviceName,
          new Date().toISOString()
        );
      }
    }
    
    console.log(`✅ Extracted ${doctorsToAdd.length} new doctors and ${newServices.length} new services from website`);
    console.log(`   Total unique doctors in database: ${existingDoctors.length + doctorsToAdd.length}`);
    console.log(`   Total services in database: ${existingServices.length + newServices.length}`);
    
    return {
      doctors: db.prepare('SELECT * FROM doctors ORDER BY name').all(),
      services: db.prepare('SELECT * FROM services ORDER BY name').all()
    };
  } catch (error) {
    console.error('Error extracting doctors and services:', error);
    return { doctors: [], services: [] };
  }
}

/**
 * Get all doctors from database
 */
export function getDoctors() {
  try {
    return db.prepare('SELECT * FROM doctors ORDER BY name').all();
  } catch (error) {
    console.error('Error fetching doctors:', error);
    return [];
  }
}

/**
 * Get all services from database
 */
export function getServices() {
  try {
    const services = db.prepare('SELECT * FROM services ORDER BY name').all();
    
    // If no services found, return default services
    if (!services || services.length === 0) {
      console.log('No services found in database, returning default services');
      return [
        { id: 'default_1', name: 'General Consultation', created_at: new Date().toISOString() },
        { id: 'default_2', name: 'Physical Therapy', created_at: new Date().toISOString() },
        { id: 'default_3', name: 'Physiotherapy', created_at: new Date().toISOString() },
        { id: 'default_4', name: 'Infusion Therapy', created_at: new Date().toISOString() },
        { id: 'default_5', name: 'Consultation', created_at: new Date().toISOString() }
      ];
    }
    
    return services;
  } catch (error) {
    console.error('Error fetching services:', error);
    // Return default services on error
    return [
      { id: 'default_1', name: 'General Consultation', created_at: new Date().toISOString() },
      { id: 'default_2', name: 'Physical Therapy', created_at: new Date().toISOString() },
      { id: 'default_3', name: 'Physiotherapy', created_at: new Date().toISOString() },
      { id: 'default_4', name: 'Infusion Therapy', created_at: new Date().toISOString() },
      { id: 'default_5', name: 'Consultation', created_at: new Date().toISOString() }
    ];
  }
}

