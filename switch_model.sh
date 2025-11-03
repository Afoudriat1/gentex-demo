#!/bin/bash
# Switch between Aspen 4B and Qwen2.5-3B models

MODEL=$1

if [ -z "$MODEL" ]; then
  echo "Usage: ./switch_model.sh [aspen|qwen|gentinst]"
  echo ""
  echo "Available models:"
  echo "  aspen - Aspen 4B (1GB, CPU-only, ternary quantization)"
  echo "  qwen     - Qwen2.5-3B (2GB, GPU-accelerated)"
  echo "  gentinst - GentInst (GGUF converted, GPU-accelerated)"
  exit 1
fi

echo "🔄 Switching to $MODEL model..."

# Stop current llama-server
echo "⏹️  Stopping current llama-server..."
pkill -f llama-server
sleep 2

# Start appropriate model
case $MODEL in
  aspen)
    echo "🌲 Starting Aspen 4B (CPU-only, ternary quantization)..."
    ./llama.cpp/build/bin/llama-server \
      --model aspen-4b.gguf \
      --host 127.0.0.1 \
      --port 8080 \
      -ngl 0 \
      --ctx-size 2048 \
      --threads 6 \
      --cache-ram 0 \
      --parallel 1 &
    
    # Update backend
    curl -X POST http://localhost:5001/api/model/switch \
      -H "Content-Type: application/json" \
      -d '{"model": "aspen"}' \
      2>/dev/null
    
    echo "✅ Aspen 4B is starting on port 8080..."
    ;;
    
  qwen)
    echo "🚀 Starting Qwen2.5-3B (GPU-accelerated)..."
    ./llama.cpp/build/bin/llama-server \
      --model qwen2.5-3b.gguf \
      --host 127.0.0.1 \
      --port 8080 \
      -ngl 35 \
      --ctx-size 4096 \
      --threads 4 \
      --cache-ram 0 \
      --parallel 1 &
    
    # Update backend
    curl -X POST http://localhost:5001/api/model/switch \
      -H "Content-Type: application/json" \
      -d '{"model": "qwen"}' \
      2>/dev/null
    
    echo "✅ Qwen2.5-3B is starting on port 8080..."
    ;;

  gentinst)
    echo "🧩 Starting GentInst (CPU-only)..."
    cd "/Users/andrewfoudriat/GENTEX DEMO"
    ./llama.cpp/build/bin/llama-server \
      --model "/Users/andrewfoudriat/MODEL DEMO/gentinst/gentinst.gguf" \
      --host 127.0.0.1 \
      --port 8080 \
      -ngl 0 \
      --ctx-size 4096 \
      --threads 6 \
      --cache-ram 0 \
      --parallel 1 &

    # Update backend
    curl -X POST http://localhost:5001/api/model/switch \
      -H "Content-Type: application/json" \
      -d '{"model": "gentinst"}' \
      2>/dev/null

    echo "✅ GentInst is starting on port 8080..."
    ;;
    
  *)
    echo "❌ Unknown model: $MODEL"
    echo "Use 'aspen' or 'qwen'"
    exit 1
    ;;
esac

echo ""
echo "⏳ Waiting for model to load..."
sleep 5

echo "🎯 Testing model..."
RESPONSE=$(curl -s -X POST http://localhost:8080/completion \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello", "n_predict": 5}' \
  --max-time 10)

if [ $? -eq 0 ]; then
  echo "✅ Model is ready!"
  echo ""
  CURRENT=$(curl -s http://localhost:5001/api/model | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])" 2>/dev/null || echo "Unknown")
  echo "📊 Current Model: $CURRENT"
  echo "🌐 llama-server: http://localhost:8080"
  echo "🔧 Backend API: http://localhost:5001"
else
  echo "⚠️  Model may still be loading. Check with: curl http://localhost:8080/health"
fi

