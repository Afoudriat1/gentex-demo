#!/usr/bin/env python3
import csv
from datetime import datetime
from pathlib import Path
import os

ROOT = Path('/Users/andrewfoudriat/GENTEX DEMO')
BENCH_DIR = ROOT / 'benchmarks'
CSV_PATH = BENCH_DIR / 'gemma_metrics.csv'
JSONL_PATH = BENCH_DIR / 'gemma_metrics.jsonl'
MODEL_PATH = Path('/Users/andrewfoudriat/GENTEX DEMO/models/gemma-2-2b-it-Q4_K_M.gguf')
REPORT_HTML = BENCH_DIR / 'gemma_full_report.html'
REPORT_MD = BENCH_DIR / 'gemma_full_report.md'


def read_latest_metrics():
    latest = None
    rows = []
    if CSV_PATH.exists():
        with CSV_PATH.open() as f:
            reader = csv.DictReader(f)
            for row in reader:
                latest = row
                rows.append(row)
    return latest, rows


def human_bytes(num_bytes: int) -> str:
    size = float(num_bytes)
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size < 1024.0:
            return f"{size:3.1f} {unit}"
        size /= 1024.0
    return f"{size:.1f} PB"


def get_model_size():
    try:
        return human_bytes(MODEL_PATH.stat().st_size)
    except FileNotFoundError:
        return 'unknown'


def build_recent_runs_table(rows):
    if not rows:
        return "(no data)\n"
    last = rows[-10:][::-1]
    header = "| timestamp (UTC) | threads | pp | tg | t/s | J/token | net_W (W) |\n|---|---:|---:|---:|---:|---:|---:|\n"
    lines = []
    for r in last:
        lines.append(
            f"| {r.get('timestamp','')} | {r.get('threads','')} | {r.get('prompt_tokens','')} | "
            f"{r.get('gen_tokens','')} | {r.get('tokens_per_sec','')} | {r.get('j_per_token','')} | "
            f"{r.get('net_W','')} |"
        )
    return header + "\n".join(lines) + "\n"


