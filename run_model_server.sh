#!/bin/bash

# Simplest possible llama.cpp server launcher
# Usage:
#   ./run_llama_local.sh /path/to/model.gguf

set -e

MODEL="$1"

if [ -z "$MODEL" ]; then
    echo "Usage: $0 /path/to/model.gguf"
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

# Kill any old servers
pkill -f "llama-server" 2>/dev/null || true
sleep 1

echo "🚀 Starting llama-server with $MODEL"

nohup "$LLAMA_BIN" \
    -m "$MODEL" \
    --host 0.0.0.0 \
    --port 8080 \
    --ctx-size 32768 \
    --reasoning-budget 0 \
    --reasoning-format none \
     --samplers no_thought \
    > llama.log 2>&1 &

PID=$!
echo "✅ Running in background (PID $PID)"
echo "📄 Log: tail -f llama.log"

