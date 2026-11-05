# Safe exporter install

Do not resume the paused uploader (PID 401962, SIGSTOP). Do not point this script at the live `data` branch until the site that understands `schemaVersion` 1 is the published site, and until the owner approves an upload. PR2 (poll fix) stays a separate deployment.

The archive did not contain peer UUID strings. `peer-map.json` therefore maps only the confirmed short names. Unknown UUID filenames are ignored. Add a UUID only after the owner confirms it belongs to that peer:

```json
"uuids": { "00000000-0000-4000-8000-000000000000": "A1" }
```

## What it reads

`SHARED_DIR` is the box shared directory. The script reads operational logs and `telemetry/<BotId>.json`. It reads `tax/sync-status.json` only for `last_updated`, `completeness`, and `open_issues`.

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
