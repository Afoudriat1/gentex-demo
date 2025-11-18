#!/bin/bash
set -euo pipefail

# Measure Qwen2.5-3B (Q4_K_M) energy per token on Apple Silicon.
# This mirrors the GentInst benchmarking flow but points to the local Qwen GGUF.

MODEL_PATH="/Users/andrewfoudriat/GENTEX DEMO/models/qwen2.5-3b-q4_k_m.gguf"
LLAMA_CPP_DIR="/Users/andrewfoudriat/GENTEX DEMO/llama.cpp"
LLAMA_BENCH="$LLAMA_CPP_DIR/build/bin/llama-bench"

IDLE_SECS=${IDLE_SECS:-20}
ACTIVE_SECS=${ACTIVE_SECS:-45}
THREADS=${THREADS:-6}
NGL=${NGL:-20}
PROMPT_TOKENS=${PROMPT_TOKENS:-1024}
GEN_TOKENS=${GEN_TOKENS:-256}

IDLE_OUT="/tmp/power_idle_qwen.txt"
ACTIVE_OUT="/tmp/power_active_qwen.txt"
BENCH_OUT="/tmp/llama_bench_qwen.txt"

BENCH_DIR="/Users/andrewfoudriat/GENTEX DEMO/benchmarks"
SUMMARY_CSV="$BENCH_DIR/qwen_metrics.csv"
SUMMARY_JSONL="$BENCH_DIR/qwen_metrics.jsonl"
REPORT_MD="/Users/andrewfoudriat/GENTEX DEMO/QWEN_BENCHMARK.md"

if [[ ! -x "$LLAMA_BENCH" ]]; then
  echo "ERROR: llama-bench not found at $LLAMA_BENCH" >&2
  exit 1
fi
if [[ ! -f "$MODEL_PATH" ]]; then
  echo "ERROR: Qwen model not found at $MODEL_PATH" >&2
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

echo "Sampling IDLE CPU power for ${IDLE_SECS}s..."
sudo powermetrics --samplers cpu_power -i 1000 -n "$IDLE_SECS" | tee "$IDLE_OUT" >/dev/null

echo "Sampling ACTIVE CPU power for ${ACTIVE_SECS}s while llama-bench runs..."
sudo powermetrics --samplers cpu_power -i 1000 -n "$ACTIVE_SECS" > "$ACTIVE_OUT" 2>/dev/null &
PM_PID=$!

echo "Running llama-bench (Qwen2.5-3B Q4_K_M, -ngl $NGL)..."
"$LLAMA_BENCH" -m "$MODEL_PATH" -p "$PROMPT_TOKENS" -n "$GEN_TOKENS" -t "$THREADS" -ngl "$NGL" | tee "$BENCH_OUT" >/dev/null || true

wait "$PM_PID" || true

avg_from_powermetrics() {
  local file=$1
  awk '/CPU Power/ {
    val=$3; unit=$(NF);
    if (unit=="mW") val/=1000;
    sum+=val; n++
  } END {
    if (n>0) printf "%.3f\n", sum/n; else print "0";
  }' "$file"
}

IDLE_W=$(avg_from_powermetrics "$IDLE_OUT")
ACTIVE_W=$(avg_from_powermetrics "$ACTIVE_OUT")

extract_number() {
  local raw=$1
  echo "$raw" | grep -Eo "[0-9]+(\\.[0-9]+)?" | head -n1
}

