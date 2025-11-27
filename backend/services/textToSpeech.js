import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import dotenv from 'dotenv';

dotenv.config();

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY || ''
});

// Default voice ID - you can change this to any voice from ElevenLabs
// Using a professional, natural-sounding voice
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel - professional female voice
// Alternative voices:
// 'EXAVITQu4vr4xnSDxMaL' - Bella - warm female voice
// 'pNInz6obpgDQGcFmaJgB' - Adam - professional male voice
// 'ErXwobaYiN019PkySvjV' - Antoni - professional male voice

/**
 * Convert text to speech using ElevenLabs API
 * @param {string} text - The text to convert to speech
 * @param {string} voiceId - Optional voice ID (defaults to Rachel)
 * @returns {Promise<Buffer>} - Audio buffer
 */
export async function textToSpeech(text, voiceId = DEFAULT_VOICE_ID) {
  try {
    if (!process.env.ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY is not set in environment variables');
    }

    // Clean up text - remove markdown, special characters, and extra whitespace
    const cleanText = text
      .replace(/#{1,6}\s*/g, '') // Remove markdown headings
      .replace(/\*\*/g, '') // Remove bold markers
      .replace(/\*/g, '') // Remove italic markers
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Convert markdown links to plain text
      .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
      .trim();

    // Use the multilingual_v2 model (reliable and good quality)
    // Optimized settings for faster generation
    const audio = await elevenlabs.textToSpeech.convert(voiceId, {
      text: cleanText,
      model_id: 'eleven_multilingual_v2', // Reliable model with good quality
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0, // Reduced style for faster generation
        use_speaker_boost: false // Disable speaker boost for faster generation
      }
    });

    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of audio) {
      chunks.push(chunk);
    }
    
    return Buffer.concat(chunks);
  } catch (error) {
    console.error('ElevenLabs TTS error:', error);
    throw error;
  }
}

/**
 * Get available voices from ElevenLabs
 * @returns {Promise<Array>} - List of available voices
 */
export async function getAvailableVoices() {
  try {
    if (!process.env.ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY is not set in environment variables');
    }

    const voices = await elevenlabs.voices.getAll();
    return voices.voices;
  } catch (error) {
    console.error('Error fetching voices:', error);
    throw error;
  }
}

