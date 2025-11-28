import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

// FishSpeech/OpenAudio model on Replicate
// Using the official FishSpeech model: fishaudio/fish-speech-1.4
// Alternative: jichengdu/fish-speech (community version)
const FISHSPEECH_MODEL = process.env.FISHSPEECH_MODEL || 'fishaudio/fish-speech-1.4';
const REPLICATE_API_URL = 'https://api.replicate.com/v1/predictions';

// Default voice reference (can be customized with voice cloning)
// For zero-shot, we can use a reference audio URL or let the model use default voice
const DEFAULT_VOICE_REF = process.env.FISHSPEECH_VOICE_REF || null; // Optional: URL to reference audio for voice cloning

/**
 * Convert text to speech using FishSpeech (OpenAudio) via Replicate API
 * @param {string} text - The text to convert to speech
 * @param {string} voiceRef - Optional voice reference URL for voice cloning
 * @param {string} language - Language code (en, de, fr, etc.)
 * @returns {Promise<Buffer>} - Audio buffer (WAV format)
 */
export async function textToSpeech(text, voiceRef = null, language = 'en') {
  try {
    if (!process.env.REPLICATE_API_TOKEN) {
      throw new Error('REPLICATE_API_TOKEN is not set in environment variables');
    }

    // Clean up text - remove markdown, special characters, and extra whitespace
    const cleanText = text
      .replace(/#{1,6}\s*/g, '') // Remove markdown headings
      .replace(/\*\*/g, '') // Remove bold markers
      .replace(/\*/g, '') // Remove italic markers
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Convert markdown links to plain text
      .replace(/<[^>]+>/g, '') // Remove HTML tags
      .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
      .trim();

    if (!cleanText) {
      throw new Error('Text is empty after cleaning');
    }

    // Prepare input for FishSpeech
    // FishSpeech model expects: text, language, and optionally reference_audio for voice cloning
    const input = {
      text: cleanText,
      language: language, // en, de, fr, etc.
      // Optional: voice cloning with reference audio (URL to audio file)
      ...(voiceRef || DEFAULT_VOICE_REF ? { reference_audio: voiceRef || DEFAULT_VOICE_REF } : {})
    };

    console.log(`🎤 Generating speech with FishSpeech (${language})...`);

    // Replicate API format: use model identifier (owner/model:version or just owner/model)
    // If version is specified in env, use it; otherwise use model name for latest version
    const modelIdentifier = process.env.FISHSPEECH_VERSION || FISHSPEECH_MODEL;
    
    // Create prediction using Replicate API
    // Replicate expects: { version: "model-version-id" } OR we can use the model directly
    // For FishSpeech, we'll use the model name format: owner/model
    const createResponse = await fetch(REPLICATE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: modelIdentifier.includes(':') ? modelIdentifier.split(':')[1] : modelIdentifier,
        input: input
      })
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Replicate API error: ${createResponse.status} - ${errorText}`);
    }

    const prediction = await createResponse.json();
    const predictionId = prediction.id;

    if (!predictionId) {
      throw new Error('Failed to create prediction');
    }

    // Poll for completion
    let result = null;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds timeout (1 second intervals)

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

      const statusResponse = await fetch(`${REPLICATE_API_URL}/${predictionId}`, {
        headers: {
          'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
        },
      });

      if (!statusResponse.ok) {
        throw new Error(`Failed to check prediction status: ${statusResponse.status}`);
      }

      result = await statusResponse.json();

      if (result.status === 'succeeded') {
        break;
      } else if (result.status === 'failed' || result.status === 'canceled') {
        throw new Error(`Prediction ${result.status}: ${result.error || 'Unknown error'}`);
      }

      attempts++;
    }

    if (!result || result.status !== 'succeeded') {
      throw new Error('Prediction timed out or failed');
    }

    // Get audio URL from output
    // Replicate output can be a string (URL) or array of URLs
    let audioUrl = result.output;
    if (!audioUrl) {
      throw new Error('No audio output received from FishSpeech');
    }

    // Handle array output (take first URL if array)
    if (Array.isArray(audioUrl)) {
      audioUrl = audioUrl[0];
    }

    if (typeof audioUrl !== 'string') {
      throw new Error(`Unexpected output format: ${typeof audioUrl}`);
    }

    // Download audio file
    console.log('📥 Downloading audio from FishSpeech...');
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status}`);
    }

    const audioBuffer = await audioResponse.buffer();
    console.log(`✅ Audio generated successfully (${audioBuffer.length} bytes)`);

    return audioBuffer;
  } catch (error) {
    console.error('FishSpeech TTS error:', error);
    throw error;
  }
}

/**
 * Get available voices/info from FishSpeech
 * Note: FishSpeech supports voice cloning, so voices are created from reference audio
 * @returns {Promise<Object>} - Info about FishSpeech capabilities
 */
export async function getAvailableVoices() {
  try {
    // FishSpeech doesn't have a fixed list of voices
    // Instead, it supports zero-shot and few-shot voice cloning
    return {
      info: 'FishSpeech supports voice cloning from reference audio',
      supported_languages: ['en', 'de', 'fr', 'es', 'it', 'pt', 'ja', 'zh', 'ko', 'ar', 'ru', 'nl', 'pl'],
      voice_cloning: {
        zero_shot: 'Generate speech without reference audio (uses default voice)',
        few_shot: 'Clone voice from 10-30 seconds of reference audio',
        reference_audio_url: 'Provide URL to reference audio for voice cloning'
      }
    };
  } catch (error) {
    console.error('Error getting FishSpeech info:', error);
    throw error;
  }
}

