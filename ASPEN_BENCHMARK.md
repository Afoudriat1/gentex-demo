# Aspen 4B – Benchmark Report

**Timestamp:** 2025-10-31T18:40:39Z (UTC)  
**Local time:** 2025-10-31 11:40:40 PDT  
**Host:** Apple Silicon (M2)

## Configuration
- Model: /Users/andrewfoudriat/MODEL DEMO/server/aspen-4b.gguf (1.0G)
- Threads: 6
- Context (ctx-size): 2048
- Prompt tokens: 1024
- Generation tokens: 256
- Offload: CPU-only (-ngl 0)

## Throughput
- Prompt processing (pp1024): 6 tokens/sec
- Text generation (tg256): 6 tokens/sec

## Power (CPU)
- Idle average: 0.389 W
- Active average: 13.632 W
- Net average: 13.243 W
- Energy per token: 2.2071666666666667 J/token

Note: Power units are auto-detected from powermetrics (mW→W conversion applied). Values are averages over the sampling windows (idle 20s, active 45s).

## Files
- Raw idle power: /tmp/power_idle.txt
- Raw active power: /tmp/power_active.txt
- llama-bench output: /tmp/llama_bench_aspen.txt
- Aggregated CSV: /Users/andrewfoudriat/GENTEX DEMO/benchmarks/aspen_metrics.csv
- Aggregated JSONL: /Users/andrewfoudriat/GENTEX DEMO/benchmarks/aspen_metrics.jsonl

