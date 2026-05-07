# AI Coding Lens

A local-first dashboard for visualizing your [Claude Code](https://claude.ai/code) activity — projects, sessions, agents, token costs, cache performance, tool calls, model usage, and daily breakdowns.

![Claude Code Usage Dashboard](images/dashboard.png)

## Features

- **Overview dashboard** — sessions, messages, tool calls, agent calls, estimated cost, cache hit rate
- **Session analysis** — inspect sessions by project, model mix, cost, tools, agents, duration, and timeline
- **Agent analysis** — see Claude Code `Agent` tool usage by agent type, related sessions, related tools, and estimated assisted cost
- **Project analytics** — compare projects by sessions, messages, tool calls, agent calls, model usage, cache hit, and cost
- **Cache performance** — hit rate, savings vs no-cache baseline
- **Daily cost & cache table** — per-day token breakdown with estimated spend
- **Tool call analytics** — which tools Claude used most, across all projects
- **Model analytics** — response counts, tokens, cache usage, and estimated cost by model
- **Configurable pricing** — swap between Bedrock and Anthropic API rates via `.env`

## Source support

Current implemented source:

- Claude Code local data in `~/.claude`

Planned future sources:

- Codex
- Cursor

The v2 backend uses normalized events internally so additional sources can be added through adapters without rewriting the dashboard. Cloud sync, accounts, team dashboards, and remote storage are not included in this local-first version.

## Requirements

- Node.js 18+
- Claude Code installed (data lives in `~/.claude`)

## Quick start

No install needed — run directly from GitHub:

```bash
npx github:foyzulkarim/claude-lens
```

Then open [http://localhost:3456](http://localhost:3456). Defaults to `~/.claude` if `CLAUDE_DIR` is not set.

## Local setup

```bash
git clone https://github.com/foyzulkarim/claude-lens.git
cd claude-lens
npm install
cp .env.example .env
```

Edit `.env` and set `CLAUDE_DIR` to your Claude data directory (defaults to `~/.claude`).

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
| `RATE_INPUT`       | `5.0`   | Input token price (USD per 1M)       |
| `RATE_OUTPUT`      | `25.0`  | Output token price (USD per 1M)      |
| `RATE_CACHE_READ`  | `0.5`   | Cache read price (USD per 1M)        |
| `RATE_CACHE_CREATE`| `6.25`  | Cache write price (USD per 1M)       |

Default rates match **Bedrock cross-region inference (ap-southeast-2)**. For Anthropic API rates use `RATE_INPUT=15`, `RATE_OUTPUT=75`, `RATE_CACHE_READ=1.5`, `RATE_CACHE_CREATE=18.75`.

## Local privacy

AI Coding Lens reads local Claude Code logs and serves the dashboard locally. It does not upload data or run a remote collector.
