# Qwen2.5-3B (Q4_K_M) – Full Benchmark Report

**Generated:** 2025-11-15 17:33:25   
**Latest run (UTC):** 2025-11-16T01:33:25Z

## Latency and Throughput
- Text generation throughput (tg256): 8 tokens/sec
- Prompt processing throughput (pp1024): see llama-bench output

## Memory Footprint and Model Size
- Model file: `/Users/andrewfoudriat/GENTEX DEMO/models/qwen2.5-3b-q4_k_m.gguf`
- Model size (disk): 2.0 GB
- Estimated runtime memory (ctx=4096):
  - Model buffer: 2000 MiB
  - KV cache (f16): 320 MiB
  - Compute buffers: 400 MiB
  - Output buffer: 0.60 MiB
  - Token caches: 1.00 MiB
  - Estimated total RAM: ~2.66 GB

## Power Efficiency (CPU)
- Idle average: 0.231 W  
- Active average: 11.542 W  
- Net average: 11.311 W  
- Energy per token: 1.413875 J/token

## Battery Runtime Estimates
| Battery | Energy (Wh) | Est. runtime (h) | Tokens on full charge |
|---|---:|---:|---:|
| 2x AAA Lithium | 3.6 | 0.32 | 9,166 |
| 5000mAh Samsung | 18.5 | 1.64 | 47,104 |
| 19.0Wh battery | 19.0 | 1.68 | 48,377 |
| 60.0Wh battery | 60.0 | 5.30 | 152,771 |
| 80.0Wh battery | 80.0 | 7.07 | 203,695 |

## Test Configuration
- Threads: 8  
- Context size: 4096  
- Prompt tokens: 1024  
- Generation tokens: 256  
- Offload: CPU-only (-ngl 0)

## Files
- Aggregated CSV: `/Users/andrewfoudriat/GENTEX DEMO/benchmarks/qwen_metrics.csv`  
- Aggregated JSONL: `/Users/andrewfoudriat/GENTEX DEMO/benchmarks/qwen_metrics.jsonl`  
- Human report (this): `/Users/andrewfoudriat/GENTEX DEMO/benchmarks/qwen_full_report.md` / `/Users/andrewfoudriat/GENTEX DEMO/benchmarks/qwen_full_report.html`

## Recent Runs (latest first)
| timestamp (UTC) | threads | pp | tg | t/s | J/token | net_W (W) |
|---|---:|---:|---:|---:|---:|---:|
| 2025-11-16T01:33:25Z | 8 | 1024 | 256 | 8 | 1.413875 | 11.311 |
| 2025-11-16T01:31:16Z | 6 | 1024 | 256 | 6 | 1.4573333333333334 | 8.744 |
| 2025-11-16T01:28:39Z | 4 | 1024 | 256 | 4 | 2.45225 | 9.809 |
| 2025-11-16T01:26:31Z | 2 | 1024 | 256 | 2 | 3.8579999999999997 | 7.715999999999999 |
| 2025-11-16T00:31:43Z | 6 | 1024 | 256 | 6 | 1.6540000000000001 | 9.924000000000001 |
| 2025-11-15T23:45:47Z | 4 | 1024 | 256 | 4 | 2.569 | 10.276 |
| 2025-11-15T23:42:48Z | 2 | 1024 | 256 | 2 | 3.907 | 7.814 |
| 2025-11-15T23:32:16Z | 2 | 1024 | 256 | 2 | 3.984 | 7.968 |
| 2025-11-15T23:28:20Z | 4 | 1024 | 256 | 4 | 2.654 | 10.616 |
| 2025-11-15T23:26:28Z | 2 | 1024 | 256 | 2 | 3.517 | 7.034 |
