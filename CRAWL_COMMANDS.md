# Commands to Crawl Website and Store in Database

## Option 1: Using npm script (Recommended)

**From the project root directory:**
```bash
cd backend && npm run crawl
```

**Or if you're already in the backend directory:**
```bash
npm run crawl
```

This will crawl the default site (https://functiomed.ch) or the site specified in `TARGET_SITE` environment variable.

To crawl a specific URL:
```bash
cd backend && npm run crawl https://functiomed.ch
```

**Note:** Make sure you're in the `backend` directory or use the full path. The script is located at `backend/scripts/crawl-site.js`.

## Option 2: Using the API endpoint (while server is running)

```bash
curl -X POST http://localhost:3001/api/admin/crawl \
  -H "Content-Type: application/json" \
  -d '{"siteUrl": "https://functiomed.ch"}'
```

Or using a simpler curl command:
```bash
curl -X POST http://localhost:3001/api/admin/crawl \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Option 3: Direct Node.js command

**From the project root:**
```bash
cd backend && node scripts/crawl-site.js
```

**Or if you're already in the backend directory:**
```bash
node scripts/crawl-site.js
```

Or with a specific URL:
```bash
cd backend && node scripts/crawl-site.js https://functiomed.ch
```

**Important:** Always run from the `backend` directory or use the full path to the script.

## Option 4: Using the start script (includes auto-crawl)

If the knowledge base is empty, the server will automatically crawl on startup:

```bash
./start.sh
```

## What Gets Crawled

- **Up to 50 pages** by default (configurable in `crawler.js`)
- All pages from the sitemap
- Discovered links from crawled pages
- Content is extracted, chunked, and embedded
- All data is stored in the database at `backend/data/`

## Check Crawl Status

```bash
curl http://localhost:3001/api/admin/knowledge-status
```

## Notes

- Data persists between server restarts (stored in `backend/data/`)
- The crawl may take 5-10 minutes depending on site size
- The crawler respects rate limits and adds delays between requests
- Duplicate pages are automatically skipped

