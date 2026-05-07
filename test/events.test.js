const test = require("node:test");
const assert = require("node:assert/strict");

const { EVENT_TYPES, createEvent } = require("../src/core/events");

test("EVENT_TYPES includes the normalized v2 event types", () => {
  assert.deepEqual(Object.values(EVENT_TYPES).sort(), [
    "agent_call",
    "assistant_message",
    "model_usage",
    "session_activity",
    "tool_call",
    "user_message",
  ]);
});

test("createEvent creates deterministic ids", () => {
  const event = createEvent({
    source: "claude-code",
    type: EVENT_TYPES.TOOL_CALL,
    timestamp: "2026-05-07T01:00:00.000Z",
    projectId: "sample-project",
    sessionId: "session-1",
    messageId: "msg-a1",
    index: 2,
    payload: { toolName: "Bash" },
  });

  assert.equal(event.id, "claude-code:tool_call:sample-project:session-1:msg-a1:2");
  assert.equal(event.payload.toolName, "Bash");
});
