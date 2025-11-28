#!/bin/bash

# Start llama-server with GGUF embedding model
# Uses embed.gguf model

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL="${SCRIPT_DIR}/embed.gguf"
PORT="${1:-8081}"

if [ ! -f "$MODEL" ]; then
    echo "❌ Model not found: $MODEL"
    exit 1
fi

LLAMA_BIN="./llama.cpp/build/bin/llama-server"

if [ ! -x "$LLAMA_BIN" ]; then
    echo "❌ llama-server binary not found at $LLAMA_BIN"
    exit 1
fi

# Kill any old embedding servers on this port
lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

echo "🚀 Starting embedding server with embed.gguf on port $PORT"

nohup "$LLAMA_BIN" \
    -m "$MODEL" \
    --host 0.0.0.0 \
    --port $PORT \
    --embeddings \
    --pooling mean \
    > embedding-server.log 2>&1 &

PID=$!
echo "✅ Embedding server running (PID $PID)"
echo "📄 Log: tail -f embedding-server.log"
echo ""
echo "Test with:"
echo "  curl -X POST http://localhost:$PORT/embedding \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"content\":\"test\"}'"

