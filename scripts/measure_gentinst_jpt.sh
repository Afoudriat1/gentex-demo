#!/bin/bash
set -euo pipefail

# Measure GentInst energy per token (J/token) on Apple Silicon
# Steps: close apps (best-effort), sample idle CPU power, run llama-bench while sampling CPU power,
# parse generation t/s, compute (active-idle)/tps.

MODEL_PATH="/Users/andrewfoudriat/MODEL DEMO/gentinst/gentinst.gguf"
LLAMA_CPP_DIR="/Users/andrewfoudriat/GENTEX DEMO/llama.cpp"
LLAMA_BENCH="$LLAMA_CPP_DIR/build/bin/llama-bench"

IDLE_SECS=${IDLE_SECS:-20}
ACTIVE_SECS=${ACTIVE_SECS:-45}
THREADS=${THREADS:-6}
PROMPT_TOKENS=${PROMPT_TOKENS:-1024}
GEN_TOKENS=${GEN_TOKENS:-256}

IDLE_OUT="/tmp/power_idle.txt"
ACTIVE_OUT="/tmp/power_active.txt"
BENCH_OUT="/tmp/llama_bench_gentinst.txt"

# Persisted summaries
BENCH_DIR="/Users/andrewfoudriat/GENTEX DEMO/benchmarks"
SUMMARY_CSV="$BENCH_DIR/gentinst_metrics.csv"
SUMMARY_JSONL="$BENCH_DIR/gentinst_metrics.jsonl"
REPORT_MD="/Users/andrewfoudriat/GENTEX DEMO/GENTINST_BENCHMARK.md"

if [[ ! -x "$LLAMA_BENCH" ]]; then
  echo "ERROR: llama-bench not found at $LLAMA_BENCH" >&2
  exit 1
fi
if [[ ! -f "$MODEL_PATH" ]]; then
  echo "ERROR: GentInst model not found at $MODEL_PATH" >&2
  exit 1
fi

echo "This will try to close visible apps (except Finder, Terminal, Cursor) for a cleaner idle baseline."
read -r -p "Proceed? [y/N] " ANS || true
if [[ "${ANS:-}" =~ ^[Yy]$ ]]; then
  /usr/bin/osascript <<'OSA'
  tell application "System Events"
    set appList to name of every process whose background only is false
  end tell
  set skipList to {"Finder", "Terminal", "iTerm2", "Cursor"}
  repeat with appName in appList
    if skipList does not contain (appName as text) then
      try
        tell application (appName as text) to quit
      end try
    end if
  end repeat
OSA
  echo "Waiting 5s for apps to close..."; sleep 5
fi

echo "Sampling IDLE CPU power for ${IDLE_SECS}s (sudo required for powermetrics)..."
sudo powermetrics --samplers cpu_power -i 1000 -n "$IDLE_SECS" | tee "$IDLE_OUT" >/dev/null

echo "Starting ACTIVE power sampling for ${ACTIVE_SECS}s..."
sudo powermetrics --samplers cpu_power -i 1000 -n "$ACTIVE_SECS" > "$ACTIVE_OUT" 2>/dev/null &
PM_PID=$!

echo "Running llama-bench (GentInst CPU-only) ..."
"$LLAMA_BENCH" -m "$MODEL_PATH" -p "$PROMPT_TOKENS" -n "$GEN_TOKENS" -t "$THREADS" -ngl 0 | tee "$BENCH_OUT" >/dev/null || true

wait "$PM_PID" || true

avg_from_powermetrics() {
  local file=$1
  awk '/CPU Power/ {
    val=$3; unit=$(NF);
    if (unit=="mW") val/=1000; # convert milliwatts to watts
    sum+=val; n++
  } END {
    if (n>0) printf "%.3f\n", sum/n; else print "0";
  }' "$file"
}

IDLE_W=$(avg_from_powermetrics "$IDLE_OUT")
ACTIVE_W=$(avg_from_powermetrics "$ACTIVE_OUT")

# Parse generation t/s from llama-bench table line containing "tg${GEN_TOKENS}"
TPS=$(awk -v tg="tg${GEN_TOKENS}" 'BEGIN{FS="|"} $0 ~ tg { gsub(/^[ \t]+|[ \t]+$/, "", $6); print $6 }' "$BENCH_OUT" | head -n1)

if [[ -z "${TPS}" ]]; then
  # Fallback: grep for a numeric tokens/s pattern
  TPS=$(grep -Eo "tg${GEN_TOKENS}.*?[0-9]+\.[0-9]+" "$BENCH_OUT" | tail -n1 | grep -Eo "[0-9]+\.[0-9]+" || true)
fi

if [[ -z "${TPS}" ]]; then
  echo "ERROR: Could not parse generation tokens/sec from benchmark output." >&2
  exit 1
fi

# Parse prompt processing t/s (pp)
PP_TPS=$(awk -v pp="pp${PROMPT_TOKENS}" 'BEGIN{FS="|"} $0 ~ pp { gsub(/^[ \t]+|[ \t]+$/, "", $6); print $6 }' "$BENCH_OUT" | head -n1)
if [[ -z "${PP_TPS}" ]]; then
  PP_TPS=$(grep -Eo "pp${PROMPT_TOKENS}.*?[0-9]+\.[0-9]+" "$BENCH_OUT" | tail -n1 | grep -Eo "[0-9]+\.[0-9]+" || true)
