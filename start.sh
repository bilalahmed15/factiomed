#!/bin/bash

echo "🚀 Starting Functiomed Chatbot Application..."
echo ""

# Check if node_modules exist, if not install dependencies
if [ ! -d "backend/node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    cd backend
    npm install
    cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd frontend
    npm install
    cd ..
fi

# Check if .env exists in backend
if [ ! -f "backend/.env" ]; then
    echo "⚠️  Warning: backend/.env not found. Creating from template..."
    if [ -f "backend/.env.example" ]; then
        cp backend/.env.example backend/.env
        echo "   ⚠️  Please edit backend/.env and add your OPENAI_API_KEY!"
    else
        echo "   ❌ backend/.env.example not found. Please create backend/.env manually."
        exit 1
    fi
fi

# Create data directory if it doesn't exist
mkdir -p backend/data
mkdir -p backend/uploads

# Initialize database if it doesn't exist
if [ ! -f "backend/data/functiomed.db" ]; then
    echo "📦 Initializing database..."
    cd backend && npm run init-db && cd ..
fi

echo "🔧 Starting backend server..."
cd backend
npm start &
BACKEND_PID=$!
cd ..

sleep 3

echo "🎨 Starting frontend..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ Application is running!"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Wait for user interrupt
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait

