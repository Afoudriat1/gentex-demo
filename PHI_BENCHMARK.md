# Phi-3.5 Mini (Q4_K_M) – Benchmark Report

**Timestamp (UTC):** 2025-11-16T02:47:10Z  
**Local time:** 2025-11-15 18:47:10 PST  
**Host:** Apple Silicon (M2)

## Configuration
- Model: /Users/andrewfoudriat/GENTEX DEMO/models/Phi-3.5-mini-instruct-Q4_K_M.gguf (2.2G)
- Threads: 8
- Context: 4096
- Prompt tokens: 1024
- Generation tokens: 256
- Offload: Metal (-ngl 20)

## Throughput
- Prompt processing (pp1024): 141.84 tokens/sec
- Text generation (tg256): 25.77 tokens/sec

## Power
- Idle average: 0.029 W
- Active average: 8.944 W
- Net average: 8.915000000000001 W
- Energy per token: 0.3459448971672488 J/token

## Battery Runtime Estimates
| Battery | Energy (Wh) | Est. runtime (h) | Tokens on full charge |
|---|---:|---:|---:|
| 2x AAA Lithium | 3.6 | 0.40 | 37,462 |
| 5000mAh Samsung | 18.5 | 2.08 | 192,516 |
| 19Wh battery | 19.0 | 2.13 | 197,719 |
| 60Wh battery | 60.0 | 6.73 | 624,376 |
| 80Wh battery | 80.0 | 8.97 | 832,502 |

Raw files:
- Idle power: /tmp/power_idle_phi.txt
- Active power: /tmp/power_active_phi.txt
- llama-bench output: /tmp/llama_bench_phi.txt
- Aggregated CSV: /Users/andrewfoudriat/GENTEX DEMO/benchmarks/phi_metrics.csv
- Aggregated JSONL: /Users/andrewfoudriat/GENTEX DEMO/benchmarks/phi_metrics.jsonl
