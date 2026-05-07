# AI Coding Lens v2 Design

Date: 2026-05-07

## Summary

Upgrade `claude-lens` from a Claude Code-only local usage dashboard into a local-first AI coding activity analyzer. The first phase keeps Claude Code as the only implemented data source, but introduces a unified event model, source adapter boundary, richer project/session analysis, and a dedicated multi-agent analysis view.

The goal is to create useful insight immediately without taking on cloud deployment, accounts, database storage, or broad IDE support too early.

## Current Project

The current app is a lightweight Express server with a single static HTML page:

- `server.js` reads `~/.claude` directly.
- `index.html` fetches several `/api/*` endpoints and renders the dashboard with vanilla JavaScript.
- There is no database, build step, authentication, or client framework.
- Current metrics cover summary usage, cache performance, daily costs, tool calls, project activity, prompt history, and top models.

The app already recognizes Claude Code `Agent` tool calls, but only as ordinary tool-call rows. It does not model agent workflows, source adapters, session timelines, or multiple AI coding tools.

## Product Direction

Recommended direction: build a local-first v2 architecture before adding Codex, Cursor, or cloud deployment.

The product positioning is:

> AI Coding Lens: a local-first analyzer for AI coding activity across projects, sessions, models, tools, and agents.

Phase 1 should answer:

- Which projects rely most on AI coding?
- Which sessions are most expensive?
- Which models and tools are used most?
- Where are agent calls happening?
- Do agent-assisted sessions correlate with more tool use or higher cost?
- Can future Claude Code, Codex, and Cursor data map into one model?

## Non-Goals

Phase 1 will not include:

- Cloud storage.
- Login or team workspaces.
- A remote collector.
- Cursor support.
- Full Codex support.
- A database.
- A full React or frontend build migration.
- LLM-generated quality scoring for sessions or agents.
- Guaranteed causal inference about whether an agent caused later tool calls.

## Architecture

Keep the app lightweight, but split responsibilities into clear modules.

### Source Adapter Layer

Adapters read native tool data and emit normalized events.

Phase 1 implements:

- `ClaudeCodeAdapter`

Future adapters:

- `CodexAdapter`
- `CursorAdapter`

Adapters should not compute dashboard metrics. They should only scan source files, parse raw records, and produce normalized event objects.

### Event Model Layer

All sources map into a common event shape:

```js
{
  id: "event-id",
  source: "claude-code",
  type: "tool_call",
  timestamp: "2026-05-07T00:00:00.000Z",
  projectId: "project-id",
  sessionId: "session-id",
  messageId: "message-id",
  payload: {}
}
```

Initial event types:

- `user_message`
- `assistant_message`
- `model_usage`
- `tool_call`
- `agent_call`
- `session_activity`

### Aggregation Layer

Aggregators consume normalized events and compute API-ready summaries:

- overview metrics
- daily costs
- project summaries
- session summaries
- session timelines
- tool summaries
- model summaries
- agent summaries

The current parsing and aggregation code in `server.js` should move into this layer.

### API Layer

Express remains the HTTP layer. It should expose data from aggregators rather than reading `~/.claude` inline.

Candidate endpoints:

- `GET /api/overview`
- `GET /api/projects`
- `GET /api/projects/:projectId`
- `GET /api/sessions`
- `GET /api/sessions/:sessionId`
- `GET /api/tools`
- `GET /api/tools/:toolName`
- `GET /api/agents`
- `GET /api/agents/:agentType`
- `GET /api/models`
- `GET /api/daily-costs`
- `GET /api/sources`

Existing endpoints may be kept temporarily for compatibility while the UI migrates.

### UI Layer

Phase 1 can stay in vanilla HTML/CSS/JavaScript. Avoid a frontend framework until interaction complexity requires it.

Suggested file split:

- `public/index.html`
- `public/styles.css`
- `public/app.js`
- `public/views/overview.js`
- `public/views/projects.js`
- `public/views/sessions.js`
- `public/views/agents.js`
- `public/views/tools.js`
- `public/views/models.js`
- `public/views/settings.js`

## Data Model

### Model Usage Payload

```js
{
  model: "claude-sonnet-4",
  inputTokens: 1000,
  outputTokens: 500,
  cacheReadTokens: 300,
  cacheCreateTokens: 100
}
```

### Tool Call Payload

```js
{
  toolName: "Bash",
  inputSummary: "npm test",
  filePath: null,
  command: "npm test"
}
```

### Agent Call Payload

```js
{
  agentType: "explorer",
  description: "Inspect the codebase for API boundaries",
  parentSessionId: "session-id",
  relatedToolCallId: "tool-call-event-id"
}
```

### Session Summary

```js
{
  sessionId: "session-id",
  source: "claude-code",
  projectId: "project-id",
  startedAt: "2026-05-07T00:00:00.000Z",
  endedAt: "2026-05-07T00:30:00.000Z",
  messages: 12,
  toolCalls: 20,
  agentCalls: 2,
  models: ["claude-sonnet-4"],
  cost: 1.23,
  lastPromptSummary: "Fix failing tests"
}
```

