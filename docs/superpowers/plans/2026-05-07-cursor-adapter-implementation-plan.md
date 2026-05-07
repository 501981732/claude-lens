# Cursor Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 AI Coding Lens 接入本地 Cursor AI coding tracking 数据源，让 Cursor 成为可过滤、可聚合、可在 Settings 中诊断的 active source。

**Architecture:** 保持现有 CommonJS + Express + 原生前端架构，新增 `src/sources/cursor` adapter，只读 `~/.cursor/ai-tracking/ai-code-tracking.db` 并映射到 `src/core/events.js` 标准事件。第一版不解析 Cursor `state.vscdb` 的 `agentKv:*` blob，不读取 `tracked_file_content.content`，token/cost 明确标记为 unavailable 并保持 0。

**Tech Stack:** Node.js CommonJS、Express 4、Node 内置 `node:test`、本机 `sqlite3` CLI、原生 HTML/CSS/JavaScript、dotenv。

---

## 文件结构

- 修改：`src/config.js`
  - 增加 `cursorDir`、`cursorAiTrackingDb` 配置。
- 修改：`.env.example`
  - 增加 `CURSOR_DIR`、`CURSOR_AI_TRACKING_DB` 示例。
- 新增：`src/sources/cursor/sqlite.js`
  - 只负责只读 Cursor `ai-code-tracking.db`，返回结构化 rows 和 meta。
- 新增：`src/sources/cursor/index.js`
  - 负责把 Cursor rows 映射为标准事件并返回 `{ events, meta }`。
- 修改：`src/api/routes.js`
  - 加载 Cursor source，支持 `source=cursor`，更新 `/api/sources`。
- 修改：`public/app.js`
  - Cursor 已有 label/status 基础；只需确认 active source 下拉可启用 Cursor。
- 修改：`public/views/settings.js`
  - 显示 Cursor directory、AI tracking DB、SQLite 计数和不支持 token 的说明。
- 修改：`README.md`
  - 更新 Source support、配置和 Cursor 限制。
- 新增：`test/helpers/create-cursor-fixture-db.js`
  - 测试运行时创建 Cursor fixture SQLite DB，避免提交二进制 fixture。
- 新增：`test/cursor-sqlite.test.js`
  - 覆盖 Cursor SQLite reader。
- 新增：`test/cursor-adapter.test.js`
  - 覆盖 Cursor event mapping。
- 修改：`test/config.test.js`
  - 覆盖 Cursor config 默认值和 env override。
- 修改：`test/api.test.js`
  - 覆盖 `/api/sources` 和 `source=cursor`。

## Task 1: Cursor 配置与测试 Helper

**Files:**
- Modify: `src/config.js`
- Modify: `.env.example`
- Modify: `test/config.test.js`
- Create: `test/helpers/create-cursor-fixture-db.js`

- [ ] **Step 1: 写失败测试**

在 `test/config.test.js` 追加：

```js
test("getConfig returns default Cursor directory and ai tracking DB", () => {
  const config = getConfig({ HOME: "/tmp/home" });
  assert.equal(config.cursorDir, path.join("/tmp/home", ".cursor"));
  assert.equal(config.cursorAiTrackingDb, path.join("/tmp/home", ".cursor", "ai-tracking", "ai-code-tracking.db"));
});

test("getConfig reads CURSOR_DIR and CURSOR_AI_TRACKING_DB", () => {
  const config = getConfig({
    HOME: "/tmp/home",
    CURSOR_DIR: "/tmp/custom-cursor",
    CURSOR_AI_TRACKING_DB: "/tmp/custom-cursor/custom.db",
  });
  assert.equal(config.cursorDir, "/tmp/custom-cursor");
  assert.equal(config.cursorAiTrackingDb, "/tmp/custom-cursor/custom.db");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- test/config.test.js`

Expected: FAIL，`cursorDir` / `cursorAiTrackingDb` 目前未定义。

- [ ] **Step 3: 实现最小配置**

在 `src/config.js` 的 `getConfig()` 中增加：

```js
const cursorDir = env.CURSOR_DIR || path.join(home, ".cursor");
```

并在返回对象中增加：

