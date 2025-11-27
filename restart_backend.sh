#!/bin/bash
# Restart backend server

echo "Stopping existing backend..."
pkill -f "node server.js" 2>/dev/null || true
sleep 2

echo "Starting backend server..."
cd /home/andrewfoudriat/GENTEX-DEMO/backend
export LLAMA_SERVER_URL=http://localhost:8080
nohup npm start > ~/backend.log 2>&1 &
BACKEND_PID=$!

echo "Waiting for backend to start..."
sleep 3

if ps -p $BACKEND_PID > /dev/null; then
    echo "✅ Backend started with PID: $BACKEND_PID"
    echo "Checking health endpoint..."
    sleep 1
    curl -s http://localhost:5001/api/health && echo "" || echo "⚠️  Health check failed, but process is running"
    echo ""
    echo "Backend logs: tail -f ~/backend.log"
else
    echo "❌ Backend failed to start. Check ~/backend.log for errors."
    tail -n 20 ~/backend.log
fi

