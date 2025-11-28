# FishSpeech TTS Setup Guide

This guide explains how to set up FishSpeech (OpenAudio) for text-to-speech in the chatbot.

## What is FishSpeech?

FishSpeech (now rebranded as OpenAudio) is an open-source text-to-speech model that offers:
- **High-quality multilingual speech synthesis** (supports 13+ languages)
- **Zero-shot and few-shot voice cloning** (clone voices from 10-30 seconds of audio)
- **Emotional expression control** (angry, sad, happy, etc.)
- **Open-source** (Apache License for code, CC-BY-NC-SA-4.0 for model weights)

## Setup via Replicate API

### 1. Get Replicate API Token

1. Sign up at [Replicate](https://replicate.com)
2. Go to [API Tokens](https://replicate.com/account/api-tokens)
3. Create a new token and copy it

### 2. Configure Environment Variables

Add to your `.env` file:

```bash
# Replicate API Token (required)
REPLICATE_API_TOKEN=your_replicate_api_token_here

# Optional: FishSpeech model configuration
# Default: 'fishaudio/fish-speech-1.4' or 'jichengdu/fish-speech'
FISHSPEECH_MODEL=fishaudio/fish-speech-1.4

# Optional: Specific model version (e.g., 'fishaudio/fish-speech-1.4:abc123')
FISHSPEECH_VERSION=

# Optional: Voice cloning reference audio URL
# Provide a URL to an audio file (10-30 seconds) for voice cloning
FISHSPEECH_VOICE_REF=
```

### 3. Supported Languages

FishSpeech supports the following languages:
- English (en)
- German (de)
- French (fr)
- Spanish (es)
- Italian (it)
- Portuguese (pt)
- Japanese (ja)
- Chinese (zh)
- Korean (ko)
- Arabic (ar)
- Russian (ru)
- Dutch (nl)
- Polish (pl)

The chatbot automatically detects the user's language and uses the appropriate language code.

## Voice Cloning (Optional)

To use voice cloning:

1. **Prepare a reference audio file** (10-30 seconds, WAV or MP3 format)
2. **Upload it to a publicly accessible URL** (e.g., AWS S3, GitHub, or any web server)
3. **Set `FISHSPEECH_VOICE_REF`** in your `.env` file to the audio URL

Example:
```bash
FISHSPEECH_VOICE_REF=https://example.com/voice-reference.wav
```

## Testing

After setup, test the TTS by:

1. Starting the backend server: `npm start`
2. Sending a POST request to `/api/text-to-speech`:
   ```bash
   curl -X POST http://localhost:3000/api/text-to-speech \
     -H "Content-Type: application/json" \
     -d '{"text": "Hello, this is a test of FishSpeech TTS."}'
   ```

## Troubleshooting

### Error: "REPLICATE_API_TOKEN is not set"
- Make sure you've added `REPLICATE_API_TOKEN` to your `.env` file
- Restart the server after adding the token

### Error: "Replicate API error: 401"
- Check that your API token is correct
- Verify the token is active on Replicate dashboard

### Error: "Prediction timed out"
- FishSpeech generation can take 10-30 seconds
- Check your internet connection
- Try reducing the text length

### Audio quality issues
- Ensure you're using a supported language code
- For voice cloning, use high-quality reference audio (clear, no background noise)

## Cost Considerations

Replicate charges based on:
- Model inference time
- Number of API calls

Check [Replicate Pricing](https://replicate.com/pricing) for current rates. FishSpeech is generally cost-effective compared to proprietary TTS services.

## Alternative: Local Installation

If you prefer to run FishSpeech locally (no API costs), you can:

1. Clone the [FishSpeech repository](https://github.com/fishaudio/fish-speech)
2. Follow their installation instructions
3. Set up a local API endpoint
4. Update the `textToSpeech.js` service to point to your local endpoint

## Migration from ElevenLabs

The API interface remains the same, so no frontend changes are needed. The backend now:
- Uses FishSpeech instead of ElevenLabs
- Automatically detects language from user queries
- Returns WAV format audio (instead of MP3)

The frontend will automatically handle the audio format change.