```js
cursorDir,
cursorAiTrackingDb: env.CURSOR_AI_TRACKING_DB || path.join(cursorDir, "ai-tracking", "ai-code-tracking.db"),
```

- [ ] **Step 4: 更新 `.env.example`**

追加：

```bash
CURSOR_DIR=/Users/yourname/.cursor
CURSOR_AI_TRACKING_DB=/Users/yourname/.cursor/ai-tracking/ai-code-tracking.db
```

- [ ] **Step 5: 创建 Cursor fixture DB helper**

新增 `test/helpers/create-cursor-fixture-db.js`：

```js
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

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
    child.stdin.end(input);
  });
}

async function sqliteAvailable() {
  try {
    await runSqlite(["--version"], "");
    return true;
  } catch {
    return false;
  }
}

async function createCursorFixtureDb(targetDir) {
  if (!(await sqliteAvailable())) return { skipped: true, reason: "sqlite3 CLI is not available" };

  const dbDir = path.join(targetDir, "ai-tracking");
  await fs.promises.mkdir(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, "ai-code-tracking.db");

  await runSqlite(
    [dbPath],
    `
CREATE TABLE ai_code_hashes (
  hash TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  fileExtension TEXT,
  fileName TEXT,
  requestId TEXT,
  conversationId TEXT,
  timestamp INTEGER,
  createdAt INTEGER NOT NULL,
  model TEXT
);
CREATE TABLE conversation_summaries (
  conversationId TEXT PRIMARY KEY,
  title TEXT,
  tldr TEXT,
  overview TEXT,
  summaryBullets TEXT,
  model TEXT,
  mode TEXT,
  updatedAt INTEGER NOT NULL
);
CREATE TABLE tracked_file_content (
  gitPath TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  conversationId TEXT,
  model TEXT,
  fileExtension TEXT,
  createdAt INTEGER NOT NULL
);
CREATE TABLE ai_deleted_files (
  gitPath TEXT NOT NULL,
  composerId TEXT,
  conversationId TEXT,
  model TEXT,
  deletedAt INTEGER NOT NULL,
  PRIMARY KEY (gitPath, deletedAt)
);
CREATE TABLE scored_commits (
  commitHash TEXT NOT NULL,
  branchName TEXT NOT NULL,
  scoredAt INTEGER NOT NULL,
  linesAdded INTEGER,
  linesDeleted INTEGER,
  tabLinesAdded INTEGER,
  tabLinesDeleted INTEGER,
  composerLinesAdded INTEGER,
  composerLinesDeleted INTEGER,
  humanLinesAdded INTEGER,
  humanLinesDeleted INTEGER,
  blankLinesAdded INTEGER,
  blankLinesDeleted INTEGER,
  commitMessage TEXT,
  commitDate TEXT,
  v1AiPercentage TEXT,
  v2AiPercentage TEXT,
  PRIMARY KEY (commitHash, branchName)
);
INSERT INTO ai_code_hashes VALUES
  ('hash-1','composer','js','src/app.js','request-1','conversation-1',1778064000000,1778064000000,'claude-4.6-sonnet-medium-thinking'),
  ('hash-2','tab','css','public/styles.css','request-2','conversation-1',1778064060000,1778064060000,'gpt-5.5'),
  ('hash-3','human','md','README.md','request-3','conversation-2',1778064120000,1778064120000,NULL);
INSERT INTO conversation_summaries VALUES
  ('conversation-1','Implement dashboard polish','Updated Cursor UI','Small dashboard changes','["Update UI","Run tests"]','claude-4.6-sonnet-medium-thinking','composer',1778064180000);
INSERT INTO ai_deleted_files VALUES
  ('src/old.js','composer-1','conversation-1','claude-4.6-sonnet-medium-thinking',1778064240000);
INSERT INTO scored_commits VALUES
  ('abc123','main',1778064300000,20,5,3,0,12,2,5,3,0,0,'feat: cursor fixture','2026-05-07T00:25:00.000Z','70','75');
`,
  );

  return { path: dbPath };
}

module.exports = { createCursorFixtureDb };
```

- [ ] **Step 6: 运行配置测试**

