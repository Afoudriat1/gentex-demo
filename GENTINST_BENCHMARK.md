# GentInst – Benchmark Report

**Timestamp:** 2025-11-03T01:54:31Z (UTC)  
**Local time:** 2025-11-02 17:54:31 PST  
**Host:** Apple Silicon (M2)

## Configuration
- Model: /Users/andrewfoudriat/MODEL DEMO/gentinst/gentinst.gguf (940M)
- Threads: 6
- Context (ctx-size): 4096
- Prompt tokens: 1024
- Generation tokens: 256
- Offload: CPU-only (-ngl 0)

## Throughput
- Prompt processing (pp1024): 6 tokens/sec
- Text generation (tg256): 6 tokens/sec

## Power (CPU)
- Idle average: 0.120 W
- Active average: 16.413 W
- Net average: 16.293 W
- Energy per token: 2.7155 J/token

Note: Power units are auto-detected from powermetrics (mW→W conversion applied). Values are averages over the sampling windows (idle 20s, active 45s).

## Battery Runtime Estimates
| Battery | Energy (Wh) | Est. runtime (h) | Tokens on full charge |
|---|---:|---:|---:|
| 2x AAA Lithium | 3.6 | 0.22 | 4,772 |
| 5000mAh Samsung | 18.5 | 1.14 | 24,525 |
| 19Wh battery | 19.0 | 1.17 | 25,188 |
| 60Wh battery | 60.0 | 3.68 | 79,543 |
| 80Wh battery | 80.0 | 4.91 | 106,057 |

## Files
- Raw idle power: /tmp/power_idle.txt
- Raw active power: /tmp/power_active.txt
- llama-bench output: /tmp/llama_bench_gentinst.txt
- Aggregated CSV: /Users/andrewfoudriat/GENTEX DEMO/benchmarks/gentinst_metrics.csv
- Aggregated JSONL: /Users/andrewfoudriat/GENTEX DEMO/benchmarks/gentinst_metrics.jsonl