## Page Design

### Overview

Overview keeps the current dashboard role, but adds filters:

- time range: Today, 7D, 30D, All
- source
- project

Cards:

- sessions
- messages
- tool calls
- agent calls
- estimated cost
- cache hit
- top models
- top projects
- recent expensive sessions

### Projects

Project list columns:

- project
- source
- sessions
- messages
- cost
- tool calls
- agent calls
- top model
- cache hit
- last active

Project detail should show:

- daily trend
- session list
- tool breakdown
- agent breakdown
- model breakdown

### Sessions

Session list columns:

- time
- project
- source
- model mix
- messages
- tool calls
- agent calls
- cost
- duration when inferable
- last prompt summary

Session detail should show a chronological timeline:

- user prompts
- assistant message summaries
- model usage
- tool calls
- agent calls
- cost accumulation

### Agents

Agents are a Phase 1 priority.

Top metrics:

- total agent calls
- sessions with agents
- agent-assisted cost
- average tools after agent call
- top agent type

Agent table columns:

- agent type
- calls
- projects
- sessions
- related tool calls
- estimated related cost
- latest use

Agent detail should show:

- projects using this agent type
- common description keywords
- typical tools after the agent call
- related sessions

### Tools

Upgrade current tool-call analytics:

- tool name
- calls
- projects used
- sessions used
- related cost when inferable
- common input summary
- trend

Keep tool detail and export.

### Models

Model table columns:

- model
- responses
- input tokens
- output tokens
- cache read tokens
- cache create tokens
- estimated cost
- projects
- sessions
- average output tokens
- cache hit

### Settings

Local settings only:

- Claude data directory
- pricing preset: Bedrock, Anthropic, Custom
- scan status
- source status

## Multi-Agent Analysis

Claude Code currently records agent usage as `Agent` tool calls. Phase 1 should map each such tool call into an `agent_call` event.

Define an agent segment as:

- the agent call
- the nearest preceding user prompt in the same session
- a bounded window of following tool calls in the same session
- following assistant model usage within the same session
- project, session, date, source, and cost context

This gives useful correlation without pretending to prove causation.

Phase 1 should support these questions:

- Which projects use agents most?
- Which agent types are most common?
- Which sessions include agents?
- What tools commonly appear after agent calls?
- Are agent-assisted sessions more expensive than non-agent sessions?
- Are agent-assisted sessions more tool-heavy?

Phase 1 should not try to:

- reconstruct hidden subagent conversations unless the log reliably contains them
- judge whether the agent succeeded
- infer complex agent graphs
- use LLMs to summarize or score quality

## Error Handling

The app should handle missing or partial Claude data gracefully:

- missing `~/.claude`: show source status error
- missing optional files: return empty collections, not server crashes
- malformed JSONL lines: skip and count parse errors
- unknown tool inputs: preserve a generic summary
- unsupported source: show disabled source status

API responses should include enough metadata for the UI to explain data quality:

```js
{
  data: [],
  meta: {
    source: "claude-code",
    scannedFiles: 10,
    skippedLines: 2,
    errors: []
  }
}
```

## Testing

Phase 1 should add focused tests around parser and aggregator behavior.

Recommended tests:

- Claude JSONL records map to normalized events.
- `Agent` tool calls map to `agent_call` events.
- malformed JSONL lines are skipped.
- daily cost aggregation handles cache tokens.
- project/session summaries deduplicate sessions correctly.
- agent-assisted and non-agent session comparisons work on fixtures.

Use small fixture JSONL files under a test fixtures directory. Avoid tests that require the developer's real `~/.claude` data.

## Rollout Plan

1. Add the new module structure while keeping existing endpoints working.
2. Implement `ClaudeCodeAdapter` and normalized events.
3. Move daily cost, project, tool, and model aggregation onto events.
4. Add session summary and session timeline APIs.
5. Add agent summary and agent detail APIs.
6. Split the frontend into static public modules.
7. Add Overview, Sessions, Agents, Tools, Models, Projects, and Settings views.
8. Keep compatibility endpoints until the new UI is complete.
9. Add tests for adapters and aggregators.

## Future Extensions

### Codex

Add `CodexAdapter` once the v2 event model is stable. The adapter should emit the same events and avoid adding Codex-specific logic to aggregators.

### Cursor

Investigate Cursor's local data availability before committing support. Cursor should only be added if its logs can map reliably into the same source/session/message/tool/model model.

### Cloud

Cloud should come after local insights are proven. A cloud version needs:

- local collector
- upload queue
- data redaction
- account and team model
- project permissions
- remote storage and indexing
- source health reporting

The local-first event model should make cloud sync easier later because the collector can upload normalized, redacted events rather than raw logs.

## Open Decisions

- Whether to keep vanilla JS long term or migrate to React after Phase 1.
- Exact window size for "tools after agent call" analysis.
- Whether to persist normalized events to disk for faster reloads.
- Whether pricing presets should live in `.env`, UI settings, or both.
- How much prompt text should be shown by default for privacy.
