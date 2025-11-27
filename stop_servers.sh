#!/bin/bash

# Script to stop frontend and backend servers

echo "Stopping servers..."

# Kill processes on backend port (5001)
BACKEND_PID=$(lsof -ti:5001 2>/dev/null)
if [ ! -z "$BACKEND_PID" ]; then
    echo "Killing backend process on port 5001 (PID: $BACKEND_PID)"
    kill -9 $BACKEND_PID 2>/dev/null
    echo "✓ Backend stopped"
else
    echo "✓ No backend process found on port 5001"
fi

# Kill processes on frontend port (3000)
FRONTEND_PID=$(lsof -ti:3000 2>/dev/null)
if [ ! -z "$FRONTEND_PID" ]; then
    echo "Killing frontend process on port 3000 (PID: $FRONTEND_PID)"
    kill -9 $FRONTEND_PID 2>/dev/null
    echo "✓ Frontend stopped"
else
    echo "✓ No frontend process found on port 3000"
fi

# Kill any node server.js processes
NODE_SERVER_PIDS=$(pgrep -f "node.*server.js" 2>/dev/null)
if [ ! -z "$NODE_SERVER_PIDS" ]; then
    echo "Killing node server.js processes (PIDs: $NODE_SERVER_PIDS)"
    pkill -9 -f "node.*server.js" 2>/dev/null
    echo "✓ Node server processes stopped"
else
    echo "✓ No node server.js processes found"
fi

# Kill any react-scripts processes
REACT_PIDS=$(pgrep -f "react-scripts" 2>/dev/null)
if [ ! -z "$REACT_PIDS" ]; then
    echo "Killing react-scripts processes (PIDs: $REACT_PIDS)"
    pkill -9 -f "react-scripts" 2>/dev/null
    echo "✓ React-scripts processes stopped"
else
    echo "✓ No react-scripts processes found"
fi

echo ""
echo "All servers stopped!"

