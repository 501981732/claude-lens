# Codex Adapter Implementation Plan

> **给 agentic workers 的要求：** 实施本计划时必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，并按 checkbox (`- [ ]`) 步骤逐项推进。

**目标：** 为 AI Coding Lens v2 增加本地 Codex 数据源，让 Codex 从 `Planned` 变成可读取、可过滤、可聚合的 active source。

**架构：** 保持现有 Express + CommonJS + 原生前端架构。新增 Codex adapter，读取 `~/.codex/state_5.sqlite` 和 `~/.codex/sessions/**/*.jsonl`，映射为当前标准事件模型，再让 API routes 合并 Claude Code 与 Codex 事件。SQLite 只读；缺失或不可读时回退到 JSONL 扫描。

**技术栈：** Node.js CommonJS、Express 4、dotenv、原生 HTML/CSS/JavaScript、Node 内置 `node:test`、Node 子进程调用本机 `sqlite3` CLI（若测试环境无 CLI，则测试 helper 应跳过 SQLite reader 的集成断言，但 adapter JSONL fallback 仍必须通过）。

---

## 文件结构

- 修改：`src/config.js`
  - 增加 `codexDir`、`codexIncludeArchived` 配置。
- 修改：`.env.example`
  - 增加 `CODEX_DIR`、`CODEX_INCLUDE_ARCHIVED` 示例。
- 新增：`src/sources/codex/sqlite.js`
  - 只负责读取 `state_5.sqlite` 的 `threads`、`thread_spawn_edges`、`thread_dynamic_tools`。
- 新增：`src/sources/codex/jsonl.js`
  - 只负责解析 Codex session JSONL 并生成标准事件。
- 新增：`src/sources/codex/index.js`
  - 负责合并 SQLite 元信息、JSONL 事件、history/session_index 补充信息，并返回 `{ events, meta }`。
- 修改：`src/api/routes.js`
  - 同时加载 Claude Code 与 Codex 事件，更新 `/api/sources` 状态。
- 修改：`public/app.js`
  - Source filter 改为由 `/api/sources` 的 active/planned 状态驱动。
- 修改：`public/views/settings.js`
  - 展示 Codex directory、source status、scan metadata。
- 新增：`test/fixtures/codex-home/history.jsonl`
- 新增：`test/fixtures/codex-home/session_index.jsonl`
- 新增：`test/fixtures/codex-home/sessions/2026/05/07/rollout-2026-05-07T00-00-00-test-parent.jsonl`
- 新增：`test/fixtures/codex-home/sessions/2026/05/07/rollout-2026-05-07T00-05-00-test-child.jsonl`
- 新增：`test/helpers/create-codex-fixture-db.js`
  - 测试运行时创建临时 `state_5.sqlite`，避免提交二进制 fixture。
- 新增：`test/config.test.js`
- 新增：`test/codex-sqlite.test.js`
- 新增：`test/codex-jsonl.test.js`
- 新增：`test/codex-adapter.test.js`
- 修改：`test/api.test.js`
  - 增加 multi-source API 断言。
- 修改：`README.md`
  - 更新 Codex Phase 2 本地数据源说明和限制。

## Task 1：配置与 Codex Fixture 基础

**文件：**

- 修改：`src/config.js`
- 修改：`.env.example`
- 新增：`test/config.test.js`
- 新增：`test/fixtures/codex-home/history.jsonl`
- 新增：`test/fixtures/codex-home/session_index.jsonl`
- 新增：`test/fixtures/codex-home/sessions/2026/05/07/rollout-2026-05-07T00-00-00-test-parent.jsonl`
- 新增：`test/fixtures/codex-home/sessions/2026/05/07/rollout-2026-05-07T00-05-00-test-child.jsonl`

步骤：

- [ ] **Step 1：写失败测试**

在 `test/config.test.js` 中添加：

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { getConfig } = require("../src/config");

test("getConfig returns default Codex directory and archived flag", () => {
  const config = getConfig({ HOME: "/tmp/home" });
  assert.equal(config.codexDir, path.join("/tmp/home", ".codex"));
  assert.equal(config.codexIncludeArchived, false);
});

