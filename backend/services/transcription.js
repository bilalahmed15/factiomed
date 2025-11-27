import OpenAI from 'openai';
import { db } from '../config/database.js';
import { randomUUID } from 'crypto';
import { createWriteStream, createReadStream, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const UPLOAD_DIR = join(__dirname, '../uploads');

if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Save uploaded file
export async function saveUploadedFile(fileStream, fileName) {
  const fileId = randomUUID();
  const fileExt = fileName.split('.').pop();
  const filePath = join(UPLOAD_DIR, `${fileId}.${fileExt}`);
  
  await pipeline(fileStream, createWriteStream(filePath));
  
  return {
    fileId,
    filePath,
    fileName
  };
}

// Transcribe audio using OpenAI Whisper
export async function transcribeAudio(filePath) {
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(filePath),
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment']
    });
    
    return {
      text: transcription.text,
      language: transcription.language,
      duration: transcription.duration,
      segments: transcription.segments || []
    };
  } catch (error) {
    console.error('Transcription error:', error);
    throw error;
  }
}

// Summarize and extract information from transcript
export async function summarizeTranscript(transcriptText) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a medical assistant that summarizes transcripts. Extract:
1. A brief executive summary (2-4 sentences)
2. List of attendees with their roles
3. Action items with assignees and due dates if mentioned
4. Key decisions and next steps
5. Any mentioned diagnoses, medications, or treatment instructions (flag these for clinician review)

Return your response as JSON with this structure:
{
  "summary": "...",
  "attendees": [{"name": "...", "role": "..."}],
  "actionItems": [{"item": "...", "assignee": "...", "dueDate": "..."}],
  "decisions": ["..."],
  "clinicalInfo": [{"type": "diagnosis|medication|instruction", "content": "...", "requiresReview": true}]
}`
        },
        {
          role: 'user',
          content: `Please summarize and extract information from this transcript:\n\n${transcriptText}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });
    
    const extracted = JSON.parse(completion.choices[0].message.content);
    
    // Check if clinical info requires review
    const requiresReview = extracted.clinicalInfo && extracted.clinicalInfo.length > 0;
    
    return {
      ...extracted,
      requiresReview
    };
  } catch (error) {
    console.error('Summarization error:', error);
    throw error;
  }
}

// Process audio file end-to-end
export async function processAudioFile(fileStream, fileName, fileSize) {
  const fileInfo = await saveUploadedFile(fileStream, fileName);
  const transcriptId = randomUUID();
  
  try {
    // Create transcript record
    db.prepare(`
      INSERT INTO transcripts 
      (id, file_name, file_path, file_size, status)
      VALUES (?, ?, ?, ?, 'processing')
    `).run(transcriptId, fileInfo.fileName, fileInfo.filePath, fileSize);
    
    // Transcribe
    const transcription = await transcribeAudio(fileInfo.filePath);
    
    // Summarize
    const summary = await summarizeTranscript(transcription.text);
    
    // Update transcript record
    db.prepare(`
      UPDATE transcripts 
      SET raw_transcript = ?, 
          summary = ?,
          attendees = ?,
          action_items = ?,
          extracted_info = ?,
          duration_seconds = ?,
          confidence_score = ?,
          requires_review = ?,
          status = 'completed',
          updated_at = ?
      WHERE id = ?
    `).run(
      transcription.text,
      summary.summary,
      JSON.stringify(summary.attendees || []),
      JSON.stringify(summary.actionItems || []),
      JSON.stringify(summary),
      transcription.duration,
      0.85, // Placeholder confidence score
      summary.requiresReview ? 1 : 0,
      new Date().toISOString(),
      transcriptId
    );
    
    // Log audit
    db.prepare(`
      INSERT INTO audit_logs (id, action_type, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      'transcript_processed',
      'transcript',
      transcriptId,
      JSON.stringify({ fileName: fileInfo.fileName, requiresReview: summary.requiresReview })
    );
    
    return {
      transcriptId,
      transcription: transcription.text,
      summary: summary.summary,
      attendees: summary.attendees,
      actionItems: summary.actionItems,
      decisions: summary.decisions,
      clinicalInfo: summary.clinicalInfo,
      requiresReview: summary.requiresReview
    };
  } catch (error) {
    // Update status to failed
    db.prepare(`
      UPDATE transcripts SET status = 'failed', updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), transcriptId);
    
    throw error;
  }
}
