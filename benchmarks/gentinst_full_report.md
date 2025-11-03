# GentInst – Full Benchmark Report

**Generated:** 2025-11-02 17:21:38   
**Latest run (UTC):** 2025-11-03T00:00:37Z

## Latency and Throughput
- Text generation throughput (tg256): 6 tokens/sec
- Prompt processing throughput (pp1024): see llama-bench output

## Memory Footprint and Model Size
- Model file: `/Users/andrewfoudriat/MODEL DEMO/gentinst/gentinst.gguf`
- Model size (disk): 940.4 MB
- Runtime memory breakdown (ctx=4096, CPU-only, estimated):
  - Model buffer (CPU): 940.00 MiB
  - KV cache (CPU, f16 K/V): 224.00 MiB
  - Compute buffers (CPU): 300.00 MiB
  - Output buffer (CPU): 0.58 MiB
  - Token/special caches: 0.93 MiB
  - Estimated total RAM: ~1.43 GB

Notes: KV cache grows roughly linearly with context size; halving ctx to 2048 reduces KV to ~112 MiB. Values are estimates for Q4_K_M quantized GentInst (1.5B params).

## Power Efficiency (CPU)
- Idle average: 0.246 W  
- Active average: 16.366 W  
- Net average: 16.12 W  
- Energy per token: 2.686666666666667 J/token

## Battery Runtime Estimates
Using net average power and J/token from the latest run. Override batteries via env `BATTERY_WH` (comma-separated).

| Battery | Energy (Wh) | Est. runtime (h) | Tokens on full charge |
|---|---:|---:|---:|
| 2x AAA Lithium | 3.6 | 0.22 | 4,823 |
| 5000mAh Samsung | 18.5 | 1.15 | 24,789 |
| 19.0Wh battery | 19.0 | 1.18 | 25,459 |
| 60.0Wh battery | 60.0 | 3.72 | 80,397 |
| 80.0Wh battery | 80.0 | 4.96 | 107,196 |

Note: Power units auto-detected (mW→W). Averages are over idle/active sampling windows.

## Test Configuration
- Threads: 6  
- Context size: 4096  
- Prompt tokens: 1024  
- Generation tokens: 256  
- Offload: CPU-only (-ngl 0)

## Files
- Aggregated CSV: `/Users/andrewfoudriat/GENTEX DEMO/benchmarks/gentinst_metrics.csv`  
- Aggregated JSONL: `/Users/andrewfoudriat/GENTEX DEMO/benchmarks/gentinst_metrics.jsonl`  
- Human report (this): `/Users/andrewfoudriat/GENTEX DEMO/benchmarks/gentinst_full_report.md` / `/Users/andrewfoudriat/GENTEX DEMO/benchmarks/gentinst_full_report.html`

## Recent Runs (latest first)
| timestamp (UTC) | threads | pp | tg | t/s | J/token | net_W (W) |
|---|---:|---:|---:|---:|---:|---:|
| 2025-11-03T00:00:37Z | 6 | 1024 | 256 | 6 | 2.686666666666667 | 16.12 |
| 2025-11-02T23:47:42Z | 6 | 1024 | 256 | 6 | 2.6454999999999997 | 15.873 |
