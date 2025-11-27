# How to Integrate Ollama into Your Chatbot

This guide explains how Ollama was integrated into this project and how you can do the same in your chatbot.

## Overview

The integration uses a **wrapper service** (`llm.js`) that provides an **OpenAI-compatible interface**, making it easy to replace OpenAI with Ollama without changing your existing code.

## Architecture

```
Your Code → llm.js (Wrapper) → Ollama API → Local/Remote Ollama Server
```

The wrapper translates OpenAI-style API calls to Ollama's API format, so your existing code doesn't need to change.

## Step-by-Step Integration

### 1. Install Ollama

```bash
# macOS/Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Or download from https://ollama.ai
```

### 2. Pull Required Models

```bash
# Chat model (for conversations)
ollama pull llama3.2

# Embedding model (for RAG/semantic search)
ollama pull nomic-embed-text
```

### 3. Create the LLM Wrapper Service

Create a file `llm.js` (or `ollamaService.js`) in your project:

```javascript
// llm.js
import dotenv from 'dotenv';
dotenv.config();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL || 'llama3.2';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

class LLMService {
  constructor() {
    this.baseUrl = OLLAMA_BASE_URL;
    this.chatModel = CHAT_MODEL;
    this.embeddingModel = EMBEDDING_MODEL;
  }

  /**
   * Chat completion (OpenAI-compatible)
   */
  async createChatCompletion({ model, messages, temperature = 0.7, max_tokens, response_format }) {
    const modelToUse = model || this.chatModel;
    
    const ollamaMessages = messages.map(msg => ({
      role: msg.role === 'system' ? 'system' : msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    }));
    
    const requestBody = {
      model: modelToUse,
      messages: ollamaMessages,
      stream: false,
      options: {
        temperature: temperature || 0.7,
        num_predict: max_tokens || 2048,
      }
    };

    // Support JSON format
    if (response_format?.type === 'json_object') {
      requestBody.format = 'json';
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // Return OpenAI-compatible format
    return {
      choices: [{
        message: {
          content: data.message?.content || '',
          role: 'assistant'
        },
        finish_reason: data.done ? 'stop' : 'length'
      }]
    };
  }

  /**
   * Create embeddings (OpenAI-compatible)
   */
  async createEmbeddings({ model, input }) {
    const modelToUse = model || this.embeddingModel;
    const inputs = Array.isArray(input) ? input : [input];
    const embeddings = [];

    for (const text of inputs) {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelToUse,
          prompt: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama embeddings error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      embeddings.push({
        embedding: data.embedding || [],
        index: embeddings.length
      });
    }

    return {
      data: embeddings,
      model: modelToUse,
      usage: { prompt_tokens: 0, total_tokens: 0 }
    };
  }
}

// Export OpenAI-compatible interface
const llmService = new LLMService();

export const openai = {
  chat: {
    completions: {
      create: (params) => llmService.createChatCompletion(params)
    }
  },
  embeddings: {
    create: (params) => llmService.createEmbeddings(params)
  }
};

export default llmService;
```

### 4. Replace OpenAI Imports

**Before (using OpenAI):**
```javascript
import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Usage
const completion = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

**After (using Ollama wrapper):**
```javascript
import { openai } from './llm.js';

// Usage - SAME CODE, no changes needed!
const completion = await openai.chat.completions.create({
  model: 'llama3.2', // or omit to use default
  messages: [{ role: 'user', content: 'Hello!' }]
});

const response = completion.choices[0].message.content;
```

### 5. Environment Variables

Add to your `.env` file:

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3.2
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

### 6. Start Ollama Server

```bash
# Ollama usually starts automatically, but you can start it manually:
ollama serve

# Or just run any command - it auto-starts:
ollama list
```

## Usage Examples

### Example 1: Simple Chat

```javascript
import { openai } from './llm.js';

async function chat(userMessage) {
  const completion = await openai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: userMessage }
    ],
    temperature: 0.7
  });
  
  return completion.choices[0].message.content;
}

const response = await chat("What is AI?");
console.log(response);
```

### Example 2: JSON Response

```javascript
import { openai } from './llm.js';

