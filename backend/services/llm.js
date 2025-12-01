import dotenv from 'dotenv';

dotenv.config();

// Ollama API configuration
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL || 'llama3.2'; // Default to llama3.2, can be changed to mistral, qwen, etc.
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text'; // For embeddings

/**
 * LLM Service using Ollama (open-source)
 * Provides OpenAI-compatible interface for chat completions and embeddings
 */
class LLMService {
  constructor() {
    this.baseUrl = OLLAMA_BASE_URL;
    this.chatModel = CHAT_MODEL;
    this.embeddingModel = EMBEDDING_MODEL;
  }

  /**
   * Create chat completion (OpenAI-compatible interface)
   */
  async createChatCompletion({ model, messages, temperature = 0.7, max_tokens, response_format }) {
    try {
      // Use the model from parameter or default
      const modelToUse = model || this.chatModel;
      
      // Convert OpenAI messages to Ollama format
      const ollamaMessages = messages.map(msg => ({
        role: msg.role === 'system' ? 'system' : msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      }));
      
      // Prepare request body for Ollama chat API
      const requestBody = {
        model: modelToUse,
        messages: ollamaMessages,
        stream: false,
        options: {
          temperature: temperature || 0.7,
          num_predict: max_tokens || 2048, // Ollama uses num_predict instead of max_tokens
        }
      };

      // If JSON response format is requested, add format parameter
      if (response_format?.type === 'json_object') {
        requestBody.format = 'json';
      }

      // Add timeout for faster failure (30 seconds for chat)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      // Format response to match OpenAI structure
      return {
        choices: [{
          message: {
            content: data.message?.content || '',
            role: 'assistant'
          },
          finish_reason: data.done ? 'stop' : 'length'
        }]
      };
    } catch (error) {
      console.error('LLM chat completion error:', error);
      throw error;
    }
  }

  /**
   * Pre-load embedding model to avoid timeout on first use
   * This ensures the model is fully loaded before use
   */
  async preloadEmbeddingModel(modelName, retries = 5) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        if (attempt === 0) {
          console.log(`Preloading embedding model ${modelName}...`);
        }
        
        // Trigger a small embedding request to load the model
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout (model loading can take time)
        
        const response = await fetch(`${this.baseUrl}/api/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelName,
            prompt: 'preload',
          }),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          if (data.embedding && Array.isArray(data.embedding) && data.embedding.length > 0) {
            console.log(`✓ Embedding model ${modelName} loaded successfully (${data.embedding.length} dimensions)`);
            // Give it a moment to stabilize
            await new Promise(resolve => setTimeout(resolve, 2000));
            return true;
          }
        } else {
          const errorText = await response.text();
          console.log(`Model not ready (status ${response.status}), retrying...`);
        }
        
        // If not OK, wait and retry
        if (attempt < retries - 1) {
          const delay = Math.min((attempt + 1) * 3000, 10000); // 3s, 6s, 9s, max 10s
          console.log(`Waiting ${delay}ms before retry ${attempt + 2}/${retries}...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        if (attempt < retries - 1) {
          const delay = Math.min((attempt + 1) * 3000, 10000);
          console.log(`Preload error, retrying in ${delay}ms (attempt ${attempt + 2}/${retries})...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.log(`⚠️  Preload failed for ${modelName} after ${retries} attempts:`, error.message);
          return false;
        }
      }
    }
    return false;
  }

  /**
   * Create embeddings (OpenAI-compatible interface)
   */
  async createEmbeddings({ model, input }) {
    try {
      const modelToUse = model || this.embeddingModel;
      
      // Handle both string and array inputs
      const inputs = Array.isArray(input) ? input : [input];
      const embeddings = [];

      for (const text of inputs) {
        let retries = 3;
        let lastError = null;
        
        while (retries > 0) {
          try {
            // Create abort controller for timeout (reduced to 15 seconds for faster failure)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout for embeddings
            
            const response = await fetch(`${this.baseUrl}/api/embeddings`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: modelToUse,
                prompt: text,
              }),
              signal: controller.signal,
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
              const errorText = await response.text();
              
              // If it's a 500 error, try preloading the model and retry with shorter delay
              if (response.status === 500 && retries > 1) {
                console.log(`Embedding model may need loading, attempting preload...`);
                await this.preloadEmbeddingModel(modelToUse);
                const delay = Math.pow(2, 3 - retries) * 1000; // Reduced exponential backoff: 1s, 2s, 4s
                await new Promise(resolve => setTimeout(resolve, delay));
                retries--;
                continue;
              }
              
              throw new Error(`Ollama embeddings API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            
            if (!data.embedding || !Array.isArray(data.embedding)) {
              throw new Error('Invalid embedding response format');
            }
            
            embeddings.push({
              embedding: data.embedding,
              index: embeddings.length
            });
            
            // Success, break retry loop
            break;
          } catch (error) {
            lastError = error;
            
            // If it's a timeout or connection error, retry with exponential backoff
            if ((error.name === 'AbortError' || error.message.includes('EOF') || error.message.includes('ECONNREFUSED')) && retries > 1) {
              const delay = Math.pow(2, 3 - retries) * 1000; // Exponential backoff: 1s, 2s, 4s
              console.log(`Embedding request failed, retrying in ${delay}ms... (${retries - 1} attempts left)`);
              await new Promise(resolve => setTimeout(resolve, delay));
              retries--;
              continue;
            }
            
            // If it's the last retry or a different error, throw
            if (retries === 1) {
              throw error;
            }
            
            retries--;
          }
        }
        
        if (lastError && embeddings.length === 0) {
          throw lastError;
        }
      }

      return {
        data: embeddings,
        model: modelToUse,
        usage: {
          prompt_tokens: 0, // Ollama doesn't provide token counts
          total_tokens: 0
        }
      };
    } catch (error) {
      console.error('LLM embeddings error:', error);
      throw error;
    }
  }


  /**
   * Check if Ollama is available
   */
  async checkHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
const llmService = new LLMService();

// Pre-load embedding model on startup (non-blocking)
llmService.preloadEmbeddingModel(EMBEDDING_MODEL).catch(err => {
  console.log('Note: Embedding model will be loaded on first use');
});

// OpenAI-compatible interface
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