def build_markdown(latest, rows):
    ts = latest.get('timestamp', 'N/A') if latest else 'N/A'
    idle_W = latest.get('idle_W', 'N/A') if latest else 'N/A'
    active_W = latest.get('active_W', 'N/A') if latest else 'N/A'
    net_W = latest.get('net_W', 'N/A') if latest else 'N/A'
    tps = latest.get('tokens_per_sec', 'N/A') if latest else 'N/A'
    jpt = latest.get('j_per_token', 'N/A') if latest else 'N/A'
    pp_tokens = latest.get('prompt_tokens', 'N/A') if latest else 'N/A'
    tg_tokens = latest.get('gen_tokens', 'N/A') if latest else 'N/A'
    threads = latest.get('threads', 'N/A') if latest else 'N/A'
    model_size = get_model_size()

    # Rough memory breakdown for Gemma 2 2B Q4_K_M (ctx=4096)
    model_buf_mib = 1600.0
    kv_cache_mib = 256.0
    compute_buf_mib = 350.0
    output_buf_mib = 0.7
    token_cache_mib = 1.0
    total_ram_gb = (model_buf_mib + kv_cache_mib + compute_buf_mib + output_buf_mib + token_cache_mib) / 1024.0

    battery_str = os.environ.get('BATTERY_WH', '2x AAA Lithium:3.6,5000mAh Samsung:18.5,19,60,80')
    batt_items = []
    try:
        for item in battery_str.split(','):
            item = item.strip()
            if ':' in item:
                name, wh = item.split(':', 1)
                batt_items.append((name.strip(), float(wh.strip())))
            else:
                batt_items.append((f"{float(item):.1f}Wh battery", float(item)))
    except Exception:
        batt_items = []

    try:
        net_w_val = float(net_W)
        jpt_val = float(jpt)
    except Exception:
        net_w_val = None
        jpt_val = None

    batt_table = ""
    if batt_items and net_w_val and net_w_val > 0:
        batt_table += "| Battery | Energy (Wh) | Est. runtime (h) | Tokens on full charge |\n|---|---:|---:|---:|\n"
        for name, wh in batt_items:
            hours = wh / net_w_val
            tokens = int((wh * 3600.0) / jpt_val) if (jpt_val and jpt_val > 0) else 0
            batt_table += f"| {name} | {wh:.1f} | {hours:.2f} | {tokens:,} |\n"
    else:
        batt_table = "(battery runtime requires valid net_W and J/token from a measurement)\n"

    return (
        f"# Gemma 2 2B (Q4_K_M) – Full Benchmark Report\n\n"
        f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S %Z')}  \n"
        f"**Latest run (UTC):** {ts}\n\n"
        f"## Latency and Throughput\n"
        f"- Text generation throughput (tg{tg_tokens}): {tps} tokens/sec\n"
        f"- Prompt processing throughput (pp{pp_tokens}): see llama-bench output\n\n"
        f"## Memory Footprint and Model Size\n"
        f"- Model file: `{MODEL_PATH}`\n"
        f"- Model size (disk): {model_size}\n"
        f"- Estimated runtime memory (ctx=4096):\n"
        f"  - Model buffer: {model_buf_mib:.0f} MiB\n"
        f"  - KV cache (f16): {kv_cache_mib:.0f} MiB\n"
        f"  - Compute buffers: {compute_buf_mib:.0f} MiB\n"
        f"  - Output buffer: {output_buf_mib:.2f} MiB\n"
        f"  - Token caches: {token_cache_mib:.2f} MiB\n"
        f"  - Estimated total RAM: ~{total_ram_gb:.2f} GB\n\n"
        f"## Power Efficiency (CPU)\n"
        f"- Idle average: {idle_W} W  \n"
        f"- Active average: {active_W} W  \n"
        f"- Net average: {net_W} W  \n"
        f"- Energy per token: {jpt} J/token\n\n"
        f"## Battery Runtime Estimates\n"
        f"{batt_table}\n"
        f"## Test Configuration\n"
        f"- Threads: {threads}  \n"
        f"- Context size: 4096  \n"
        f"- Prompt tokens: {pp_tokens}  \n"
        f"- Generation tokens: {tg_tokens}  \n"
        f"- Offload: Metal (-ngl 20 unless otherwise specified)\n\n"
        f"## Files\n"
        f"- Aggregated CSV: `{CSV_PATH}`  \n"
        f"- Aggregated JSONL: `{JSONL_PATH}`  \n"
        f"- Human report (this): `{REPORT_MD}` / `{REPORT_HTML}`\n"
        f"\n## Recent Runs (latest first)\n"
        + build_recent_runs_table(rows)
    )


def build_html(md: str) -> str:
    import html
    lines = md.splitlines()
    out = []
    ul_open = False
    for ln in lines:
        if ln.startswith('# '):
            if ul_open:
                out.append('</ul>')
                ul_open = False
            out.append(f"<h1>{html.escape(ln[2:])}</h1>")
        elif ln.startswith('## '):
            if ul_open:
                out.append('</ul>')
                ul_open = False
            out.append(f"<h2>{html.escape(ln[3:])}</h2>")
        elif ln.startswith('- '):
            if not ul_open:
                out.append('<ul>')
                ul_open = True
            out.append(f"<li>{html.escape(ln[2:])}</li>")
        elif ln.strip() == '' and ul_open:
            out.append('</ul>')
            ul_open = False
        else:
            out.append(f"<p>{html.escape(ln)}</p>")
    if ul_open:
        out.append('</ul>')
    style = (
        "<style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;"
        "padding:24px;color:#111}h1{margin-top:0}h2{margin-top:24px}"
        "ul{margin:8px 0 16px 24px}code{background:#f5f5f7;padding:2px 4px;border-radius:4px}</style>"
    )
    return f"<html><head><meta charset='utf-8'>{style}</head><body>" + "\n".join(out) + "</body></html>"


def main():
    latest, rows = read_latest_metrics()
    md = build_markdown(latest, rows)
    BENCH_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_MD.write_text(md)
    REPORT_HTML.write_text(build_html(md))
    print(f"Wrote: {REPORT_MD}")
    print(f"Wrote: {REPORT_HTML}")


if __name__ == '__main__':
    main()


