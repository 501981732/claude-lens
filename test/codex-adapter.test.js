const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { loadCodexEvents } = require("../src/sources/codex");
const { createCodexFixtureDb } = require("./helpers/create-codex-fixture-db");

const fixtureCodexHome = path.join(__dirname, "fixtures", "codex-home");
const parentFixture = path.join(
  fixtureCodexHome,
  "sessions/2026/05/07/rollout-2026-05-07T00-00-00-test-parent.jsonl",
);

function runSqlite(args, input) {
  return new Promise((resolve, reject) => {
    const child = execFile("sqlite3", args, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
    if (input) child.stdin.end(input);
  });
}

async function copyCodexFixtureHome() {
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "codex-home-"));
  await Promise.all([
    fs.promises.copyFile(path.join(fixtureCodexHome, "history.jsonl"), path.join(tmp, "history.jsonl")),
    fs.promises.copyFile(path.join(fixtureCodexHome, "session_index.jsonl"), path.join(tmp, "session_index.jsonl")),
    fs.promises.cp(path.join(fixtureCodexHome, "sessions"), path.join(tmp, "sessions"), { recursive: true }),
  ]);
  return tmp;
}

test("loadCodexEvents merges SQLite thread metadata with JSONL session events", async (t) => {
  const tmp = await copyCodexFixtureHome();
  const sqlite = await createCodexFixtureDb(tmp);
  if (sqlite.skipped) return t.skip(sqlite.reason);

  const result = await loadCodexEvents(tmp, { includeArchived: false });

  assert.equal(result.meta.source, "codex");
  assert.equal(result.meta.status, "ok");
  assert.equal(result.meta.sqlite.available, true);
  assert.ok(result.meta.scannedFiles >= 2);
  assert.equal(result.meta.skippedLines, 1);
  assert.ok(result.events.some((event) => event.source === "codex"));

  assert.ok(result.events.some((event) => event.type === "agent_call"));
  const agent = result.events.find((event) => event.type === "agent_call");
  assert.equal(agent.sessionId, "codex-parent-session");
  assert.equal(agent.payload.agentType, "explorer");
  assert.equal(agent.payload.agentName, "Scout");
  assert.equal(agent.payload.parentSessionId, "codex-parent-session");
  assert.equal(agent.payload.childSessionId, "codex-child-session");
  assert.equal(agent.payload.status, "completed");
});

test("loadCodexEvents warns instead of rejecting when sessions path is not a directory", async () => {
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "codex-file-sessions-"));
  await fs.promises.writeFile(path.join(tmp, "sessions"), "not a directory");

  const result = await loadCodexEvents(tmp, { includeArchived: false });

  assert.equal(result.meta.status, "warning");
  assert.ok(result.meta.errors.length >= 1);
  assert.deepEqual(result.events, []);
});

test("loadCodexEvents dedupes sessions when SQLite rollout_path and fallback scanning overlap", async (t) => {
  const tmp = await copyCodexFixtureHome();
  const sqlite = await createCodexFixtureDb(tmp);
  if (sqlite.skipped) return t.skip(sqlite.reason);

  const rolloutCopy = path.join(tmp, "rollouts", "parent-copy.jsonl");
  await fs.promises.mkdir(path.dirname(rolloutCopy), { recursive: true });
  await fs.promises.copyFile(parentFixture, rolloutCopy);
  await runSqlite([sqlite.path], `
UPDATE threads
SET rollout_path = 'rollouts/parent-copy.jsonl'
WHERE id = 'codex-parent-session';
`);

  const result = await loadCodexEvents(tmp, { includeArchived: false });
  const parentUserMessages = result.events.filter(
    (event) => event.sessionId === "codex-parent-session" && event.type === "user_message",
  );

  assert.equal(parentUserMessages.length, 1);
  assert.equal(result.meta.duplicateSessionCount, 1);
});

test("loadCodexEvents falls back to scanning sessions when SQLite is unavailable", async () => {
  const result = await loadCodexEvents(fixtureCodexHome, { includeArchived: false });

  assert.equal(result.meta.sqlite.available, false);
  assert.ok(result.events.some((event) => event.type === "tool_call"));
  assert.ok(result.meta.scannedFiles >= 2);
  assert.deepEqual(result.meta.sessionIndex, { count: 2 });
  assert.deepEqual(result.meta.history, { count: 1 });
  assert.equal(result.meta.sessionTitles, undefined);
});

test("loadCodexEvents returns not_configured for a missing codexDir", async () => {
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "missing-codex-home-"));

  const result = await loadCodexEvents(path.join(tmp, "missing"), { includeArchived: false });

  assert.deepEqual(result.events, []);
  assert.equal(result.meta.status, "not_configured");
  assert.equal(result.meta.scannedFiles, 0);
});