fi

NET_W=$(python3 - <<PY
idle = float("${IDLE_W}")
act = float("${ACTIVE_W}")
print(max(act - idle, 0.0))
PY
)

J_PER_TOKEN=$(python3 - <<PY
net_w = float("${NET_W}")
tps = float("${TPS}")
print(net_w / tps if tps > 0 else 0.0)
PY
)

echo "\n===== GentInst J/token Estimate ====="
echo "Idle CPU power (W):     $IDLE_W"
echo "Active CPU power (W):   $ACTIVE_W"
echo "Net CPU power (W):      $NET_W"
echo "Generation rate (t/s):  $TPS"
echo "Joules per token:       $J_PER_TOKEN"
echo "Results saved to: $IDLE_OUT, $ACTIVE_OUT, $BENCH_OUT"

# Write structured summaries
mkdir -p "$BENCH_DIR"
timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# CSV header if missing
if [[ ! -f "$SUMMARY_CSV" ]]; then
  echo "timestamp,idle_W,active_W,net_W,tokens_per_sec,j_per_token,idle_secs,active_secs,threads,prompt_tokens,gen_tokens" > "$SUMMARY_CSV"
fi
echo "$timestamp,$IDLE_W,$ACTIVE_W,$NET_W,$TPS,$J_PER_TOKEN,$IDLE_SECS,$ACTIVE_SECS,$THREADS,$PROMPT_TOKENS,$GEN_TOKENS" >> "$SUMMARY_CSV"

# JSONL
python3 - <<PY >> "$SUMMARY_JSONL"
import json, os
entry = {
  "timestamp": "$timestamp",
  "idle_W": float("${IDLE_W}"),
  "active_W": float("${ACTIVE_W}"),
  "net_W": float("${NET_W}"),
  "tokens_per_sec": float("${TPS}"),
  "j_per_token": float("${J_PER_TOKEN}"),
  "idle_secs": int("${IDLE_SECS}"),
  "active_secs": int("${ACTIVE_SECS}"),
  "threads": int("${THREADS}"),
  "prompt_tokens": int("${PROMPT_TOKENS}"),
  "gen_tokens": int("${GEN_TOKENS}")
}
print(json.dumps(entry))
PY

echo "Summary appended to: $SUMMARY_CSV and $SUMMARY_JSONL"


# Overwrite human-readable markdown report
MODEL_SIZE=$(ls -lh "$MODEL_PATH" | awk '{print $5}')
NOW_LOCAL=$(date +"%Y-%m-%d %H:%M:%S %Z")
cat > "$REPORT_MD" <<EOF
# GentInst – Benchmark Report

**Timestamp:** $timestamp (UTC)  
**Local time:** $NOW_LOCAL  
**Host:** Apple Silicon (M2)

## Configuration
- Model: $MODEL_PATH ($MODEL_SIZE)
- Threads: $THREADS
- Context (ctx-size): 4096
- Prompt tokens: $PROMPT_TOKENS
- Generation tokens: $GEN_TOKENS
- Offload: CPU-only (-ngl 0)

## Throughput
- Prompt processing (pp$PROMPT_TOKENS): ${PP_TPS:-N/A} tokens/sec
- Text generation (tg$GEN_TOKENS): ${TPS:-N/A} tokens/sec

## Power (CPU)
- Idle average: ${IDLE_W} W
- Active average: ${ACTIVE_W} W
- Net average: ${NET_W} W
- Energy per token: ${J_PER_TOKEN} J/token

Note: Power units are auto-detected from powermetrics (mW→W conversion applied). Values are averages over the sampling windows (idle ${IDLE_SECS}s, active ${ACTIVE_SECS}s).

## Battery Runtime Estimates
$(python3 - <<PY
net_w = float("${NET_W}")
j_per_tok = float("${J_PER_TOKEN}")

batteries = [
    ("2x AAA Lithium", 3.6),
    ("5000mAh Samsung", 18.5),
    ("19Wh battery", 19.0),
    ("60Wh battery", 60.0),
    ("80Wh battery", 80.0)
]

if net_w > 0 and j_per_tok > 0:
    print("| Battery | Energy (Wh) | Est. runtime (h) | Tokens on full charge |")
    print("|---|---:|---:|---:|")
    for name, wh in batteries:
        hours = wh / net_w
        tokens = int((wh * 3600.0) / j_per_tok)
        print(f"| {name} | {wh:.1f} | {hours:.2f} | {tokens:,} |")
else:
    print("(battery runtime requires valid net_W and J/token from a measurement)")
PY
)

## Files
- Raw idle power: $IDLE_OUT
- Raw active power: $ACTIVE_OUT
- llama-bench output: $BENCH_OUT
- Aggregated CSV: $SUMMARY_CSV
- Aggregated JSONL: $SUMMARY_JSONL

EOF

echo "Human-readable report written to: $REPORT_MD"