async function classifyIntent(message) {
  const completion = await openai.chat.completions.create({
    messages: [
      { 
        role: 'system', 
        content: 'Classify user intent. Respond with JSON: {"intent": "..."}' 
      },
      { role: 'user', content: message }
    ],
    response_format: { type: 'json_object' }
  });
  
  return JSON.parse(completion.choices[0].message.content);
}
```

### Example 3: Embeddings for RAG

```javascript
import { openai } from './llm.js';

async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'nomic-embed-text',
    input: text
  });
  
  return response.data[0].embedding;
}

// Use for semantic search
const queryEmbedding = await getEmbedding("user question");
const docEmbedding = await getEmbedding("document text");
// Calculate cosine similarity, etc.
```

## Key Differences from OpenAI

| Feature | OpenAI | Ollama |
|---------|--------|--------|
| **API Key** | Required | Not needed (local) |
| **Cost** | Pay per token | Free (local) |
| **Latency** | Network dependent | Local (faster) |
| **Models** | Cloud-hosted | Download locally |
| **Privacy** | Data sent to OpenAI | 100% local |
| **Max Tokens** | `max_tokens` | `num_predict` (mapped) |
| **Streaming** | Supported | Supported (not shown in example) |

## Advanced Features

### Streaming Support

To add streaming (for real-time responses):

```javascript
async createChatCompletion({ model, messages, stream = false, ... }) {
  const requestBody = {
    model: modelToUse,
    messages: ollamaMessages,
    stream: stream, // Enable streaming
    // ...
  };

  const response = await fetch(`${this.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (stream) {
    // Handle streaming response
    const reader = response.body.getReader();
    // Process chunks...
  } else {
    // Non-streaming (as shown above)
  }
}
```

### Error Handling & Retries

The wrapper includes retry logic for embeddings (see `llm.js` lines 119-189) to handle:
- Model loading delays
- Network timeouts
- Connection errors

### Pre-loading Models

Pre-load models on startup to avoid first-request delays:

```javascript
// In llm.js
async preloadEmbeddingModel(modelName) {
  await fetch(`${this.baseUrl}/api/embeddings`, {
    method: 'POST',
    body: JSON.stringify({ model: modelName, prompt: 'preload' })
  });
}

// On startup
llmService.preloadEmbeddingModel(EMBEDDING_MODEL);
```

## Testing

```bash
# Test Ollama is running
curl http://localhost:11434/api/tags

# Test chat
ollama run llama3.2 "Hello!"

# Test embeddings
curl -X POST http://localhost:11434/api/embeddings \
  -d '{"model": "nomic-embed-text", "prompt": "test"}'
```

## Troubleshooting

1. **"Connection refused"**: Start Ollama server (`ollama serve`)
2. **"Model not found"**: Pull the model (`ollama pull llama3.2`)
3. **Slow responses**: Use smaller models or more RAM
4. **Embedding errors**: Ensure embedding model is pulled

## Remote Ollama Server

If using a remote Ollama server:

```env
OLLAMA_BASE_URL=http://your-server:11434
```

## Benefits

✅ **Free** - No API costs  
✅ **Private** - Data stays local  
✅ **Fast** - No network latency  
✅ **Flexible** - Use any Ollama model  
✅ **Compatible** - Drop-in OpenAI replacement  

## Migration Checklist

- [ ] Install Ollama
- [ ] Pull chat and embedding models
- [ ] Create `llm.js` wrapper
- [ ] Replace `import OpenAI` with `import { openai } from './llm.js'`
- [ ] Remove OpenAI API key from `.env`
- [ ] Add Ollama config to `.env`
- [ ] Test chat completions
- [ ] Test embeddings (if used)
- [ ] Start Ollama server
- [ ] Verify everything works

## Full Example Project Structure

```
your-chatbot/
├── services/
│   └── llm.js          # Ollama wrapper (this file)
├── .env                # OLLAMA_BASE_URL, etc.
└── your-chatbot.js     # Uses openai from llm.js
```

That's it! Your chatbot now uses Ollama instead of OpenAI. 🚀

