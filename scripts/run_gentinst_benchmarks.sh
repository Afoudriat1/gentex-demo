#!/bin/bash
set -euo pipefail

ROOT="/Users/andrewfoudriat/GENTEX DEMO"

# Run core/thread benchmarks: iterate a set of thread counts
THREAD_SETS=${THREAD_SETS:-"2 4 6 8"}
PROMPT_TOKENS=${PROMPT_TOKENS:-1024}
GEN_TOKENS=${GEN_TOKENS:-256}
IDLE_SECS=${IDLE_SECS:-20}
ACTIVE_SECS=${ACTIVE_SECS:-45}

echo "[1/2] Measuring GentInst J/token and throughput across threads: $THREAD_SETS"
for T in $THREAD_SETS; do
  echo " - Running threads=$T (pp=$PROMPT_TOKENS, tg=$GEN_TOKENS)"
  THREADS=$T PROMPT_TOKENS=$PROMPT_TOKENS GEN_TOKENS=$GEN_TOKENS IDLE_SECS=$IDLE_SECS ACTIVE_SECS=$ACTIVE_SECS \
    bash "$ROOT/scripts/measure_gentinst_jpt.sh"
done

echo "[2/2] Building full Markdown/HTML report..."
python3 "$ROOT/scripts/build_gentinst_report.py"

echo "Done. Reports at:"
echo "  - $ROOT/GENTINST_BENCHMARK.md (latest human-readable summary)"
echo "  - $ROOT/benchmarks/gentinst_full_report.md"
echo "  - $ROOT/benchmarks/gentinst_full_report.html"