# In llama-bench tables, the t/s value is in the last column.
# We split on '|' and take the last non-empty field (typically $NF-1 due to trailing '|').
TPS_RAW=$(awk -v tg="tg${GEN_TOKENS}" -F'|' '
  $0 ~ tg {
    # take the last non-empty field
    for (i = NF; i >= 1; i--) {
      gsub(/^[ \t]+|[ \t]+$/, "", $i);
      if ($i != "") { print $i; break; }
    }
    exit
  }' "$BENCH_OUT")

PP_RAW=$(awk -v pp="pp${PROMPT_TOKENS}" -F'|' '
  $0 ~ pp {
    for (i = NF; i >= 1; i--) {
      gsub(/^[ \t]+|[ \t]+$/, "", $i);
      if ($i != "") { print $i; break; }
    }
    exit
  }' "$BENCH_OUT")

TPS=$(extract_number "$TPS_RAW")
PP_TPS=$(extract_number "$PP_RAW")

if [[ -z "${TPS}" ]]; then
  TPS=$(grep -Eo "tg${GEN_TOKENS}.*?[0-9]+\\.[0-9]+" "$BENCH_OUT" | tail -n1 | grep -Eo "[0-9]+\\.[0-9]+" || true)
fi
if [[ -z "${PP_TPS}" ]]; then
  PP_TPS=$(grep -Eo "pp${PROMPT_TOKENS}.*?[0-9]+\\.[0-9]+" "$BENCH_OUT" | tail -n1 | grep -Eo "[0-9]+\\.[0-9]+" || true)
fi

if [[ -z "${TPS}" ]]; then
  echo "ERROR: Could not parse generation tokens/sec from llama-bench output." >&2
  exit 1
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

echo ""
echo "===== Qwen 2.5-3B Q4_K_M – J/token Estimate ====="
echo "Idle CPU power (W):     $IDLE_W"
echo "Active CPU power (W):   $ACTIVE_W"
echo "Net CPU power (W):      $NET_W"
echo "Generation rate (t/s):  $TPS"
echo "Joules per token:       $J_PER_TOKEN"

mkdir -p "$BENCH_DIR"
timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if [[ ! -f "$SUMMARY_CSV" ]]; then
  echo "timestamp,idle_W,active_W,net_W,tokens_per_sec,j_per_token,idle_secs,active_secs,threads,prompt_tokens,gen_tokens" > "$SUMMARY_CSV"
fi
echo "$timestamp,$IDLE_W,$ACTIVE_W,$NET_W,$TPS,$J_PER_TOKEN,$IDLE_SECS,$ACTIVE_SECS,$THREADS,$PROMPT_TOKENS,$GEN_TOKENS" >> "$SUMMARY_CSV"

python3 - <<PY >> "$SUMMARY_JSONL"
import json
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

MODEL_SIZE=$(ls -lh "$MODEL_PATH" | awk '{print $5}')
NOW_LOCAL=$(date +"%Y-%m-%d %H:%M:%S %Z")
BATTERY_TABLE=$(python3 - <<PY
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
cat > "$REPORT_MD" <<EOF
# Qwen2.5-3B (Q4_K_M) – Benchmark Report

**Timestamp (UTC):** $timestamp  
**Local time:** $NOW_LOCAL  
**Host:** Apple Silicon (M2)

## Configuration
- Model: $MODEL_PATH ($MODEL_SIZE)
- Threads: $THREADS
- Context: 4096
- Prompt tokens: $PROMPT_TOKENS
- Generation tokens: $GEN_TOKENS
- Offload: Metal (-ngl $NGL)

## Throughput
- Prompt processing (pp$PROMPT_TOKENS): ${PP_TPS:-N/A} tokens/sec
- Text generation (tg$GEN_TOKENS): ${TPS:-N/A} tokens/sec

## Power
- Idle average: ${IDLE_W} W
- Active average: ${ACTIVE_W} W
- Net average: ${NET_W} W
- Energy per token: ${J_PER_TOKEN} J/token

## Battery Runtime Estimates
$BATTERY_TABLE

Raw files:
- Idle power: $IDLE_OUT
- Active power: $ACTIVE_OUT
- llama-bench output: $BENCH_OUT
- Aggregated CSV: $SUMMARY_CSV
- Aggregated JSONL: $SUMMARY_JSONL
EOF

echo "Report written to: $REPORT_MD"

