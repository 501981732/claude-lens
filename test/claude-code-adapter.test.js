const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { EVENT_TYPES } = require("../src/core/events");
const { loadClaudeCodeEvents, readHistory, readStats } = require("../src/sources/claude-code");

const fixtureDir = path.join(__dirname, "fixtures", "claude-home");

test("loadClaudeCodeEvents maps fixture JSONL into normalized events", async () => {
  const { events, meta } = await loadClaudeCodeEvents(fixtureDir);

  assert.equal(meta.source, "claude-code");
  assert.equal(meta.skippedLines, 1);
  assert.equal(meta.scannedFiles, 2);
  assert.ok(events.some((event) => event.type === EVENT_TYPES.USER_MESSAGE));
  assert.ok(events.some((event) => event.type === EVENT_TYPES.ASSISTANT_MESSAGE));
  assert.ok(events.some((event) => event.type === EVENT_TYPES.MODEL_USAGE));
  assert.ok(events.some((event) => event.type === EVENT_TYPES.TOOL_CALL && event.payload.toolName === "Bash"));
  assert.ok(events.some((event) => event.type === EVENT_TYPES.TOOL_CALL && event.payload.toolName === "Read"));
});

test("Agent tool calls also emit agent_call events", async () => {
  const { events } = await loadClaudeCodeEvents(fixtureDir);
  const agentEvent = events.find((event) => event.type === EVENT_TYPES.AGENT_CALL);

  assert.equal(agentEvent.payload.agentType, "explorer");
  assert.match(agentEvent.payload.description, /architecture boundaries/);
  assert.equal(agentEvent.sessionId, "session-1");
  assert.ok(agentEvent.payload.relatedToolCallId);
});

test("history and stats readers tolerate fixture data", () => {
  const history = readHistory(fixtureDir);
  const stats = readStats(fixtureDir);

  assert.equal(history.data.length, 2);
  assert.equal(stats.data.version, 1);
});
