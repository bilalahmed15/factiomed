# How to Populate the Knowledge Base

The chatbot needs the website content to be crawled and stored in the knowledge base before it can answer questions.

## Quick Start - Populate Knowledge Base

### Option 1: Using the API (Recommended)

1. Make sure your backend server is running
2. Run this command:
```bash
curl -X POST http://localhost:3001/api/admin/crawl \
  -H "Content-Type: application/json" \
  -d '{"siteUrl": "https://functiomed.ch"}'
```

Or use a tool like Postman or your browser's developer console.

### Option 2: Using npm script

```bash
cd backend
npm run crawl
```

This will crawl the entire Functiomed.ch website and store all content in the knowledge base.

## What Gets Crawled

The crawler will:
- ✅ Crawl up to 50 pages from the website
- ✅ Follow links to discover all pages
- ✅ Extract all text content, headings, and descriptions
- ✅ Create embeddings for semantic search
- ✅ Store everything in the database

## Check Knowledge Base Status

Check if the knowledge base is populated:

```bash
curl http://localhost:3001/api/admin/knowledge-status
```

You should see:
```json
{
  "totalChunks": 150,
  "totalPages": 12,
  "hasContent": true
}
```

## After Crawling

Once the crawl is complete:
1. The chatbot will automatically use the knowledge base
2. You can ask questions like "What are your services?" and get comprehensive answers
3. All answers will cite their sources

## Re-crawling

To update the knowledge base with new content:
- Just run the crawl command again
- The system will update existing chunks and add new ones

## Troubleshooting

**"No content found" error:**
- Make sure the website URL is correct
- Check that the site is accessible
- Verify your OpenAI API key is set

**Crawl is slow:**
- This is normal! Crawling 50 pages with embeddings can take 5-10 minutes
- Be patient and let it complete

