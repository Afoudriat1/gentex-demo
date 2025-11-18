# Qwen2.5-3B (Q4_K_M) – Benchmark Report

**Timestamp (UTC):** 2025-11-16T02:54:02Z  
**Local time:** 2025-11-15 18:54:02 PST  
**Host:** Apple Silicon (M2)

## Configuration
- Model: /Users/andrewfoudriat/GENTEX DEMO/models/qwen2.5-3b-q4_k_m.gguf (2.0G)
- Threads: 8
- Context: 4096
- Prompt tokens: 1024
- Generation tokens: 256
- Offload: Metal (-ngl 20)

## Throughput
- Prompt processing (pp1024): 165.71 tokens/sec
- Text generation (tg256): 23.64 tokens/sec

## Power
- Idle average: 0.023 W
- Active average: 11.178 W
- Net average: 11.155000000000001 W
- Energy per token: 0.4718697123519459 J/token

## Battery Runtime Estimates
| Battery | Energy (Wh) | Est. runtime (h) | Tokens on full charge |
|---|---:|---:|---:|
| 2x AAA Lithium | 3.6 | 0.32 | 27,465 |
| 5000mAh Samsung | 18.5 | 1.66 | 141,140 |
| 19Wh battery | 19.0 | 1.70 | 144,955 |
| 60Wh battery | 60.0 | 5.38 | 457,753 |
| 80Wh battery | 80.0 | 7.17 | 610,337 |

Raw files:
- Idle power: /tmp/power_idle_qwen.txt
- Active power: /tmp/power_active_qwen.txt
- llama-bench output: /tmp/llama_bench_qwen.txt
- Aggregated CSV: /Users/andrewfoudriat/GENTEX DEMO/benchmarks/qwen_metrics.csv
- Aggregated JSONL: /Users/andrewfoudriat/GENTEX DEMO/benchmarks/qwen_metrics.jsonl
