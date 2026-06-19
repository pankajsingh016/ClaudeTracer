# Claude Code Usage Dashboard

A local web dashboard for your **Claude Code** CLI usage — chat-session history by
project, token usage, and equivalent API cost, with rich interactive charts.

It reads the JSONL transcripts Claude Code already writes under `~/.claude/`, so
there's nothing to configure: **clone it, run it, and you see your own usage.**

![tabs: Overview · Sessions · Transcript](https://img.shields.io/badge/tabs-Overview%20%C2%B7%20Sessions%20%C2%B7%20Transcript-d97757)

## Features

- **Overview** — animated KPIs (equivalent cost, tokens, sessions, cache savings) plus
  a GitHub-style **calendar heatmap**, a **sunburst** of spend by project → model, a
  **stream graph** of tokens over time, a **treemap** of projects by cost, and a project leaderboard.
- **Sessions browser** — every session grouped by project, sortable by cost / tokens / recency.
- **Transcript viewer** — re-read any session: user / assistant / thinking / tool blocks,
  per-turn tokens and cost, collapsible tool output.
- **Search & filters** — search sessions and filter by project and model across the app.
- **Refresh** — re-scans your `~/.claude` on demand (or auto-poll every 10s).

## Quickstart

**Prerequisites:** Python 3.10+, Node 18+, and `make` (macOS/Linux; Windows via WSL).

```bash
git clone <repo-url> claude-dashboard
cd claude-dashboard
make setup     # creates a venv, installs backend + frontend deps
make run       # builds the UI and starts the server
# open http://localhost:8000  → your own Claude Code usage
```

That's it. The dashboard reads **your** `~/.claude` on the machine it runs on, so a
teammate who clones it sees their own data — nothing is hard-coded to anyone's path.

### Development (hot reload)

```bash
make dev       # FastAPI on :8000, Vite on :5173 (proxies /api)
# open http://localhost:5173
```

### Tests

```bash
make test      # cost-engine unit tests
```

## How it works / where the data comes from

Claude Code stores every session as an append-only JSONL file at
`~/.claude/projects/<encoded-project-path>/<session-id>.jsonl`. Each assistant message
carries a `usage` block (input/output tokens, plus cache read and 5-min/1-hour cache
writes). This app:

1. **Scans** `~/.claude/projects` (FastAPI backend, `backend/`).
2. **Parses** each transcript, using the `cwd` field inside the file for the real project
   name (the directory name is a lossy hyphen-encoding and can't be reversed reliably).
3. **Prices** each message into an **equivalent API cost** using current per-model rates
   and cache multipliers (read 0.1×, 5-min write 1.25×, 1-hour write 2.0× of input).
4. **Serves** it as JSON; a React + Nivo SPA (`frontend/`) renders the charts.

> **"Equivalent API cost"**: if you're on a Claude Max/Pro subscription you don't pay per
> token — this is what the same usage *would* cost on the pay-as-you-go API. Unknown
> models fall back to Opus rates and are flagged with a `*`.

## Configuration

| Env var      | Default     | Purpose                                              |
|--------------|-------------|------------------------------------------------------|
| `CLAUDE_DIR` | `~/.claude` | Point at a non-default data dir or an exported copy. |

```bash
CLAUDE_DIR=/path/to/.claude make run
```

Update model prices in `backend/pricing.py` (`PRICING` dict) when rates change.

## Project layout

```
backend/
  main.py        FastAPI app + endpoints + static UI mount
  store.py       scan + incremental-cached JSONL parser + aggregation
  pricing.py     PRICING table + cost engine
  test_cost.py   cost-engine unit tests
frontend/
  src/App.tsx    tab shell, filters, refresh
  src/api.ts     typed API client + formatters
  src/tabs/      Overview, Sessions, Transcript
  src/components/ charts.tsx (Nivo), ui.tsx (KPI/Card)
Makefile         setup · dev · build · run · test
```

## License

MIT — do whatever you like.
