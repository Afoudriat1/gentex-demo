# How to Start llama-server

The backend needs llama-server running on port 8080 to generate AI responses.

## Quick Start (if you have models)

If you already have model files (.gguf) and llama.cpp built:

```bash
cd gentex-demo
./switch_model.sh aspen
```

## Full Setup (if you don't have models)

### Step 1: Build llama.cpp

```bash
cd gentex-demo
cd llama.cpp
mkdir -p build
cd build
cmake ..
make -j
cd ../..
```

### Step 2: Download a Model

**Option A: Aspen 4B (Recommended - Small, Fast)**
```bash
pip3 install huggingface-hub
huggingface-cli download TerneForge/aspen_4b_draft --include "*.gguf" --local-dir ./
```

**Option B: Qwen2.5-3B (Larger, Better Quality)**
```bash
huggingface-cli download Qwen/Qwen2.5-3B-Instruct-GGUF --include "*q4_k_m.gguf" --local-dir ./
```

### Step 3: Start llama-server

```bash
cd gentex-demo
./switch_model.sh aspen
```

### Step 4: Verify it's running

```bash
curl http://localhost:8080/health
```

Should return a response (not an error).

## Troubleshooting

**"llama-server: command not found"**
- Build llama.cpp first (Step 1)

**"Model file not found"**
- Download a model first (Step 2)
- Make sure the .gguf file is in the gentex-demo directory

**"Port 8080 already in use"**
- Kill existing process: `pkill -f llama-server`
- Or use a different port in switch_model.sh

**Backend says "model did not generate response"**
- Check llama-server is running: `curl http://localhost:8080/health`
- Check backend logs for errors
- Make sure model file path is correct in switch_model.sh

## Alternative: Use Remote llama-server

If you have llama-server running on another machine:

1. Update `backend/server.js`:
```javascript
const LLAMA_SERVER_URL = 'http://YOUR_SERVER_IP:8080';
```

2. Restart backend:
```bash
cd backend
node server.js
```




