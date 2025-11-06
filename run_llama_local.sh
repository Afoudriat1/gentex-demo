#!/bin/bash

# Helper script to ensure only one local llama.cpp server is running.
# Usage:
#   ./run_llama_local.sh /path/to/model.gguf [options]
#
# Options (all optional):
#   --host <addr>          Host to bind (default: 127.0.0.1)
#   --port <port>          Port to bind (default: 8080)
#   --ngl <layers>         Number of GPU layers (default: 0)
#   --ctx <tokens>         Context window (default: 4096)
#   --threads <n>          Threads hint for llama.cpp (default: auto)
#   --parallel <n>         Parallel requests (default: 1)
#   --cache-ram <n>        Cache RAM MB (default: 0 == disabled)
#   --log <file>           Log file (default: ~/llama-server.log)
#   --foreground           Do not background the server (runs in this shell)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LLAMA_DIR="${SCRIPT_DIR}/llama.cpp"
LLAMA_BIN="${LLAMA_DIR}/build/bin/llama-server"

if [ ! -x "${LLAMA_BIN}" ]; then
  echo "❌ llama-server binary not found at ${LLAMA_BIN}." >&2
  echo "   Build it first with: cmake -B build && cmake --build build -j (run inside llama.cpp)." >&2
  exit 1
fi

if [ $# -lt 1 ]; then
  echo "Usage: $0 /path/to/model.gguf [options]" >&2
  exit 1
fi

MODEL_PATH="$(python3 -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "$1")"
shift

if [ ! -f "${MODEL_PATH}" ]; then
  echo "❌ Model file not found: ${MODEL_PATH}" >&2
  exit 1
fi

HOST="127.0.0.1"
PORT="8080"
NGL="0"
CTX="4096"
THREADS=""
PARALLEL="1"
CACHE_RAM="0"
LOG_FILE="${HOME}/llama-server.log"
FOREGROUND=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      HOST="$2"; shift 2 ;;
    --port)
      PORT="$2"; shift 2 ;;
    --ngl)
      NGL="$2"; shift 2 ;;
    --ctx)
      CTX="$2"; shift 2 ;;
    --threads)
      THREADS="$2"; shift 2 ;;
    --parallel)
      PARALLEL="$2"; shift 2 ;;
    --cache-ram)
      CACHE_RAM="$2"; shift 2 ;;
    --log)
      LOG_FILE="$(python3 -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "$2")"; shift 2 ;;
    --foreground)
      FOREGROUND=1; shift ;;
    --help|-h)
      sed -n '1,40p' "$0"; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1 ;;
  esac
done

# Stop any existing llama-server instances
if pgrep -f "llama-server" >/dev/null 2>&1; then
  echo "⏹️  Stopping existing llama-server instances..."
  pkill -f "llama-server"
  sleep 2
fi

CMD=("${LLAMA_BIN}" -m "${MODEL_PATH}" -ngl "${NGL}" --host "${HOST}" --port "${PORT}" --ctx-size "${CTX}" --parallel "${PARALLEL}" --cache-ram "${CACHE_RAM}")

if [ -n "${THREADS}" ]; then
  CMD+=(--threads "${THREADS}")
fi

echo "🚀 Starting llama-server with model: ${MODEL_PATH}"
echo "    Host: ${HOST}  Port: ${PORT}  ngl: ${NGL}  ctx: ${CTX}  parallel: ${PARALLEL}  cache-ram: ${CACHE_RAM}"

if [ "${FOREGROUND}" -eq 1 ]; then
  echo "📡 Running in foreground (Ctrl+C to stop)..."
  exec "${CMD[@]}"
else
  echo "📝 Logging to ${LOG_FILE}"
  nohup "${CMD[@]}" > "${LOG_FILE}" 2>&1 &
  NEW_PID=$!
  echo "✅ llama-server started in background (PID ${NEW_PID})."
  echo "ℹ️  Tail the log with: tail -f ${LOG_FILE}"
fi


