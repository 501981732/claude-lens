const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");

const { EVENT_TYPES } = require("../src/core/events");
const { parseCodexSessionFile } = require("../src/sources/codex/jsonl");

const fixture = path.join(
  __dirname,
  "fixtures/codex-home/sessions/2026/05/07/rollout-2026-05-07T00-00-00-test-parent.jsonl",
);

const childFixture = path.join(
  __dirname,
  "fixtures/codex-home/sessions/2026/05/07/rollout-2026-05-07T00-05-00-test-child.jsonl",
);

test("parseCodexSessionFile emits normalized message, tool, and usage events", async () => {
  const result = await parseCodexSessionFile(fixture, {
    thread: {
      id: "codex-parent-session",
      cwd: "/workspace/sample-project",
      model: "gpt-5.3-codex",
      model_provider: "openai",
      title: "Codex parent fixture",
    },
  });

  assert.equal(result.meta.skippedLines, 1);
  assert.ok(result.events.some((event) => event.type === EVENT_TYPES.USER_MESSAGE));
  assert.ok(result.events.some((event) => event.type === EVENT_TYPES.ASSISTANT_MESSAGE));

  const usage = result.events.find((event) => event.type === EVENT_TYPES.MODEL_USAGE);
  assert.equal(usage.payload.inputTokens, 800);
  assert.equal(usage.payload.cacheReadTokens, 200);
  assert.equal(usage.payload.outputTokens, 350);
  assert.equal(usage.payload.reasoningOutputTokens, 50);

  const tool = result.events.find((event) => event.type === EVENT_TYPES.TOOL_CALL);
  assert.equal(tool.payload.toolName, "exec_command");
  assert.equal(tool.payload.command, "rg --files");
  assert.equal(tool.payload.exitCode, 0);
});

test("parseCodexSessionFile emits custom tool and agent message events", async () => {
  const result = await parseCodexSessionFile(childFixture, {
    thread: { id: "codex-child-session", cwd: "/workspace/sample-project" },
  });

  const tool = result.events.find((event) => event.type === EVENT_TYPES.TOOL_CALL);
  assert.equal(tool.payload.toolName, "apply_patch");
  assert.equal(tool.sessionId, "codex-child-session");

  const assistant = result.events.find((event) => event.type === EVENT_TYPES.ASSISTANT_MESSAGE);
  assert.equal(assistant.payload.agent, true);
});
