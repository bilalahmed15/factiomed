# Quick Setup Guide

## Prerequisites
- Node.js 18+ and npm
- OpenAI API key ([get one here](https://platform.openai.com/api-keys))

## One-Time Setup

1. **Set up the backend:**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
npm run init-db
```

2. **Set up the frontend:**
```bash
cd frontend
npm install
```

## Running the Application

### Option 1: Use the start script (Recommended)
```bash
./start.sh
```

### Option 2: Manual start
**Terminal 1 - Backend:**
```bash
cd backend
npm start
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

## First Steps

1. **Populate the knowledge base:**
   - Once backend is running, trigger a site crawl:
   ```bash
   curl -X POST http://localhost:3001/api/admin/crawl \
     -H "Content-Type: application/json" \
     -d '{"siteUrl": "https://functiomed.ch"}'
   ```
   - Or set `INIT_SAMPLE_DATA=true` in `.env` for demo data

2. **Access the app:**
   - Open http://localhost:3000 in your browser
   - Click the chat button (bottom-right) to start

## Testing Features

- **Chat:** Ask questions about Functiomed services
- **Book Appointment:** Type "book appointment" in chat
- **Reserve Parking:** Type "parking" in chat
- **Upload Audio:** Type "transcript" in chat

## Troubleshooting

- **Database errors:** Run `npm run init-db` in the backend directory
- **OpenAI errors:** Check your API key in `backend/.env`
- **Port conflicts:** Change ports in `backend/.env` and `frontend/vite.config.js`



