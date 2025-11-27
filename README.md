# Functiomed.ch Chatbot Application

A comprehensive React chatbot web application for functiomed.ch with RAG (Retrieval-Augmented Generation), appointment booking, parking reservations, and audio transcription capabilities.

## Features

- **RAG Chat**: Answers questions using content from the entire functiomed.ch website
- **Appointment Booking**: Multi-step booking flow with concurrency-safe slot reservations
- **Parking Reservations**: Reserve parking spots with real-time availability
- **Audio Transcription**: Upload audio files for transcription, summarization, and information extraction
- **Modern UI**: Clean, clinical aesthetic matching functiomed.ch branding

## Project Structure

```
martin 2/
├── backend/           # Node.js/Express backend
│   ├── config/        # Database configuration
│   ├── services/      # Business logic (RAG, booking, parking, transcription)
│   ├── scripts/       # Database initialization and crawling
│   └── server.js      # Express server
├── frontend/          # React frontend
│   └── src/
│       ├── components/  # React components
│       └── App.jsx      # Main app component
└── README.md
```

## Setup Instructions

### Prerequisites

- Node.js 18+ and npm
- **Ollama** (open-source LLM) - See [OLLAMA_SETUP.md](backend/OLLAMA_SETUP.md) for installation
- ElevenLabs API key (for voice features)

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

4. Edit `.env` and add your configuration:
```
# Ollama Configuration (see OLLAMA_SETUP.md)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3.2
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# ElevenLabs (for voice features)
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# Server Configuration
PORT=3001
TARGET_SITE=https://functiomed.ch
INIT_SAMPLE_DATA=true
```

**Important:** Before starting the backend, make sure Ollama is installed and running. See [backend/OLLAMA_SETUP.md](backend/OLLAMA_SETUP.md) for detailed setup instructions.

**Note:** The `ELEVENLABS_API_KEY` is required for AI voice features. Get your API key from [ElevenLabs](https://elevenlabs.io/).

5. Initialize the database:
```bash
npm run init-db
```

6. **IMPORTANT: Crawl the website to populate knowledge base:**
```bash
npm run crawl
```

Or trigger it via API (while server is running):
```bash
curl -X POST http://localhost:3001/api/admin/crawl \
  -H "Content-Type: application/json" \
  -d '{"siteUrl": "https://functiomed.ch"}'
```

**⚠️ The chatbot cannot answer questions until you crawl the website!** See `CRAWL_INSTRUCTIONS.md` for details.

7. Start the server:
```bash
npm start
# Or for development with auto-reload:
npm run dev
```

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The frontend will run on http://localhost:3000 and proxy API requests to the backend.

## Usage

### Chat Interface

- Click the chat button (bottom-right) to open the chat widget
- Ask questions about Functiomed services
- The bot will answer using content from the website
- Sources are displayed for each answer

### Booking Appointments

1. Type "book appointment" or "appointment" in the chat
2. Select an available time slot
3. Fill in patient details (name, DOB, phone, email, reason for visit)
4. Confirm the booking
5. The slot is held for 5 minutes while you complete the form

### Reserving Parking

1. Type "parking" or "park" in the chat
2. Select a date
3. Choose an available parking spot
4. Enter contact details
5. Confirm the reservation

### Audio Transcription

1. Type "transcript" or "audio" in the chat
2. Upload an audio file (MP3, WAV, M4A up to 100MB)
3. Wait for processing
4. View summary, attendees, action items, and extracted information

## Database Schema

The application uses SQLite for local development. Key tables:

- `appointment_slots`: Available appointment time slots
- `reservations`: Confirmed appointments
- `parking_slots`: Available parking spots
- `parking_reservations`: Confirmed parking reservations
- `knowledge_chunks`: Website content chunks with embeddings
- `transcripts`: Uploaded audio transcripts and summaries
- `audit_logs`: Activity logs for compliance
- `chat_sessions`: Chat conversation history

## Concurrency Safety

- Slots use database transactions with atomic hold/reserve operations
- Background job cleans up expired holds every minute
- Hold expiry timer visible to users during booking flow
- Prevents double-booking through transaction isolation

## Security Notes

- For production, add authentication/authorization
- Encrypt sensitive data at rest
- Use HTTPS in production
- Review OpenAI data processing terms
- Consider HIPAA compliance if handling PHI

## Development

### Adding Sample Data

Set `INIT_SAMPLE_DATA=true` in `.env` to automatically create sample appointment and parking slots on server startup.

### Crawling Website

The crawler:
- Respects robots.txt (basic implementation)
- Extracts meaningful content (removes navigation/footers)
- Creates embeddings using OpenAI
- Stores chunks in the database

### Customizing Styles

Edit CSS variables in `frontend/src/index.css` to match your brand colors:
- `--primary-color`: Main brand color
- `--secondary-color`: Accent color
- `--background`: Page background
- `--surface`: Card/panel background

## Deployment

For production deployment:

1. Build the frontend:
```bash
cd frontend
npm run build
```

2. Serve the frontend static files (via nginx, Vercel, Netlify, etc.)

3. Deploy the backend (via Heroku, Railway, AWS, etc.)

4. Configure environment variables on your hosting platform

5. Use a production database (PostgreSQL recommended) instead of SQLite

6. Set up Redis for job queues if needed

7. Configure file storage (S3, Cloudinary) for audio uploads

## License

MIT

