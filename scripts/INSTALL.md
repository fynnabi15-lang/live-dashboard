# Safe one-shot export

Do not resume the paused uploader (PID 401962, SIGSTOP). Do not run `push.py` for this dry-run. It refuses to upload unless `ALLOW_UPLOAD=1`, and that switch stays off until the owner approves a publish. This package does not rewrite git history. Old `data`-branch commits can still contain earlier tax-derived snapshots; deleting them is a separate owner decision.

`peer-map.json` maps all 18 peers. Filename `Main.json` is MAIN and `trades.json` is TRADES. A file is accepted only when its filename (short alias or that peer's UUID) and any `botId` / `uuid` inside the file name the same peer. A trusted UUID found inside an unrelated filename is ignored. The audit fixture omitted some UUIDs because its helper context was narrower; the map here is the full trusted list.

Public tasks are fixed status or result lines. Free-form telemetry summaries stay on the box and are not copied into `state.json`. `trading/backtests/paper-state.json` does not set the trade mode. Mode is `PAPER` or `LIVE` only when `trading/production-mode.json` says that mode and `ready` is true, and the backtest file does not name the other mode. Otherwise mode is unknown.

Raw telemetry files have no `actionKind`. A missing kind is not analysis or a trade and does not set `lastT`. `SCANNING`, `wartend`, `WAITING`, and `monitoring_idle` are status labels only. A summary may be a string or an array of strings. A1 `SCANNING` does not make the last DNUT signal the current target. A completed C3 run file can record a past scan; a peer-reported later run is not invented. Missing MAIN, B1, B3, C1, D2, D3, D4, and TRADES files stay `UNKNOWN`.

## Command

```bash
SHARED_DIR=/home/box/shared OUT_DIR=scratch node export-state-safe.js
```

Required: `SHARED_DIR`. `OUT_DIR` is created relative to the current directory when it is not absolute (default `./site` next to the script). No token. No network.

## Sources read

Operational files under `SHARED_DIR`, only if present:

- `dashboard-telemetry/*.json` (short name or that peer's UUID). `telemetry/` is not read.
- `trading/signals-analyse.jsonl`
- `trading/rug-checks.jsonl`
- `trading/liquidity-checks.jsonl`
- `trading/risk-decisions.jsonl`
- `trading/execution-events.jsonl`
- `trading/real/closed-trades.jsonl`
- `trading/paper/paper-trades.jsonl`
- `trading/whale-events.jsonl`
- `trading/sentiment-checks.jsonl`
- `trading/health/health-status.json`
- `trading/health/health-log.jsonl`
- `trading/backtests/runner-heartbeat.json`
- `trading/backtests/data/harvest/run-log.jsonl`
- `trading/backtests/paper-state.json` (only an explicit `PAPER` or `LIVE` mode)
- `trading/launch-sniffer/runs/<latest completed>.json`
- `trading/arbitration-decisions.jsonl`
- `trading/monitor-events.jsonl`
- `trading/portfolio-state.json` (status time only, no balances)
- `trading/wallet-monitor/wallet-state.json` (public addresses only, no balances)
- `tax/sync-status.json` (`last_updated`, `completeness`, `open_issues` only)

Not read: `tax/tax-ledger.csv`, `tax/tax-ledger.jsonl`, `tax/fifo-lots.json`, tax corrections, private agent stores, or any absolute path named inside a telemetry file.

## Local tests before the dry-run

```bash
node --test export-state-safe.test.js
python3 -m unittest test_push.py
```

Then open `/tmp/botpush-dryrun/state.json` and confirm it has no `realized_result`, `cost_eur`, `fifo`, or `/home/`. `execution.*.verified` stays false and `closed` stays null until a book has `confirmation: true`, `closure: "validated"`, `fees: "complete"`, and for REAL a signature plus `blockTime`. `schemaVersion` and `verified` alone do not publish amounts.

`peer-map.json` in this package already contains the full 18-peer UUID map. A file is accepted only when its filename and its `botId` name the same peer. `botId` may be the short name or that peer's UUID.

## What it reads

`SHARED_DIR` is the box shared directory. The script reads operational logs and `dashboard-telemetry/<uuid-or-alias>.json`. It does not read `telemetry/`. It reads `tax/sync-status.json` only for `last_updated`, `completeness`, and `open_issues`.

It does not read `tax/tax-ledger.csv`, `tax/tax-ledger.jsonl`, `tax/fifo-lots.json`, or correction files. It does not follow paths inside telemetry. Empty trade logs stay `closed: null` with `coverage: "unknown"`. They are not zero.

`lastActionAt` comes from that bot's own file or its own telemetry. `observedAt` is a status read. `sourceUpdatedAt` is file mtime. None of those is `generatedAt`.

A2 and A3 do not inherit A1. A5 does not inherit D3 backtests or `trading/backtests/paper-trades.jsonl`. `status_check`, `config_prep`, and `test` do not become an analysis or a trade, and they do not set `lastT`. MAIN, D5, and TRADES are always present; with no file their status is `UNKNOWN` and `lastActionAt` is null.

## Check on the box

```bash
cd /path/to/scripts
export SHARED_DIR=/home/box/shared
export OUT_DIR=/tmp/botpush-check
node --test export-state-safe.test.js
python3 -m unittest test_push.py
node export-state-safe.js
python3 -c "import json,push; s=json.load(open('/tmp/botpush-check/state.json')); push.validate_state(s); print(push.content_hash(s))"
```

Inspect `state.json` before any upload. It must not contain `realized_result`, `cost_eur`, `fifo`, or `/home/`.

## Upload later

`push.py` runs the exporter into a fresh directory, refuses a non-zero exit, validates JSON, writes atomically, and skips upload when the content hash is unchanged. The hash drops `generatedAt`, `builtAt`, `receivedAt`, `uploadAt`, and `ageMin`. A 409/422 refreshes the blob SHA and retries that same body once. A failed export does not reuse the previous file.

```bash
export GITHUB_DASH_TOKEN=...   # environment only, never a file in this repo
export SHARED_DIR=/home/box/shared
export OUT_DIR=/tmp/botpush
python3 push.py
```

## History

Commits already on the public `data` branch can contain the old tax-derived snapshot. Deleting or rewriting that history is a separate owner decision. This install does not rewrite or delete history.
