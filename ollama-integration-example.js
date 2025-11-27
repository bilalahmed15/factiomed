/**
 * Standalone Ollama Integration Example
 * 
 * This is a minimal, ready-to-use example showing how to integrate Ollama
 * into any chatbot. Copy this file and adapt it to your needs.
 */

// ============================================================================
// STEP 1: Create the Ollama Wrapper Service
// ============================================================================

class OllamaService {
  constructor(baseUrl = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
    this.chatModel = 'llama3.2';
    this.embeddingModel = 'nomic-embed-text';
  }

  /**
   * Chat completion - OpenAI compatible
   */
  async chat(messages, options = {}) {
    const {
      model = this.chatModel,
      temperature = 0.7,
      max_tokens = 2048,
      response_format = null
    } = options;

    const requestBody = {
      model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      stream: false,
      options: {
        temperature,
        num_predict: max_tokens
      }
    };

    if (response_format?.type === 'json_object') {
      requestBody.format = 'json';
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const data = await response.json();
    return data.message.content;
  }

  /**
   * Embeddings - OpenAI compatible
   */
  async embed(text) {
    const input = Array.isArray(text) ? text : [text];
    const embeddings = [];

    for (const item of input) {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.embeddingModel,
          prompt: item
        })
      });

      if (!response.ok) {
        throw new Error(`Embedding error: ${response.status}`);
      }

      const data = await response.json();
      embeddings.push(data.embedding);
    }

    return embeddings.length === 1 ? embeddings[0] : embeddings;
  }
}

// ============================================================================
// STEP 2: Initialize the Service
// ============================================================================

const ollama = new OllamaService();

// ============================================================================
// STEP 3: Use in Your Chatbot
// ============================================================================

// Example 1: Simple chat
async function simpleChat() {
  const response = await ollama.chat([
    { role: 'user', content: 'What is artificial intelligence?' }
  ]);
  
  console.log('Response:', response);
}

// Example 2: Chat with system prompt
async function chatbotWithContext() {
  const response = await ollama.chat([
    { 
      role: 'system', 
      content: 'You are a helpful customer service assistant for a medical clinic.' 
    },
    { role: 'user', content: 'What are your opening hours?' }
  ], {
    temperature: 0.7
  });
  
  return response;
}

// Example 3: JSON response (for structured data)
async function classifyIntent(userMessage) {
  const response = await ollama.chat([
    {
      role: 'system',
      content: 'Classify the user intent. Respond with JSON: {"intent": "greeting|question|complaint", "confidence": 0.0-1.0}'
    },
    { role: 'user', content: userMessage }
  ], {
    response_format: { type: 'json_object' }
  });
  
  return JSON.parse(response);
}

// Example 4: Embeddings for semantic search
async function semanticSearch() {
  const query = "What are your services?";
  const documents = [
    "We offer physical therapy and consultation services.",
    "Our clinic is open Monday to Friday from 9am to 5pm.",
    "We have experienced doctors specializing in sports medicine."
  ];

  // Get embeddings
  const queryEmbedding = await ollama.embed(query);
  const docEmbeddings = await ollama.embed(documents);

  // Calculate similarity (cosine similarity)
  function cosineSimilarity(a, b) {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  // Find most similar document
  const similarities = docEmbeddings.map((docEmb, idx) => ({
    document: documents[idx],
    similarity: cosineSimilarity(queryEmbedding, docEmb)
  }));

  const mostSimilar = similarities.sort((a, b) => b.similarity - a.similarity)[0];
  console.log('Most relevant:', mostSimilar);
  
  return mostSimilar.document;
}

// ============================================================================
// STEP 4: Integration with Express/Node.js Chatbot
// ============================================================================

// Example Express.js endpoint
/*
const express = require('express');
const app = express();
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      ...conversationHistory,
      { role: 'user', content: message }
    ];
    
    const response = await ollama.chat(messages);
    
    res.json({ response });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000);
*/

// ============================================================================
// STEP 5: Quick Test
// ============================================================================

// Uncomment to test:
// simpleChat().catch(console.error);

// Export for use in other files
export { OllamaService, ollama };

