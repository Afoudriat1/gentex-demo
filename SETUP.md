# Setup Guide

## Prerequisites

- Node.js 16+ and npm
- Build tools: cmake, make, g++
- curl (usually pre-installed)

Check versions:
```bash
node --version
npm --version
cmake --version
```

## Step 1: Install llama.cpp Dependencies

Build llama.cpp server:

```bash
cd llama.cpp
mkdir -p build
cd build
cmake ..
make -j$(nproc)
```

Verify the binary exists:
```bash
ls -la build/bin/llama-server
```

## Step 2: Install Node.js Dependencies

**Backend:**
```bash
cd backend
npm install
```

**Frontend:**
```bash
cd frontend
npm install
```

## Step 3: Verify Model Files

Ensure model files are in the project root:
```bash
ls -lh compressed.gguf embed.gguf
```

Both files should exist in `/home/andrewfoudriat/GENTEX-DEMO/`

## Step 4: Start Model Server

Start the main model server (uses `compressed.gguf`):

```bash
./run_model_server.sh
```

You should see:
```
🚀 Starting llama-server with compressed.gguf
✅ Running in background (PID ...)
```

Verify it's running:
```bash
curl http://localhost:8080/health
```

Keep this terminal open or run in background.

## Step 5: Start Embedding Server

Open a new terminal and start the embedding server (uses `embed.gguf`):

```bash
./start_embedding_server.sh
```

You should see:
```
🚀 Starting embedding server with embed.gguf on port 8081
✅ Embedding server running (PID ...)
```

Test it:
```bash
curl -X POST http://localhost:8081/embedding \
  -H 'Content-Type: application/json' \
  -d '{"content":"test"}'
```

Keep this terminal open or run in background.

## Step 6: Start Backend

Open a new terminal:

```bash
cd backend
node server.js
```

You should see:
```
Backend running → http://0.0.0.0:5001
Llama server → http://localhost:8080
Embedding server → http://localhost:8081
```

Verify:
```bash
curl http://localhost:5001/api/health
```

Keep this terminal open.

## Step 7: Start Frontend

Open a new terminal:

```bash
cd frontend
npm start
```

Browser should open to `http://localhost:3000`. Keep this terminal open.

## Complete Startup Sequence

**Terminal 1 - Model Server:**
```bash
./run_model_server.sh
```

**Terminal 2 - Embedding Server:**
```bash
./start_embedding_server.sh
```

**Terminal 3 - Backend:**
```bash
cd backend && node server.js
```

**Terminal 4 - Frontend:**
```bash
cd frontend && npm start
```

Access: http://localhost:3000

## Stop Servers

Press `Ctrl+C` in each terminal, or:
```bash
./stop_servers.sh
pkill -f llama-server
```

## Troubleshooting

**llama-server binary not found:**
- Make sure you built llama.cpp (Step 1)
- Check: `ls -la llama.cpp/build/bin/llama-server`

**Model files not found:**
- Verify `compressed.gguf` and `embed.gguf` are in project root
- Check: `ls -lh compressed.gguf embed.gguf`

**Port already in use:**
```bash
lsof -i :8080  # model server
lsof -i :8081  # embedding server
lsof -i :5001  # backend
lsof -i :3000  # frontend
kill -9 <PID>
```

**Backend can't connect to llama servers:**
- Verify model server: `curl http://localhost:8080/health`
- Verify embedding server: `curl http://localhost:8081/health`
- Check backend terminal for connection errors

**Dependencies:**
```bash
cd backend && rm -rf node_modules && npm install
cd frontend && rm -rf node_modules && npm install
```

**Build errors (llama.cpp):**
- Install build tools: `sudo apt-get install build-essential cmake`
- Check cmake version: `cmake --version` (needs 3.13+)

## Environment Variables

**Backend:**
- `PORT` - Server port (default: 5001)
- `LLAMA_SERVER_URL` - Llama server (default: http://localhost:8080)
- `EMBEDDING_SERVER_URL` - Embedding server (default: http://localhost:8081)

**Frontend:**
- `REACT_APP_DEPLOYMENT` - 'local' or 'vm'
- `REACT_APP_API_URL` - Backend URL (auto-set)
