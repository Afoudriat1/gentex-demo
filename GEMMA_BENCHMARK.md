# Gemma 2 2B (Q4_K_M) – Benchmark Report

**Timestamp (UTC):** 2025-11-16T02:32:01Z  
**Local time:** 2025-11-15 18:32:01 PST  
**Host:** Apple Silicon (M2)

## Configuration
- Model: /Users/andrewfoudriat/GENTEX DEMO/models/gemma-2-2b-it-Q4_K_M.gguf (1.6G)
- Threads: 8
- Context: 4096
- Prompt tokens: 1024
- Generation tokens: 256
- Offload: Metal (-ngl 20)

## Throughput
- Prompt processing (pp1024): 294.78 tokens/sec
- Text generation (tg256): 27.67 tokens/sec

## Power
- Idle average: 0.024 W
- Active average: 10.337 W
- Net average: 10.313 W
- Energy per token: 0.3727141308276111 J/token

## Battery Runtime Estimates
| Battery | Energy (Wh) | Est. runtime (h) | Tokens on full charge |
|---|---:|---:|---:|
| 2x AAA Lithium | 3.6 | 0.35 | 34,771 |
| 5000mAh Samsung | 18.5 | 1.79 | 178,689 |
| 19Wh battery | 19.0 | 1.84 | 183,518 |
| 60Wh battery | 60.0 | 5.82 | 579,532 |
| 80Wh battery | 80.0 | 7.76 | 772,710 |

Raw files:
- Idle power: /tmp/power_idle_gemma.txt
- Active power: /tmp/power_active_gemma.txt
- llama-bench output: /tmp/llama_bench_gemma.txt
- Aggregated CSV: /Users/andrewfoudriat/GENTEX DEMO/benchmarks/gemma_metrics.csv
- Aggregated JSONL: /Users/andrewfoudriat/GENTEX DEMO/benchmarks/gemma_metrics.jsonl