Run: `npm test -- test/config.test.js`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/config.js .env.example test/config.test.js test/helpers/create-cursor-fixture-db.js
git commit -m "test: add cursor config and fixture helper"
```

## Task 2: Cursor SQLite Reader

**Files:**
- Create: `src/sources/cursor/sqlite.js`
- Create: `test/cursor-sqlite.test.js`

- [ ] **Step 1: 写失败测试**

新增 `test/cursor-sqlite.test.js`：

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- test/cursor-sqlite.test.js`

Expected: FAIL，模块 `../src/sources/cursor/sqlite` 不存在。

- [ ] **Step 3: 实现 SQLite reader**

新增 `src/sources/cursor/sqlite.js`：

```js
const fs = require("node:fs");
const { execFile } = require("node:child_process");

function emptyState(available = false, errors = []) {
  return {
    available,
    partial: false,
    aiCodeHashes: [],
    conversationSummaries: [],
    deletedFiles: [],
    scoredCommits: [],
    counts: {
      aiCodeHashCount: 0,
      conversationSummaryCount: 0,
      deletedFileCount: 0,
      scoredCommitCount: 0,
      trackedFileContentCount: 0,
    },
    errors,
  };
}

function runSqliteJson(dbPath, sql) {
  return new Promise((resolve, reject) => {
    execFile("sqlite3", ["-json", dbPath, sql], (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      try {
        resolve(stdout.trim() ? JSON.parse(stdout) : []);
      } catch (err) {
        err.stderr = stdout;
        reject(err);
      }
    });
  });
}

async function safeQuery(dbPath, sql, errors) {
  try {
    return await runSqliteJson(dbPath, sql);
  } catch (err) {
    errors.push({ file: dbPath, message: err.message });
    return [];
  }
}

async function readCursorAiTracking(dbPath) {
  if (!dbPath || !fs.existsSync(dbPath)) {
    return emptyState(false, [{ file: dbPath, message: "Cursor AI tracking DB not found" }]);
  }

  const errors = [];
  const [aiCodeHashes, conversationSummaries, deletedFiles, scoredCommits, countsRows] = await Promise.all([
    safeQuery(
      dbPath,
      "SELECT hash, source, fileExtension, fileName, requestId, conversationId, timestamp, createdAt, model FROM ai_code_hashes ORDER BY createdAt, hash",
      errors,
    ),
    safeQuery(
      dbPath,
      "SELECT conversationId, title, tldr, overview, summaryBullets, model, mode, updatedAt FROM conversation_summaries ORDER BY updatedAt, conversationId",
      errors,
    ),
    safeQuery(
      dbPath,
      "SELECT gitPath, composerId, conversationId, model, deletedAt FROM ai_deleted_files ORDER BY deletedAt, gitPath",
      errors,
    ),
    safeQuery(
      dbPath,
      "SELECT commitHash, branchName, scoredAt, linesAdded, linesDeleted, tabLinesAdded, tabLinesDeleted, composerLinesAdded, composerLinesDeleted, humanLinesAdded, humanLinesDeleted, blankLinesAdded, blankLinesDeleted, commitMessage, commitDate, v1AiPercentage, v2AiPercentage FROM scored_commits ORDER BY scoredAt, commitHash",
      errors,
    ),
    safeQuery(
      dbPath,
      `SELECT
        COALESCE((SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'tracked_file_content'), 0) AS hasTrackedFileContent`,
      errors,
    ),
  ]);

  const counts = {
    aiCodeHashCount: aiCodeHashes.length,
    conversationSummaryCount: conversationSummaries.length,
    deletedFileCount: deletedFiles.length,
    scoredCommitCount: scoredCommits.length,
    trackedFileContentCount: 0,
  };
  if (countsRows[0]?.hasTrackedFileContent) {
    const trackedCount = await safeQuery(dbPath, "SELECT count(*) AS count FROM tracked_file_content", errors);
    counts.trackedFileContentCount = trackedCount[0]?.count || 0;
  }

  return {
    available: true,
    partial: errors.length > 0,
    aiCodeHashes,
    conversationSummaries,
    deletedFiles,
    scoredCommits,
    counts,
    errors,
  };
}

module.exports = { readCursorAiTracking };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- test/cursor-sqlite.test.js`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/sources/cursor/sqlite.js test/cursor-sqlite.test.js
git commit -m "feat: read cursor ai tracking database"
```

## Task 3: Cursor Event Mapping

**Files:**
- Create: `src/sources/cursor/index.js`
- Create: `test/cursor-adapter.test.js`

- [ ] **Step 1: 写失败测试**

新增 `test/cursor-adapter.test.js`：

```js
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- test/cursor-adapter.test.js`

Expected: FAIL，模块 `../src/sources/cursor` 不存在。

- [ ] **Step 3: 实现 Cursor adapter**

新增 `src/sources/cursor/index.js`：

```js
const path = require("node:path");

