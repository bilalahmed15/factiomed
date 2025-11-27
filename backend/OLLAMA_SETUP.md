# Ollama Setup Guide

This application now uses **Ollama** (open-source LLM) instead of OpenAI for AI responses.

## Prerequisites

1. **Install Ollama**: 
   - Visit https://ollama.ai and download Ollama for your operating system
   - Or install via command line:
     ```bash
     # macOS/Linux
     curl -fsSL https://ollama.ai/install.sh | sh
     
     # Windows - download from https://ollama.ai/download
     ```

2. **Pull Required Models**:
   ```bash
   # Chat model (for conversations, classification, etc.)
   ollama pull llama3.2
   # Or use other models like: mistral, qwen, phi3, etc.
   
   # Embedding model (for RAG/semantic search)
   ollama pull nomic-embed-text
   ```

## Configuration

Add these environment variables to your `backend/.env` file:

```env
# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3.2
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

### Available Chat Models

You can use any Ollama model. Popular options:
- `llama3.2` - Fast and efficient (default)
- `llama3.1` - More capable
- `mistral` - Good balance
- `qwen2.5` - Multilingual support
- `phi3` - Small and fast

### Available Embedding Models

- `nomic-embed-text` - Default, good quality
- `mxbai-embed-large` - Higher quality, larger size

## Starting Ollama

Ollama runs as a local server. Start it before running the backend:

```bash
# Start Ollama server (usually runs automatically after installation)
ollama serve

# Or just run any ollama command - it will start the server automatically
ollama list
```

The server runs on `http://localhost:11434` by default.

## Testing

Test if Ollama is working:

```bash
# Test chat
ollama run llama3.2 "Hello, how are you?"

# Test embeddings
curl http://localhost:11434/api/embeddings -d '{
  "model": "nomic-embed-text",
  "prompt": "test embedding"
}'
```

## Troubleshooting

1. **"Connection refused" error**:
   - Make sure Ollama server is running: `ollama serve`
   - Check if port 11434 is accessible

2. **"Model not found" error**:
   - Pull the model: `ollama pull llama3.2`
   - Check available models: `ollama list`

3. **Slow responses**:
   - Use a smaller/faster model like `llama3.2` instead of larger models
   - Ensure you have enough RAM (models load into memory)

4. **Embedding errors**:
   - Make sure you've pulled the embedding model: `ollama pull nomic-embed-text`
   - Check the model name matches in `.env`

## Remote Ollama Server

If you want to use a remote Ollama server, update `OLLAMA_BASE_URL`:

```env
OLLAMA_BASE_URL=http://your-ollama-server:11434
```

## Notes

- The OpenAI package is still in `package.json` but not used anymore
- All OpenAI API calls have been replaced with Ollama equivalents
- The interface remains OpenAI-compatible for easy migration
- Embeddings are now handled by Ollama embedding models instead of OpenAI

