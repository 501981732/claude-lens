const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { readCursorAiTracking } = require("../src/sources/cursor/sqlite");
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

test("readCursorAiTracking reads AI code tracking rows and counts", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-home-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const created = await createCursorFixtureDb(tmp);
  if (created.skipped) return t.skip(created.reason);

  const result = await readCursorAiTracking(created.path);

  assert.equal(result.available, true);
  assert.equal(result.partial, false);
  assert.equal(result.aiCodeHashes.length, 3);
  assert.equal(result.conversationSummaries.length, 1);
  assert.equal(result.deletedFiles.length, 1);
  assert.equal(result.scoredCommits.length, 1);
  assert.equal(result.counts.aiCodeHashCount, 3);
  assert.equal(result.counts.conversationSummaryCount, 1);
  assert.equal(result.counts.deletedFileCount, 1);
  assert.equal(result.counts.scoredCommitCount, 1);
  assert.equal(result.counts.trackedFileContentCount, 0);
  assert.equal(result.aiCodeHashes[0].content, undefined);
});

test("readCursorAiTracking handles missing DB", async () => {
  const result = await readCursorAiTracking("/path/that/does/not/exist/ai-code-tracking.db");

  assert.equal(result.available, false);
  assert.deepEqual(result.aiCodeHashes, []);
  assert.deepEqual(result.conversationSummaries, []);
  assert.deepEqual(result.deletedFiles, []);
  assert.deepEqual(result.scoredCommits, []);
  assert.ok(result.errors.length >= 1);
});

test("readCursorAiTracking returns partial warning data when optional tables are missing", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-partial-home-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const created = await createCursorFixtureDb(tmp);
  if (created.skipped) return t.skip(created.reason);

  await runSqlite(created.path, "DROP TABLE conversation_summaries; DROP TABLE scored_commits;");

  const result = await readCursorAiTracking(created.path);

  assert.equal(result.available, true);
  assert.equal(result.partial, true);
  assert.equal(result.aiCodeHashes.length, 3);
  assert.deepEqual(result.conversationSummaries, []);
  assert.deepEqual(result.scoredCommits, []);
  assert.ok(result.errors.length >= 2);
});