const { EVENT_TYPES, createEvent } = require("../../core/events");
const { readCursorAiTracking } = require("./sqlite");

const SOURCE = "cursor";
const SUMMARY_LIMIT = 220;

function truncate(value, limit = SUMMARY_LIMIT) {
  const text = String(value || "");
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function normalizeTimestamp(value) {
  if (!value) return null;
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sessionId(row) {
  return row.conversationId || row.requestId || row.composerId || "cursor-unknown";
}

function baseMeta(cursorDir, aiTrackingDb, status, state = null) {
  return {
    source: SOURCE,
    status,
    cursorDir,
    aiTrackingDb,
    scannedFiles: state && state.available ? 1 : 0,
    skippedLines: 0,
    errors: state ? state.errors : [],
    sqlite: state
      ? {
          available: state.available,
          ...state.counts,
        }
      : {
          available: false,
          aiCodeHashCount: 0,
          conversationSummaryCount: 0,
          deletedFileCount: 0,
          scoredCommitCount: 0,
          trackedFileContentCount: 0,
        },
  };
}

function makeEvent(type, timestamp, projectId, sessionIdValue, messageId, index, payload = {}) {
  return createEvent({
    source: SOURCE,
    type,
    timestamp,
    projectId,
    sessionId: sessionIdValue,
    messageId,
    index,
    payload,
  });
}

function eventsFromAiCodeHash(row, indexBase) {
  if (row.source === "human") return [];
  const timestamp = normalizeTimestamp(row.timestamp || row.createdAt);
  const session = sessionId(row);
  const fileSummary = truncate([row.fileName || "unknown", row.fileExtension || ""].filter(Boolean).join(" "));
  const model = row.model || "";
  const events = [
    makeEvent(EVENT_TYPES.TOOL_CALL, timestamp, "cursor", session, row.requestId || row.hash, indexBase, {
      toolName: row.source || "cursor-ai",
      toolUseId: row.requestId || "",
      inputSummary: fileSummary,
      fileName: row.fileName || "",
      fileExtension: row.fileExtension || "",
      requestId: row.requestId || "",
      conversationId: row.conversationId || "",
      model: model || "unknown",
      cursorKind: "ai_code_hash",
    }),
  ];

  if (model) {
    events.push(makeEvent(EVENT_TYPES.MODEL_USAGE, timestamp, "cursor", session, row.requestId || row.hash, indexBase + 1, {
      model,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreateTokens: 0,
      estimated: false,
      unavailableReason: "cursor_ai_tracking_has_no_token_usage",
    }));
  }

  return events;
}

function eventsFromConversation(row, indexBase) {
  const timestamp = normalizeTimestamp(row.updatedAt);
  const session = sessionId(row);
  const summary = truncate(row.title || row.tldr || row.overview || row.summaryBullets || "");
  return [
    makeEvent(EVENT_TYPES.SESSION_ACTIVITY, timestamp, "cursor", session, row.conversationId, indexBase, {
      kind: "conversation_summary",
      mode: row.mode || "",
      model: row.model || "unknown",
      title: row.title || "",
    }),
    makeEvent(EVENT_TYPES.ASSISTANT_MESSAGE, timestamp, "cursor", session, row.conversationId, indexBase + 1, {
      model: row.model || "unknown",
      textSummary: summary,
    }),
  ];
}

function eventsFromDeletedFile(row, indexBase) {
  const timestamp = normalizeTimestamp(row.deletedAt);
  return [
    makeEvent(EVENT_TYPES.TOOL_CALL, timestamp, "cursor", sessionId(row), row.composerId || row.gitPath, indexBase, {
      toolName: "delete_file",
      toolUseId: row.composerId || "",
      inputSummary: truncate(row.gitPath || ""),
      filePath: row.gitPath || "",
      conversationId: row.conversationId || "",
      model: row.model || "unknown",
      cursorKind: "ai_deleted_file",
    }),
  ];
}

function eventsFromScoredCommit(row, indexBase) {
  const timestamp = normalizeTimestamp(row.scoredAt);
  const session = `commit:${row.commitHash || "unknown"}:${row.branchName || "unknown"}`;
  return [
    makeEvent(EVENT_TYPES.SESSION_ACTIVITY, timestamp, "cursor", session, row.commitHash || session, indexBase, {
      kind: "scored_commit",
      branchName: row.branchName || "",
      linesAdded: row.linesAdded || 0,
      linesDeleted: row.linesDeleted || 0,
      tabLinesAdded: row.tabLinesAdded || 0,
      composerLinesAdded: row.composerLinesAdded || 0,
      humanLinesAdded: row.humanLinesAdded || 0,
      v1AiPercentage: row.v1AiPercentage || "",
      v2AiPercentage: row.v2AiPercentage || "",
    }),
  ];
}

async function loadCursorEvents(cursorDir, options = {}) {
  const aiTrackingDb = options.aiTrackingDb || path.join(cursorDir, "ai-tracking", "ai-code-tracking.db");
  const state = await readCursorAiTracking(aiTrackingDb);
  if (!state.available) {
    return { events: [], meta: baseMeta(cursorDir, aiTrackingDb, "not_configured", state) };
  }

  const events = [];
  state.conversationSummaries.forEach((row, idx) => events.push(...eventsFromConversation(row, idx * 100)));
  state.aiCodeHashes.forEach((row, idx) => events.push(...eventsFromAiCodeHash(row, 10000 + idx * 100)));
  state.deletedFiles.forEach((row, idx) => events.push(...eventsFromDeletedFile(row, 20000 + idx * 100)));
  state.scoredCommits.forEach((row, idx) => events.push(...eventsFromScoredCommit(row, 30000 + idx * 100)));

  return {
    events,
    meta: baseMeta(cursorDir, aiTrackingDb, state.partial ? "warning" : "ok", state),
  };
}

module.exports = { loadCursorEvents };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- test/cursor-adapter.test.js`

Expected: PASS。

- [ ] **Step 5: 运行聚合相关测试**

Run: `npm test -- test/cursor-adapter.test.js test/aggregate.test.js test/events.test.js`

Expected: PASS，且 Cursor 0-token model usage 不影响 cost。

- [ ] **Step 6: 提交**

```bash
git add src/sources/cursor/index.js test/cursor-adapter.test.js
git commit -m "feat: map cursor tracking to events"
```

## Task 4: API 多源集成

**Files:**
- Modify: `src/api/routes.js`
- Modify: `test/api.test.js`

- [ ] **Step 1: 写失败测试**

在 `test/api.test.js` 中：

1. 引入 helper：

```js
const { createCursorFixtureDb } = require("./helpers/create-cursor-fixture-db");
```

2. 扩展默认 `config`：

```js
cursorDir: path.join(__dirname, "fixtures", "cursor-home"),
cursorAiTrackingDb: path.join(__dirname, "fixtures", "cursor-home", "ai-tracking", "ai-code-tracking.db"),
```

3. 新增测试：

```js
test("GET /api/sources reports Cursor as active when fixture DB exists", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claude-lens-cursor-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const created = await createCursorFixtureDb(tmp);
  if (created.skipped) return t.skip(created.reason);

  await withServer(
    async (server) => {
      const response = await request(server, "/api/sources");
      const cursor = response.body.sources.find((source) => source.id === "cursor");
      assert.equal(cursor.enabled, true);
      assert.equal(cursor.status, "ok");
      assert.equal(cursor.cursorDir, tmp);
      assert.equal(cursor.aiTrackingDb, created.path);
    },
    { cursorDir: tmp, cursorAiTrackingDb: created.path },
  );
});

test("GET /api/overview supports source=cursor", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claude-lens-cursor-overview-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const created = await createCursorFixtureDb(tmp);
  if (created.skipped) return t.skip(created.reason);

  await withServer(
    async (server) => {
      const response = await request(server, "/api/overview?source=cursor");
      assert.equal(response.statusCode, 200);
      assert.equal(response.body.data.toolCalls, 3);
      assert.equal(response.body.data.cost, 0);
      assert.equal(response.body.meta.sources.cursor.status, "ok");
    },
    { cursorDir: tmp, cursorAiTrackingDb: created.path },
  );
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- test/api.test.js`

Expected: FAIL，`/api/sources` 仍返回 Cursor planned，`source=cursor` 没有加载事件。

- [ ] **Step 3: 接入 route loader**

在 `src/api/routes.js` 顶部增加：

```js
const { loadCursorEvents } = require("../sources/cursor");
```

在 `createRoutes()` 内增加：

```js
async function loadCursorSource() {
  try {
    return await loadCursorEvents(config.cursorDir, { aiTrackingDb: config.cursorAiTrackingDb });
  } catch (err) {
    return failedSource("cursor", err, { cursorDir: config.cursorDir, aiTrackingDb: config.cursorAiTrackingDb });
  }
}
```

更新 `loadSources()`：

```js
const shouldLoadCursor = loadAllSources || filters.source === "cursor";
if (shouldLoadCursor) loaders.push(loadCursorSource().then((loaded) => ["cursor", loaded]));
```

更新 `sourceMeta`：

```js
sourceMeta: {
  claude: sources["claude-code"],
  codex: sources.codex,
  cursor: sources.cursor,
},
```

- [ ] **Step 4: 更新 `/api/sources`**

替换 hard-coded planned Cursor：

```js
const { claude, codex, cursor } = sourceMeta;
```

Cursor source object：

```js
{
  id: "cursor",
  name: "Cursor",
  enabled: cursor.meta.status === "ok" || cursor.meta.status === "warning",
  cursorDir: config.cursorDir,
  aiTrackingDb: config.cursorAiTrackingDb,
  status: cursor.meta.status,
  meta: cursor.meta,
}
```

- [ ] **Step 5: 运行 API 测试**

Run: `npm test -- test/api.test.js`

Expected: PASS。

- [ ] **Step 6: 运行全量测试**

Run: `npm test`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/api/routes.js test/api.test.js
git commit -m "feat: expose cursor source in api"
```

## Task 5: Settings UI 与文档

**Files:**
- Modify: `public/views/settings.js`
- Modify: `public/app.js`
- Modify: `README.md`

- [ ] **Step 1: 手动检查当前 UI 假设**

Run: `sed -n '1,220p' public/app.js public/views/settings.js`

Expected: `sourceLabels.cursor` 已存在；Settings 只知道 `claudeDir` / `codexDir`，不知道 `cursorDir` / `aiTrackingDb`。

- [ ] **Step 2: 更新 Settings 数据目录显示**

在 `public/views/settings.js` 的 `dataDirectory(source)` 中增加：

```js
if (source.id === "cursor") return source.aiTrackingDb || source.cursorDir || "-";
```

- [ ] **Step 3: 更新 Settings SQLite 计数展示**

当前 Settings 表已有 Codex 导向的 SQLite 列：`Threads`、`Agent Links`、`Dynamic Tools`。改成可同时表达 Codex 和 Cursor 的列，其中 Cursor 的 `Records` 为 `aiCodeHashCount + conversationSummaryCount + deletedFileCount + scoredCommitCount`。

在 `tableMarkup(rows)` 中把表头替换为：

```js
return `<div class="table-scroll"><table><thead><tr><th>Source</th><th>Status</th><th>说明</th><th class="path-cell">Data Directory</th><th class="num">Files</th><th class="num">Skipped Lines</th><th>SQLite</th><th class="num">Records</th><th class="num">Agent Links</th><th class="num">Dynamic Tools</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
```

在 `sourceRow(source)` 中增加：

```js
const records = sqliteRecordCount(source, sqlite);
```

把第 8 列改为：

```js
<td class="num">${records == null ? "-" : fmt(records)}</td>
```

新增 helper：

```js
function sqliteRecordCount(source, sqlite) {
  if (!sqlite) return null;
  if (source.id === "cursor") {
    return (sqlite.aiCodeHashCount || 0) +
      (sqlite.conversationSummaryCount || 0) +
      (sqlite.deletedFileCount || 0) +
      (sqlite.scoredCommitCount || 0);
  }
  return sqlite.threadCount ?? null;
}
```

保留 Codex 的 `spawnEdgeCount`、`dynamicToolCount` 展示；Cursor 这两列自然显示 `-`。

- [ ] **Step 4: 更新 Settings source 描述**

在 `sourceDescription(source)` 中，对 Cursor 的 0-token 限制给出一句静态说明：

```js
if (source.id === "cursor" && source.enabled) return "Available; token usage is not provided by Cursor tracking DB";
```

- [ ] **Step 5: 如 `public/app.js` 已无需变更则不要改**

检查 `sourceLabels`、`sourceStatusLabels`、`populateSources()`。如果 Cursor source 已能按 `/api/sources` 的 `enabled` 状态启用，不做无意义修改。

- [ ] **Step 6: 更新 README**

在 `README.md` 的 Source support 中把 Cursor 移入 implemented：

```md
Implemented sources:

- Claude Code local data in `~/.claude`
- Codex local data in `~/.codex`
- Cursor local AI tracking data in `~/.cursor/ai-tracking/ai-code-tracking.db`
```

在 Configuration 表增加：

```md
| `CURSOR_DIR` | `~/.cursor` | Path to Cursor local data directory |
| `CURSOR_AI_TRACKING_DB` | `~/.cursor/ai-tracking/ai-code-tracking.db` | Path to Cursor AI tracking SQLite database |
```

增加 Cursor limitations：

```md
## Cursor limitations

- Cursor support reads only `~/.cursor/ai-tracking/ai-code-tracking.db`.
- Token usage and cost are unavailable because this database does not include token counts; model rows are counted with zero cost.
- `tracked_file_content.content` and Cursor `state.vscdb` `agentKv:*` blobs are not read in this local-first version.
- Human rows from `ai_code_hashes.source = "human"` are ignored for AI activity counts.
```

- [ ] **Step 7: 运行测试**

Run: `npm test`

Expected: PASS。

- [ ] **Step 8: 本地启动检查**

Run: `PORT=3456 npm start`

Expected: server logs app URL or keeps running without startup error.

Open: `http://localhost:3456`

Expected:
- Source 下拉显示 Cursor，且如果本机 DB 存在则可选。
- Settings 显示 Cursor `aiTrackingDb` 和 SQLite counts。
- 选择 `Cursor` 后 Overview / Tools / Models 不报错。

- [ ] **Step 9: 提交**

```bash
git add public/views/settings.js public/app.js README.md
git commit -m "docs: document cursor source support"
```

## Task 6: 最终验证与风险检查

**Files:**
- No code changes expected.

- [ ] **Step 1: 检查工作区**

Run: `git status --short`

Expected: 只有本任务相关改动；不要回退用户已有的 `package-lock.json` 改动。

- [ ] **Step 2: 全量测试**

Run: `npm test`

Expected: PASS。

- [ ] **Step 3: API smoke test**

Run:

```bash
PORT=3456 npm start
```

另开终端执行：

```bash
curl -s "http://localhost:3456/api/sources" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const data=JSON.parse(s); console.log(data.sources.map(x=>`${x.id}:${x.status}:${x.enabled}`).join("\n"));})'
curl -s "http://localhost:3456/api/overview?source=cursor" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const data=JSON.parse(s); console.log(JSON.stringify(data.data, null, 2));})'
```

Expected:

```text
cursor:ok:true
```

或者当本机没有 Cursor DB 时：

```text
cursor:not_configured:false
```

但无论哪种情况，API 都返回 200。

- [ ] **Step 4: 隐私检查**

Run:

```bash
rg "tracked_file_content|agentKv|content" src/sources/cursor test/cursor-*.test.js README.md
```

Expected:
- `src/sources/cursor/sqlite.js` 不查询 `tracked_file_content.content`。
- README 明确说明不读取 `tracked_file_content.content` 和 `agentKv:*`。

- [ ] **Step 5: 最终提交状态**

Run: `git log --oneline -5`

Expected: 能看到 Cursor adapter 相关聚焦提交。
