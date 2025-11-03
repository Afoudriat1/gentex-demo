# Aspen 4B – Full Benchmark Report

**Generated:** 2025-10-31 11:40:40   
**Latest run (UTC):** 2025-10-31T18:40:39Z

## Latency and Throughput
- Text generation throughput (tg256): 6 tokens/sec
- Prompt processing throughput (pp1024): see llama-bench output

## Memory Footprint and Model Size
- Model file: `/Users/andrewfoudriat/MODEL DEMO/server/aspen-4b.gguf`
- Model size (disk): 1.0 GB
- Runtime memory breakdown (ctx=2048, CPU-only):
  - Model buffer (CPU): 1035.93 MiB
  - KV cache (CPU, f16 K/V): 288.00 MiB
  - Compute buffers (CPU): 301.75 MiB
  - Output buffer (CPU): 0.58 MiB
  - Token/special caches: 0.93 MiB
  - Estimated total RAM: ~1.59 GB

Notes: KV cache grows roughly linearly with context size; halving ctx to 1024 reduces KV to ~144 MiB.

## Power Efficiency (CPU)
- Idle average: 0.389 W  
- Active average: 13.632 W  
- Net average: 13.243 W  
- Energy per token: 2.2071666666666667 J/token

Note: Power units auto-detected (mW→W). Averages are over idle/active sampling windows.

## Test Configuration
- Threads: 6  
- Context size: 2048  
- Prompt tokens: 1024  
- Generation tokens: 256  
- Offload: CPU-only (-ngl 0)

## Files
- Aggregated CSV: `/Users/andrewfoudriat/GENTEX DEMO/benchmarks/aspen_metrics.csv`  
- Aggregated JSONL: `/Users/andrewfoudriat/GENTEX DEMO/benchmarks/aspen_metrics.jsonl`  
- Human report (this): `/Users/andrewfoudriat/GENTEX DEMO/benchmarks/aspen_full_report.md` / `/Users/andrewfoudriat/GENTEX DEMO/benchmarks/aspen_full_report.html`
