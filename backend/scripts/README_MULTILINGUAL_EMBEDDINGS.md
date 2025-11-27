# Multilingual Embeddings Generator

This script generates embeddings for Functiomed content in **English**, **German**, and **French**.

## What it does

1. Takes the provided content sections
2. Translates each section to English and French (German is kept as original)
3. Generates embeddings using Ollama's `nomic-embed-text` model
4. Stores all embeddings in the database with language tags

## Prerequisites

1. **Ollama must be running**:
   ```bash
   ollama serve
   ```

2. **Required models must be pulled**:
   ```bash
   ollama pull llama3.2          # For translations
   ollama pull nomic-embed-text   # For embeddings
   ```

## Usage

### Option 1: Run with automatic translation (slower)

The script will automatically translate content using Ollama:

```bash
cd backend
node scripts/generateMultilingualEmbeddings.js
```

**Note**: This will take time as it translates each section. Expect 5-10 minutes for all content.

### Option 2: Use pre-translated content (faster)

If you have pre-translated content, modify the script to use it directly instead of translating.

## Output

The script will:
- Create embeddings for each section in all 3 languages
- Store them in the `knowledge_chunks` table with:
  - `id`: `{section_id}_{language}` (e.g., `osteopathy_billing_intro_de`)
  - `language`: `de`, `en`, or `fr`
  - `title`: Translated title
  - `content`: Translated content
  - `embedding`: Vector embedding (JSON array)

## Database Schema

Each chunk is stored with:
```javascript
{
  id: "osteopathy_billing_intro_de",
  section_id: "osteopathy_billing_intro",
  title: "Osteopathie Kostenübernahme",
  content: "...",
  language: "de",
  embedding: [0.123, 0.456, ...], // Vector array
  url: "internal://functiomed-docs",
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-01T00:00:00.000Z"
}
```

## Querying Multilingual Embeddings

When searching, you can filter by language:

```javascript
// Search in German
const germanChunks = db.prepare(`
  SELECT * FROM knowledge_chunks 
  WHERE language = 'de'
`).all();

// Search in English
const englishChunks = db.prepare(`
  SELECT * FROM knowledge_chunks 
  WHERE language = 'en'
`).all();
```

## Troubleshooting

1. **Translation errors**: If translation fails, the script will use the original text
2. **Embedding errors**: Check that `nomic-embed-text` model is pulled
3. **Slow performance**: Translation takes time. Consider pre-translating content
4. **Database errors**: Ensure database is initialized and writable

## Expected Output

```
🚀 Starting multilingual embedding generation...

📄 Processing: Osteopathie Kostenübernahme
   Section ID: osteopathy_billing_intro
   Generating embedding (DE)...
   ✓ Completed: osteopathy_billing_intro_de
   Translating to EN...
   Generating embedding (EN)...
   ✓ Completed: osteopathy_billing_intro_en
   Translating to FR...
   Generating embedding (FR)...
   ✓ Completed: osteopathy_billing_intro_fr

...

✅ Completed! Generated 39 chunks across 3 languages.
   Total: 39 chunks (13 sections × 3 languages)
```

## Next Steps

After generating embeddings, update your RAG service to:
1. Detect user's language preference
2. Search embeddings in the appropriate language
3. Return results in the user's language

