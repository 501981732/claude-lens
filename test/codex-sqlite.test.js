const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { createCodexFixtureDb } = require("./helpers/create-codex-fixture-db");
const { readCodexState } = require("../src/sources/codex/sqlite");

function runSqlite(sqlitePath, sql) {
  return new Promise((resolve, reject) => {
    const child = execFile("sqlite3", [sqlitePath], (error) => {
      if (error) reject(error);
      else resolve();
    });
    child.stdin.end(sql);
  });
}

test("readCodexState reads threads, spawn edges, and dynamic tools", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-state-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const created = await createCodexFixtureDb(tmp);
  if (created && created.skipped) return t.skip(created.reason);

  const result = await readCodexState(path.join(tmp, "state_5.sqlite"));

  assert.equal(result.available, true);
  assert.equal(result.threads instanceof Map, true);
  assert.equal(result.threads.size, 2);
  assert.equal(result.spawnEdges.length, 1);
  assert.equal(result.spawnEdges[0].parent_thread_id, "codex-parent-session");
  assert.equal(result.spawnEdges[0].child_thread_id, "codex-child-session");
  assert.equal(result.dynamicTools.length, 1);
  assert.equal(result.dynamicTools[0].name, "exec_command");
  assert.equal(result.threads.get("codex-child-session").agent_role, "explorer");
});

test("readCodexState handles missing sqlite file", async () => {
  const result = await readCodexState("/path/that/does/not/exist/state_5.sqlite");
  assert.equal(result.available, false);
  assert.equal(result.threads.size, 0);
  assert.deepEqual(result.spawnEdges, []);
  assert.deepEqual(result.dynamicTools, []);
});

test("readCodexState avoids loading large text columns", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-state-large-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const created = await createCodexFixtureDb(tmp);
  if (created && created.skipped) return t.skip(created.reason);

  const sqlitePath = path.join(tmp, "state_5.sqlite");
  const largeSchema = "x".repeat(2 * 1024 * 1024);
  await runSqlite(
    sqlitePath,
    `ALTER TABLE threads ADD COLUMN first_user_message TEXT;
     UPDATE threads SET first_user_message = '${largeSchema}';
     UPDATE thread_dynamic_tools SET description = '${largeSchema}', input_schema = '${largeSchema}';`,
  );

  const result = await readCodexState(sqlitePath);

  assert.equal(result.available, true);
  assert.equal(result.threads.get("codex-parent-session").first_user_message, undefined);
  assert.equal(result.dynamicTools.length, 1);
  assert.equal(result.dynamicTools[0].name, "exec_command");
  assert.equal(result.dynamicTools[0].input_schema, undefined);
  assert.equal(result.dynamicTools[0].description, undefined);
});