test("getConfig reads CODEX_DIR and CODEX_INCLUDE_ARCHIVED", () => {
  const config = getConfig({
    HOME: "/tmp/home",
    CODEX_DIR: "/tmp/custom-codex",
    CODEX_INCLUDE_ARCHIVED: "true",
  });
  assert.equal(config.codexDir, "/tmp/custom-codex");
  assert.equal(config.codexIncludeArchived, true);
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `npm test -- test/config.test.js`

Expected: FAIL，原因是 `config.codexDir` / `config.codexIncludeArchived` 未定义。

- [ ] **Step 3：添加 Codex fixture JSONL**

`test/fixtures/codex-home/history.jsonl`：

```jsonl
{"session_id":"codex-parent-session","ts":1778083200000,"text":"分析这个项目并派发一个子 agent"}
```

`test/fixtures/codex-home/session_index.jsonl`：

```jsonl
{"id":"codex-parent-session","thread_name":"Codex parent fixture","updated_at":"2026-05-07T00:10:00.000Z"}
{"id":"codex-child-session","thread_name":"Codex child fixture","updated_at":"2026-05-07T00:12:00.000Z"}
```

`test/fixtures/codex-home/sessions/2026/05/07/rollout-2026-05-07T00-00-00-test-parent.jsonl` 至少包含：

```jsonl
{"timestamp":"2026-05-07T00:00:00.000Z","type":"session_meta","payload":{"id":"codex-parent-session","cwd":"/workspace/sample-project","cli_version":"0.1.0","model_provider":"openai","git":{"branch":"main","commit":"abc123"}}}
{"timestamp":"2026-05-07T00:01:00.000Z","type":"turn_context","payload":{"cwd":"/workspace/sample-project","model":"gpt-5.3-codex","effort":"medium"}}
{"timestamp":"2026-05-07T00:02:00.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"请检查项目结构"}]}}
{"timestamp":"2026-05-07T00:03:00.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"我会先读取文件结构。"}]}}
{"timestamp":"2026-05-07T00:04:00.000Z","type":"response_item","payload":{"type":"function_call","name":"exec_command","call_id":"call-1","arguments":"{\"cmd\":\"rg --files\",\"workdir\":\"/workspace/sample-project\"}"}}
{"timestamp":"2026-05-07T00:04:01.000Z","type":"event_msg","payload":{"type":"exec_command_end","call_id":"call-1","exit_code":0,"duration_ms":120,"cwd":"/workspace/sample-project","cmd":"rg --files"}}
{"timestamp":"2026-05-07T00:04:02.000Z","type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":1000,"cached_input_tokens":200,"output_tokens":300,"reasoning_output_tokens":50,"total_tokens":1350},"total_token_usage":{"input_tokens":5000,"cached_input_tokens":900,"output_tokens":1200,"reasoning_output_tokens":300,"total_tokens":7400}}}}
not-json
```

`test/fixtures/codex-home/sessions/2026/05/07/rollout-2026-05-07T00-05-00-test-child.jsonl` 至少包含：

```jsonl
{"timestamp":"2026-05-07T00:05:00.000Z","type":"session_meta","payload":{"id":"codex-child-session","cwd":"/workspace/sample-project","model_provider":"openai"}}
{"timestamp":"2026-05-07T00:06:00.000Z","type":"response_item","payload":{"type":"agent_message","content":[{"type":"output_text","text":"子 agent 已完成探索。"}]}}
{"timestamp":"2026-05-07T00:07:00.000Z","type":"response_item","payload":{"type":"custom_tool_call","name":"apply_patch","call_id":"call-2","input":"*** Begin Patch"}}
```

- [ ] **Step 4：实现最小配置**

在 `src/config.js` 中增加：

```js
codexDir: env.CODEX_DIR || path.join(home, ".codex"),
codexIncludeArchived: env.CODEX_INCLUDE_ARCHIVED === "true",
```

在 `.env.example` 中增加：

```bash
CODEX_DIR=/Users/yourname/.codex
CODEX_INCLUDE_ARCHIVED=false
```

- [ ] **Step 5：运行测试确认通过**

Run: `npm test -- test/config.test.js`

Expected: PASS。

- [ ] **Step 6：运行全量测试**

Run: `npm test`

Expected: 全部 PASS。

- [ ] **Step 7：提交**

```bash
git add src/config.js .env.example test/config.test.js test/fixtures/codex-home
git commit -m "test: add codex fixtures and config"
```

## Task 2：实现 Codex SQLite Reader

**文件：**

- 新增：`src/sources/codex/sqlite.js`
- 新增：`test/helpers/create-codex-fixture-db.js`
- 新增：`test/codex-sqlite.test.js`

步骤：

- [ ] **Step 1：写 fixture DB helper**

`test/helpers/create-codex-fixture-db.js` 导出 `createCodexFixtureDb(targetDir)`，使用 `node:child_process` 调用 `sqlite3` 创建最小表：

```sql
CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  rollout_path TEXT,
  created_at_ms INTEGER,
  updated_at_ms INTEGER,
  source TEXT,
  model_provider TEXT,
  cwd TEXT,
  title TEXT,
  tokens_used INTEGER,
  model TEXT,
  reasoning_effort TEXT,
  agent_nickname TEXT,
  agent_role TEXT,
  agent_path TEXT,
  git_branch TEXT,
  git_sha TEXT,
  git_origin_url TEXT
);
CREATE TABLE thread_spawn_edges (
  parent_thread_id TEXT,
  child_thread_id TEXT,
  status TEXT
);
CREATE TABLE thread_dynamic_tools (
  thread_id TEXT,
  position INTEGER,
  name TEXT,
  description TEXT,
  input_schema TEXT,
  namespace TEXT,
  defer_loading INTEGER
);
```

插入两条 thread：

- parent：`codex-parent-session`
- child：`codex-child-session`，`agent_role = "explorer"`，`agent_nickname = "Scout"`

- [ ] **Step 2：写失败测试**

在 `test/codex-sqlite.test.js` 中断言：

```js
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
  await createCodexFixtureDb(tmp);

  const result = await readCodexState(path.join(tmp, "state_5.sqlite"));

  assert.equal(result.available, true);
  assert.equal(result.threads.size, 2);
  assert.equal(result.spawnEdges.length, 1);
  assert.equal(result.dynamicTools.length, 1);
  assert.equal(result.threads.get("codex-child-session").agent_role, "explorer");
});
```

- [ ] **Step 3：运行测试确认失败**

Run: `npm test -- test/codex-sqlite.test.js`

Expected: FAIL，原因是 `src/sources/codex/sqlite.js` 不存在。

- [ ] **Step 4：实现 SQLite reader**

实现导出函数：

```js
async function readCodexState(sqlitePath) {
  if (!fs.existsSync(sqlitePath)) {
    return { available: false, threads: new Map(), spawnEdges: [], dynamicTools: [], errors: [] };
  }
  // 使用 sqlite3 CLI 的 -json 输出分别查询三张表。
}
```

要求：

- 查询失败不抛出到 routes；返回 `available: false` 或在 `errors` 中记录 message。
- `threads` 返回 `Map<threadId, threadRow>`。
- `spawnEdges` 和 `dynamicTools` 返回数组。
- 不读取 `logs_2.sqlite`。

- [ ] **Step 5：处理无 sqlite3 CLI 的测试环境**

如果 helper 检测不到 `sqlite3` CLI：

- `createCodexFixtureDb` 返回 `{ skipped: true, reason }`。
- `test/codex-sqlite.test.js` 使用 `t.skip(reason)` 跳过 SQLite reader 集成测试。
- JSONL fallback 测试仍必须运行，不能因为缺少 SQLite 而跳过 adapter。

- [ ] **Step 6：运行测试确认通过**

Run: `npm test -- test/codex-sqlite.test.js`

Expected: PASS 或明确 SKIP SQLite CLI unavailable。

- [ ] **Step 7：运行全量测试**

Run: `npm test`

Expected: 全部 PASS。

- [ ] **Step 8：提交**

```bash
git add src/sources/codex/sqlite.js test/helpers/create-codex-fixture-db.js test/codex-sqlite.test.js
git commit -m "feat: read codex sqlite state"
```

## Task 3：实现 Codex JSONL Parser

**文件：**

- 新增：`src/sources/codex/jsonl.js`
- 新增：`test/codex-jsonl.test.js`

步骤：

- [ ] **Step 1：写失败测试：消息、工具、usage**

在 `test/codex-jsonl.test.js` 中断言：

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { EVENT_TYPES } = require("../src/core/events");
const { parseCodexSessionFile } = require("../src/sources/codex/jsonl");

const fixture = path.join(
  __dirname,
  "fixtures/codex-home/sessions/2026/05/07/rollout-2026-05-07T00-00-00-test-parent.jsonl",
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
```

- [ ] **Step 2：运行测试确认失败**

Run: `npm test -- test/codex-jsonl.test.js`

Expected: FAIL，原因是 parser 不存在。

- [ ] **Step 3：实现 parser 最小行为**

`src/sources/codex/jsonl.js` 导出：

```js
async function parseCodexSessionFile(filePath, context = {}) {
  return { events, meta };
}
```

实现要求：

- 逐行读取 JSONL；malformed line 跳过并累加 `meta.skippedLines`。
- `session_meta` / `turn_context` 生成或更新 `session_activity` 上下文。
- `response_item.payload.type === "message"` 且 `role === "user"` 生成 `user_message`。
- `response_item.payload.type === "message"` 且 `role === "assistant"` 生成 `assistant_message`。
- `response_item.payload.type === "agent_message"` 生成 `assistant_message`，payload 标记 `agent: true`。
- `event_msg.payload.type === "token_count"` 使用 `info.last_token_usage` 生成 `model_usage`。
- 不使用 `total_token_usage` 计费。
- `function_call` / `custom_tool_call` 生成 `tool_call`。
- `exec_command_end` 用同 `call_id` 补齐 `tool_call` payload。
- `function_call_output` / `custom_tool_call_output` 只记录 `hasOutput: true`，不保存完整 output。
- event `source` 固定为 `"codex"`。

- [ ] **Step 4：补充自定义工具和子会话 parser 测试**

新增测试解析 child fixture，断言 `custom_tool_call` 生成 `tool_call`：

```js
assert.equal(tool.payload.toolName, "apply_patch");
assert.equal(tool.sessionId, "codex-child-session");
```

- [ ] **Step 5：运行 parser 测试**

Run: `npm test -- test/codex-jsonl.test.js`

Expected: PASS。

- [ ] **Step 6：运行全量测试**

Run: `npm test`

Expected: 全部 PASS。

- [ ] **Step 7：提交**

```bash
git add src/sources/codex/jsonl.js test/codex-jsonl.test.js
git commit -m "feat: parse codex jsonl sessions"
```

## Task 4：实现 Codex Adapter 集成

**文件：**

- 新增：`src/sources/codex/index.js`
- 新增：`test/codex-adapter.test.js`

步骤：

- [ ] **Step 1：写失败测试：SQLite + JSONL 合并**

在 `test/codex-adapter.test.js` 中创建临时 Codex home：

- 复制 `test/fixtures/codex-home/history.jsonl`
- 复制 `test/fixtures/codex-home/session_index.jsonl`
- 复制 `test/fixtures/codex-home/sessions`
- 通过 `createCodexFixtureDb(tmp)` 创建 `state_5.sqlite`

断言：

```js
const { loadCodexEvents } = require("../src/sources/codex");

const result = await loadCodexEvents(tmp, { includeArchived: false });

assert.equal(result.meta.source, "codex");
assert.equal(result.meta.status, "ok");
assert.equal(result.meta.sqlite.available, true);
assert.ok(result.meta.scannedFiles >= 2);
assert.equal(result.meta.skippedLines, 1);
assert.ok(result.events.some((event) => event.source === "codex"));
assert.ok(result.events.some((event) => event.type === "agent_call"));
```

- [ ] **Step 2：写失败测试：没有 SQLite 时 fallback 扫描 sessions**

同一个测试文件中新增：

```js
const result = await loadCodexEvents(fixtureCodexHome, { includeArchived: false });
assert.equal(result.meta.sqlite.available, false);
assert.ok(result.events.some((event) => event.type === "tool_call"));
```

- [ ] **Step 3：运行测试确认失败**

Run: `npm test -- test/codex-adapter.test.js`

Expected: FAIL，原因是 `loadCodexEvents` 不存在。

- [ ] **Step 4：实现 adapter**

`src/sources/codex/index.js` 导出：

```js
async function loadCodexEvents(codexDir, options = {}) {
  return { events, meta };
}
```

实现要求：

- 如果 `codexDir` 不存在，返回：

```js
{
  events: [],
  meta: {
    source: "codex",
    status: "not_configured",
    codexDir,
    scannedFiles: 0,
    skippedLines: 0,
    errors: []
  }
}
```

- 读取 `state_5.sqlite`，获取 thread metadata。
- 优先按 `threads.rollout_path` 读取 JSONL；`rollout_path` 不存在时回退扫描 `sessions/**/*.jsonl`。
- 默认不扫描 `archived_sessions`。
- 当 `options.includeArchived === true` 时扫描 `archived_sessions/*.jsonl`，并按 `sessionId + filePath` 去重。
- 读取 `history.jsonl`、`session_index.jsonl` 补充 `lastPrompt` / `title`，malformed line 计入 meta。
- 根据 `thread_spawn_edges` 生成 `agent_call`：

```js
{
  agentType: child.agent_role || "unknown",
  agentName: child.agent_nickname || "",
  description: child.title || "",
  parentSessionId: edge.parent_thread_id,
  childSessionId: edge.child_thread_id,
  status: edge.status || "unknown"
}
```

- 同一 parent/child edge 只生成一次 `agent_call`。
- meta 包含：

```js
{
  source: "codex",
  status: "ok" | "warning" | "not_configured",
  codexDir,
  scannedFiles,
  skippedLines,
  errors,
  sqlite: {
    available,
    threadCount,
    spawnEdgeCount,
    dynamicToolCount
  }
}
```

- [ ] **Step 5：运行 adapter 测试**

Run: `npm test -- test/codex-adapter.test.js`

Expected: PASS。

- [ ] **Step 6：运行 parser + adapter + aggregate 测试**

Run: `npm test -- test/codex-jsonl.test.js test/codex-adapter.test.js test/aggregate.test.js`

Expected: 全部 PASS。

- [ ] **Step 7：运行全量测试**

Run: `npm test`

Expected: 全部 PASS。

- [ ] **Step 8：提交**

```bash
git add src/sources/codex/index.js test/codex-adapter.test.js
git commit -m "feat: load codex events"
```

## Task 5：接入 Multi-source API Routes

**文件：**

- 修改：`src/api/routes.js`
- 修改：`test/api.test.js`

步骤：

- [ ] **Step 1：写失败 API 测试**

在 `test/api.test.js` 增加 fixture config，设置：

```js
const config = getConfig({
  CLAUDE_DIR: path.join(__dirname, "fixtures/claude-home"),
  CODEX_DIR: path.join(__dirname, "fixtures/codex-home"),
});
```

新增断言：

```js
test("GET /api/sources reports Codex as active when fixture exists", async () => {
  const response = await request("/api/sources");
  const codex = response.sources.find((source) => source.id === "codex");
  assert.equal(codex.enabled, true);
  assert.equal(codex.status, "ok");
});

test("GET /api/overview supports source=codex", async () => {
  const response = await request("/api/overview?source=codex");
  assert.ok(response.data.sessions >= 1);
  assert.ok(response.data.toolCalls >= 1);
});

test("GET /api/agents supports source=codex", async () => {
  const response = await request("/api/agents?source=codex");
  assert.ok(response.totalAgentCalls >= 1);
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `npm test -- test/api.test.js`

Expected: FAIL，原因是 routes 只加载 Claude Code，`/api/sources` 仍把 Codex 标记为 planned。

- [ ] **Step 3：实现 shared event context**

在 `src/api/routes.js` 中引入：

```js
const { loadCodexEvents } = require("../sources/codex");
```

将 `eventContext(req)` 改为：

```js
async function eventContext(req) {
  const [claude, codex] = await Promise.all([
    loadClaudeCodeEvents(config.claudeDir),
    loadCodexEvents(config.codexDir, { includeArchived: config.codexIncludeArchived }),
  ]);

  return {
    events: [...claude.events, ...codex.events],
    meta: {
      sources: {
        "claude-code": claude.meta,
        codex: codex.meta,
      },
      scannedFiles: claude.meta.scannedFiles + codex.meta.scannedFiles,
      skippedLines: claude.meta.skippedLines + codex.meta.skippedLines,
      errors: [...claude.meta.errors, ...codex.meta.errors],
    },
    sourceMeta: { claude, codex },
    filters: queryFilters(req.query),
  };
}
```

注意兼容旧 UI：如果已有前端读取 `meta.errors`、`meta.scannedFiles`，不能破坏这些字段。

- [ ] **Step 4：更新 `/api/sources`**

`/api/sources` 返回：

```js
{
  id: "codex",
  name: "Codex",
  enabled: codex.meta.status === "ok" || codex.meta.status === "warning",
  codexDir: config.codexDir,
  status: codex.meta.status,
  meta: codex.meta
}
```

Cursor 保持：

```js
{ id: "cursor", name: "Cursor", enabled: false, status: "planned" }
```

- [ ] **Step 5：确认聚合器 source filter 无需特殊分支**

运行：

Run: `npm test -- test/aggregate.test.js`

Expected: PASS。若失败，只修正聚合器对 `source: "codex"` 的通用过滤，不增加 Codex 专用逻辑。

- [ ] **Step 6：运行 API 测试**

Run: `npm test -- test/api.test.js`

Expected: PASS。

- [ ] **Step 7：运行全量测试**

Run: `npm test`

Expected: 全部 PASS。

- [ ] **Step 8：提交**

```bash
git add src/api/routes.js test/api.test.js
git commit -m "feat: add codex api source"
```

## Task 6：更新 UI Source 状态与 Settings

**文件：**

- 修改：`public/app.js`
- 修改：`public/views/settings.js`
- 可选修改：`public/styles.css`

步骤：

- [ ] **Step 1：写手动验收清单**

在本任务实施前记录验收点：

- Source 下拉包含 `All Active Sources`、`Claude Code`、`Codex`、`Cursor (Planned)`。
- 当 `/api/sources` 中 Codex `enabled: true` 时，Codex 可选。
- 当 Codex `status: "not_configured"` 或 `status: "planned"` 时，Codex 禁用或显示 unavailable。
- Settings 展示 Claude directory、Codex directory、各 source 状态和 scan metadata。
- 顶部过滤切到 Codex 后，Overview/Sessions/Agents/Tools/Models 重新请求 `source=codex`。

- [ ] **Step 2：修改 `public/app.js`**

实现要求：

- 启动时请求 `/api/sources`。
- Source filter 由 API 返回值渲染，不再硬编码 `Codex (Planned)` 为永久 disabled。
- `enabled === true` 的 source 才能作为 filter 值。
- 保留 `all` 选项，文案为 `All Active Sources`。
- 请求各 view 时继续通过 query string 传递 `source`。

- [ ] **Step 3：修改 `public/views/settings.js`**

Settings 至少展示：

- `Claude Code`：status、directory、scanned files、skipped lines。
- `Codex`：status、directory、scanned files、skipped lines、sqlite available、thread count、spawn edge count、dynamic tool count。
- `Cursor`：status `planned`。
- pricing：继续展示当前 `config.rates`。

- [ ] **Step 4：静态语法检查**

Run:

```bash
node --check public/app.js
for f in public/views/*.js; do node --check "$f"; done
```

Expected: 无语法错误。

- [ ] **Step 5：运行测试**

Run: `npm test`

Expected: 全部 PASS。

- [ ] **Step 6：启动并检查接口**

如果现有服务还在运行，后端代码已变更则先停止旧 `npm start` 进程再重启。

Run:

```bash
npm start
curl -s http://localhost:3456/api/sources
curl -s "http://localhost:3456/api/overview?source=codex"
curl -s "http://localhost:3456/api/agents?source=codex"
```

Expected:

- `/api/sources` 中 Codex 为 `ok`、`warning` 或 `not_configured`，不再是硬编码 `planned`。
- 本机有 `~/.codex` 时，Codex `enabled: true`。
- `source=codex` 的 overview/agents 返回 JSON，不报 500。

- [ ] **Step 7：浏览器检查**

打开 `http://localhost:3456`，逐项检查：

- Overview
- Projects
- Sessions
- Agents
- Tools
- Models
- Settings

重点确认：

- Source filter 切换不会让页面空白或 JS 报错。
- Codex Active 时能看到 Codex 数据。
- Cursor 仍显示 Planned，不可误选为 active source。

- [ ] **Step 8：提交**

```bash
git add public/app.js public/views/settings.js public/styles.css
git commit -m "feat: show codex source in ui"
```

## Task 7：文档与最终验证

**文件：**

- 修改：`README.md`
- 检查：`package.json`
- 检查：`package-lock.json`

步骤：

- [ ] **Step 1：更新 README**

增加内容：

- AI Coding Lens 当前支持 Claude Code + Codex 本地数据源。
- Codex 数据默认来自 `~/.codex`。
- 可用环境变量：

```bash
CLAUDE_DIR=/Users/yourname/.claude
CODEX_DIR=/Users/yourname/.codex
CODEX_INCLUDE_ARCHIVED=false
```

- Codex 当前限制：
  - token cost 是估算值。
  - 默认不扫描 archived sessions。
  - 不读取 `logs_2.sqlite` 作为主数据源。
  - Cursor、云同步、团队看板仍是未来工作。

- [ ] **Step 2：检查 package 文件**

Run:

```bash
git diff -- package.json package-lock.json
```

Expected:

- `package.json` 只有真实需要的改动。
- `package-lock.json` 不应因为版本号或无关 install 变化被提交，除非本阶段确实新增依赖。

- [ ] **Step 3：运行全量测试**

Run: `npm test`

Expected: 全部 PASS。

- [ ] **Step 4：运行静态 JS 检查**

Run:

```bash
node --check server.js
node --check src/server.js
node --check src/api/routes.js
find src -name '*.js' -print0 | xargs -0 -n1 node --check
node --check public/app.js
for f in public/views/*.js; do node --check "$f"; done
```

Expected: 全部无语法错误。

- [ ] **Step 5：启动服务**

Run: `npm start`

Expected: 输出 `AI Coding Lens running at http://localhost:3456` 或等价启动信息。

- [ ] **Step 6：curl 验证**

Run:

```bash
curl -I http://localhost:3456
curl -s http://localhost:3456/api/sources
curl -s "http://localhost:3456/api/overview?source=codex"
curl -s "http://localhost:3456/api/agents?source=codex"
```

Expected:

- 首页返回 200。
- `/api/sources` 返回 Claude Code、Codex、Cursor。
- 本机有 `~/.codex` 时 Codex 不再是 `planned`。
- Codex API 请求不返回 500。

- [ ] **Step 7：浏览器最终验收**

在浏览器打开 `http://localhost:3456`，检查：

- 所有 tab 可切换。
- Source filter 可区分 Claude Code / Codex / Cursor planned。
- Settings 能看到 Codex scan metadata。
- 控制台无明显 JS error。

- [ ] **Step 8：提交**

```bash
git add README.md
git commit -m "docs: document codex source support"
```

## 执行注意事项

- 每个 Task 完成后必须运行该 Task 指定测试，再运行 `npm test`。
- 不要提交本地 `.env`。
- 不要提交无关 `package-lock.json` 变化。
- 如果 `sqlite3` CLI 不存在，SQLite reader 集成测试可以 skip，但 adapter 的 JSONL fallback 测试不能 skip。
- 不要把 `function_call_output` 或命令输出全文放进事件 payload 或 UI。
- 不要把 Cursor 标记为 active；本计划只实现 Codex。
- 如果真实 `~/.codex` 数据结构与 fixture 不同，优先让 parser 容错并在 `meta.errors` 记录，不要让 dashboard 500。
