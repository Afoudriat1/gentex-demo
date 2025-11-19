#!/bin/bash
set -euo pipefail

ROOT="/Users/andrewfoudriat/GENTEX DEMO"

THREAD_SETS=${THREAD_SETS:-"2 4 6 8"}
PROMPT_TOKENS=${PROMPT_TOKENS:-1024}
GEN_TOKENS=${GEN_TOKENS:-256}
IDLE_SECS=${IDLE_SECS:-20}
ACTIVE_SECS=${ACTIVE_SECS:-45}

echo "[1/2] Measuring Gemma 2 2B (Q4_K_M) J/token across threads: $THREAD_SETS"
for T in $THREAD_SETS; do
  echo " - threads=$T (pp=$PROMPT_TOKENS, tg=$GEN_TOKENS)"
  THREADS=$T PROMPT_TOKENS=$PROMPT_TOKENS GEN_TOKENS=$GEN_TOKENS IDLE_SECS=$IDLE_SECS ACTIVE_SECS=$ACTIVE_SECS \
    bash "$ROOT/scripts/measure_gemma_jpt.sh"
done

echo "[2/2] Building Gemma benchmark report..."
python3 "$ROOT/scripts/build_gemma_report.py"

echo "Done. Reports written to:"
echo "  - $ROOT/GEMMA_BENCHMARK.md"
echo "  - $ROOT/benchmarks/gemma_full_report.md"
echo "  - $ROOT/benchmarks/gemma_full_report.html"






