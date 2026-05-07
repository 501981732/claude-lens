const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createCodexFixtureDb } = require("./helpers/create-codex-fixture-db");
const { readCodexState } = require("../src/sources/codex/sqlite");

test("readCodexState reads threads, spawn edges, and dynamic tools", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-state-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const created = await createCodexFixtureDb(tmp);
  if (created && created.skipped) t.skip(created.reason);

  const result = await readCodexState(path.join(tmp, "state_5.sqlite"));

  assert.equal(result.available, true);
  assert.equal(result.threads.size, 2);
  assert.equal(result.spawnEdges.length, 1);
  assert.equal(result.dynamicTools.length, 1);
  assert.equal(result.threads.get("codex-child-session").agent_role, "explorer");
});

test("readCodexState handles missing sqlite file", async () => {
  const result = await readCodexState("/path/that/does/not/exist/state_5.sqlite");
  assert.equal(result.available, false);
  assert.equal(result.threads.size, 0);
  assert.deepEqual(result.spawnEdges, []);
  assert.deepEqual(result.dynamicTools, []);
});
