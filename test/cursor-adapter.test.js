const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { EVENT_TYPES } = require("../src/core/events");
const { loadCursorEvents } = require("../src/sources/cursor");
const { createCursorFixtureDb } = require("./helpers/create-cursor-fixture-db");

function runSqlite(sqlitePath, sql) {
  return new Promise((resolve, reject) => {
    const child = execFile("sqlite3", [sqlitePath], (error) => {
      if (error) reject(error);
      else resolve();
    });
    child.stdin.end(sql);
  });
}

test("loadCursorEvents maps Cursor AI tracking rows to standard events", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-home-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const created = await createCursorFixtureDb(tmp);
  if (created.skipped) return t.skip(created.reason);

  const result = await loadCursorEvents(tmp, { aiTrackingDb: created.path });

  assert.equal(result.meta.source, "cursor");
  assert.equal(result.meta.status, "ok");
  assert.equal(result.meta.scannedFiles, 1);
  assert.equal(result.meta.sqlite.aiCodeHashCount, 3);

  const toolCalls = result.events.filter((event) => event.type === EVENT_TYPES.TOOL_CALL);
  assert.equal(toolCalls.filter((event) => event.payload.cursorKind === "ai_code_hash").length, 2);
  assert.equal(toolCalls.filter((event) => event.payload.cursorKind === "ai_deleted_file").length, 1);
  assert.ok(toolCalls.every((event) => event.source === "cursor"));
  assert.ok(toolCalls.some((event) => event.payload.toolName === "composer"));
  assert.ok(toolCalls.some((event) => event.payload.toolName === "tab"));
  assert.ok(!toolCalls.some((event) => event.payload.toolName === "human"));

  const modelUsage = result.events.filter((event) => event.type === EVENT_TYPES.MODEL_USAGE);
  assert.equal(modelUsage.length, 2);
  assert.equal(modelUsage[0].payload.inputTokens, 0);
  assert.equal(modelUsage[0].payload.unavailableReason, "cursor_ai_tracking_has_no_token_usage");

  assert.ok(result.events.some((event) => event.type === EVENT_TYPES.ASSISTANT_MESSAGE));
  assert.ok(result.events.some((event) => event.type === EVENT_TYPES.SESSION_ACTIVITY));
});

test("loadCursorEvents does not generate model usage for non-human rows without model", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-null-model-home-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const created = await createCursorFixtureDb(tmp);
  if (created.skipped) return t.skip(created.reason);

  await runSqlite(
    created.path,
    "INSERT INTO ai_code_hashes VALUES ('hash-4','composer','ts','src/no-model.ts','request-4','conversation-1',1778064320000,1778064320000,NULL);",
  );

  const result = await loadCursorEvents(tmp, { aiTrackingDb: created.path });
  const toolCalls = result.events.filter((event) => event.type === EVENT_TYPES.TOOL_CALL && event.payload.requestId === "request-4");
  const modelUsage = result.events.filter((event) => event.type === EVENT_TYPES.MODEL_USAGE && event.messageId === "request-4");

  assert.equal(toolCalls.length, 1);
  assert.equal(modelUsage.length, 0);
});

test("loadCursorEvents keeps readable events when Cursor DB has partial schema", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-partial-adapter-home-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const created = await createCursorFixtureDb(tmp);
  if (created.skipped) return t.skip(created.reason);

  await runSqlite(created.path, "DROP TABLE conversation_summaries;");

  const result = await loadCursorEvents(tmp, { aiTrackingDb: created.path });

  assert.equal(result.meta.status, "warning");
  assert.ok(result.events.some((event) => event.type === EVENT_TYPES.TOOL_CALL));
  assert.ok(result.meta.errors.length >= 1);
});

test("loadCursorEvents returns not_configured for missing DB", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "missing-cursor-home-"));
  const result = await loadCursorEvents(tmp, { aiTrackingDb: path.join(tmp, "missing.db") });

  assert.deepEqual(result.events, []);
  assert.equal(result.meta.status, "not_configured");
  assert.equal(result.meta.scannedFiles, 0);
});
