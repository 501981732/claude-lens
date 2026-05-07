# AI Coding Lens

A local-first dashboard for visualizing AI coding activity from local [Claude Code](https://claude.ai/code), Codex, and Cursor data sources — projects, sessions, agents, token costs, cache performance, tool calls, model usage, and daily breakdowns.

![AI Coding Lens Dashboard](images/dashboard.png)

## Features

- **Overview dashboard** — sessions, messages, tool calls, agent calls, estimated cost, cache hit rate
- **Session analysis** — inspect sessions by project, model mix, cost, tools, agents, duration, and timeline
- **Agent analysis** — see agent events by agent type, related sessions, related tools, and estimated assisted cost; Codex agent events come from thread/spawn metadata where available
- **Project analytics** — compare projects by sessions, messages, tool calls, agent calls, model usage, cache hit, and cost
- **Cache performance** — hit rate, savings vs no-cache baseline
- **Daily cost & cache table** — per-day token breakdown with estimated spend
- **Tool call analytics** — which tools were used most across sources/projects
- **Model analytics** — response counts, tokens, cache usage, and estimated cost by model
- **Configurable pricing** — swap between Bedrock and Anthropic API rates via `.env`

## Source support

Implemented sources:

- Claude Code local data in `~/.claude`
- Codex local data in `~/.codex`
- Cursor local AI tracking data in `~/.cursor/ai-tracking/ai-code-tracking.db`

The v2 backend uses normalized events internally so additional sources can be added through adapters without rewriting the dashboard. Cloud sync, accounts, team dashboards, and remote storage are not included in this local-first version.

## Requirements

- Node.js 18+
- Claude Code, Codex, and/or Cursor installed; AI Coding Lens reads Claude data from `~/.claude`, Codex data from `~/.codex`, and Cursor tracking data from `~/.cursor/ai-tracking/ai-code-tracking.db` when present

## Quick start

No install needed — run directly from GitHub:

```bash
npx github:foyzulkarim/claude-lens
```

Then open [http://localhost:3456](http://localhost:3456). By default AI Coding Lens reads Claude Code data from `~/.claude`, Codex data from `~/.codex`, and Cursor tracking data from `~/.cursor/ai-tracking/ai-code-tracking.db`.

## Local setup

```bash
git clone https://github.com/foyzulkarim/claude-lens.git
cd claude-lens
npm install
cp .env.example .env
```

Edit `.env` if your local data lives outside the defaults. `CLAUDE_DIR` defaults to `~/.claude`; `CODEX_DIR` defaults to `~/.codex`; `CURSOR_DIR` defaults to `~/.cursor`.

```bash
node server.js
```

Open [http://localhost:3456](http://localhost:3456).

Run tests:

```bash
npm test
```

## Configuration

All options are set via `.env`:

| Variable           | Default | Description                          |
|--------------------|---------|--------------------------------------|
| `CLAUDE_DIR`       | `~/.claude` | Path to Claude data directory    |
| `CODEX_DIR`        | `~/.codex` | Path to Codex data directory      |
| `CODEX_INCLUDE_ARCHIVED` | `false` | Whether to include `~/.codex/archived_sessions` |
| `CURSOR_DIR`       | `~/.cursor` | Path to Cursor local data directory |
| `CURSOR_AI_TRACKING_DB` | `~/.cursor/ai-tracking/ai-code-tracking.db` | Path to Cursor AI tracking SQLite database |
| `RATE_INPUT`       | `5.0`   | Input token price (USD per 1M)       |
| `RATE_OUTPUT`      | `25.0`  | Output token price (USD per 1M)      |
| `RATE_CACHE_READ`  | `0.5`   | Cache read price (USD per 1M)        |
| `RATE_CACHE_CREATE`| `6.25`  | Cache write price (USD per 1M)       |

Default rates match **Bedrock cross-region inference (ap-southeast-2)**. For Anthropic API rates use `RATE_INPUT=15`, `RATE_OUTPUT=75`, `RATE_CACHE_READ=1.5`, `RATE_CACHE_CREATE=18.75`.

## Codex limitations

- Codex token cost is an estimate. It currently reuses the configured pricing rates, and `reasoning_output_tokens` are folded into `outputTokens` for cost estimation.
- Archived Codex sessions are not scanned by default. Set `CODEX_INCLUDE_ARCHIVED=true` to include `~/.codex/archived_sessions`.
- `logs_2.sqlite` is not read.
- Codex support currently uses `state_5.sqlite` metadata plus JSONL session files (`sessions/**/*.jsonl`, optional `archived_sessions`).
- Cloud sync and team dashboards remain future work.

## Cursor limitations

- Cursor support reads only `~/.cursor/ai-tracking/ai-code-tracking.db`.
- Token usage and cost are unavailable because this database does not include token counts; model rows are counted with zero cost.
- `tracked_file_content.content` and Cursor `state.vscdb` `agentKv:*` blobs are not read in this local-first version.
- Human rows from `ai_code_hashes.source = "human"` are ignored for AI activity counts.

## Local privacy

AI Coding Lens reads local Claude Code, Codex, and Cursor data and serves the dashboard locally. It does not upload data or run a remote collector.
