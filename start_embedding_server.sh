#!/bin/bash

# Start llama-server with GGUF embedding model
# Usage: ./start_embedding_server.sh /path/to/all-MiniLM-L6-v2.gguf

set -e

MODEL="$1"
PORT="${2:-8081}"  # Default port 8081 for embedding server

if [ -z "$MODEL" ]; then
    echo "Usage: $0 /path/to/embedding-model.gguf [port]"
    echo ""
    echo "Example:"
    echo "  ./start_embedding_server.sh /opt/models/all-MiniLM-L6-v2.gguf"
    echo ""
    echo "Or download from HuggingFace:"
    echo "  huggingface-cli download Mungert/all-MiniLM-L6-v2-GGUF --local-dir ./models/all-MiniLM-L6-v2"
    exit 1
fi

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

echo "🚀 Starting embedding server with $MODEL on port $PORT"
echo "   Model: $(basename $MODEL)"

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

