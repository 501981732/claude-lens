const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { loadCodexEvents } = require("../src/sources/codex");
const { createCodexFixtureDb } = require("./helpers/create-codex-fixture-db");

const fixtureCodexHome = path.join(__dirname, "fixtures", "codex-home");

async function copyCodexFixtureHome() {
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "codex-home-"));
  await Promise.all([
    fs.promises.copyFile(path.join(fixtureCodexHome, "history.jsonl"), path.join(tmp, "history.jsonl")),
    fs.promises.copyFile(path.join(fixtureCodexHome, "session_index.jsonl"), path.join(tmp, "session_index.jsonl")),
    fs.promises.cp(path.join(fixtureCodexHome, "sessions"), path.join(tmp, "sessions"), { recursive: true }),
  ]);
  return tmp;
}

test("loadCodexEvents merges SQLite thread metadata with JSONL session events", async () => {
  const tmp = await copyCodexFixtureHome();
  const sqlite = await createCodexFixtureDb(tmp);

  const result = await loadCodexEvents(tmp, { includeArchived: false });

  assert.equal(result.meta.source, "codex");
  assert.equal(result.meta.status, "ok");
  if (!sqlite.skipped) {
    assert.equal(result.meta.sqlite.available, true);
  }
  assert.ok(result.meta.scannedFiles >= 2);
  assert.equal(result.meta.skippedLines, 1);
  assert.ok(result.events.some((event) => event.source === "codex"));

  if (!sqlite.skipped) {
    assert.ok(result.events.some((event) => event.type === "agent_call"));
    const agent = result.events.find((event) => event.type === "agent_call");
    assert.equal(agent.sessionId, "codex-parent-session");
    assert.equal(agent.payload.agentType, "explorer");
    assert.equal(agent.payload.agentName, "Scout");
    assert.equal(agent.payload.parentSessionId, "codex-parent-session");
    assert.equal(agent.payload.childSessionId, "codex-child-session");
    assert.equal(agent.payload.status, "completed");
  }
});

test("loadCodexEvents falls back to scanning sessions when SQLite is unavailable", async () => {
  const result = await loadCodexEvents(fixtureCodexHome, { includeArchived: false });

  assert.equal(result.meta.sqlite.available, false);
  assert.ok(result.events.some((event) => event.type === "tool_call"));
  assert.ok(result.meta.scannedFiles >= 2);
});

test("loadCodexEvents returns not_configured for a missing codexDir", async () => {
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "missing-codex-home-"));

  const result = await loadCodexEvents(path.join(tmp, "missing"), { includeArchived: false });

  assert.deepEqual(result.events, []);
  assert.equal(result.meta.status, "not_configured");
  assert.equal(result.meta.scannedFiles, 0);
});
