# AI Coding Lens v2 实施计划

> **给 agentic workers 的要求：** 实施本计划时必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，并按 checkbox 步骤逐项推进。

**目标：** 将 `claude-lens` 升级为本地优先的 AI 编程活动分析器，支持标准化 Claude Code 事件、更丰富的聚合数据，以及 Overview、Sessions、Agents、Projects、Tools、Models、Settings 七个 tab 页面。

**架构：** 保持 Express + 原生前端，但将后端拆成数据源适配器、标准事件模型、聚合器、API routes 和静态 UI 模块。保留当前本地-only 行为和旧接口，同时新增 v2 API。

**技术栈：** Node.js CommonJS、Express 4、dotenv、原生 HTML/CSS/JavaScript、Node 内置 `node:test`。

---

## Task 1：添加测试框架和 fixture

**文件：**

- 修改：`package.json`
- 新增：`test/fixtures/claude-home/history.jsonl`
- 新增：`test/fixtures/claude-home/stats-cache.json`
- 新增：`test/fixtures/claude-home/projects/sample-project/session-1.jsonl`
- 新增：`test/fixtures/claude-home/projects/sample-project/session-2.jsonl`

步骤：

- [x] 添加 `test` script：`node --test`。
- [x] 添加包含 user message、assistant message、token usage、`Bash`、`Read`、`Agent` tool call 的 fixture。
- [x] 包含一行 malformed JSONL。
- [x] 运行 `npm test`。
- [x] 预期：即使还没有真实测试，test runner 也能正常启动。
- [x] 提交：`test: add claude fixture data`

## Task 2：添加配置和 pricing 核心

**文件：**

- 新增：`src/config.js`
- 新增：`src/core/pricing.js`
- 新增：`test/pricing.test.js`

步骤：

- [x] 编写 Bedrock 默认费率和 cache-aware cost 计算测试。
- [x] 实现 `getConfig(env)`，返回 `port`、`claudeDir` 和 `rates`。
- [x] 实现 `calculateCost({ input, output, cacheRead, cacheCreate }, rates)`。
- [x] 运行 `npm test`。
- [x] 提交：`feat: add config and pricing helpers`

## Task 3：添加标准事件模型

**文件：**

- 新增：`src/core/events.js`
- 新增：`test/events.test.js`

步骤：

- [x] 定义事件类型：
  - `user_message`
  - `assistant_message`
  - `model_usage`
  - `tool_call`
  - `agent_call`
  - `session_activity`
- [x] 添加 `createEvent({ source, type, timestamp, projectId, sessionId, messageId, payload })`。
- [x] 确保事件 id 基于 source/type/session/message/index 稳定生成。
- [x] 运行 `npm test`。
- [x] 随 Task 2 一起提交。

## Task 4：实现 Claude Code Adapter

**文件：**

- 新增：`src/sources/claude-code.js`
- 新增：`test/claude-code-adapter.test.js`

步骤：

- [x] 编写测试，验证 fixture JSONL 能生成 user、assistant、model、tool、agent 标准事件。
- [x] 实现递归扫描 `projects/**/*.jsonl`。
- [x] 解析 `history.jsonl`，用于 prompt history/session activity 兼容。
- [x] 将 assistant `message.usage` 解析为 `model_usage`。
- [x] 将 `tool_use` content 解析为 `tool_call`。
- [x] 对 `Agent` tool call 额外生成 `agent_call`。
- [x] 统计 malformed line 到 `meta.skippedLines`。
- [x] 返回 `{ events, meta }`。
- [x] 运行 `npm test`。
- [x] 提交：`feat: parse claude code logs into events`

## Task 5：实现聚合器

**文件：**

- 新增：`src/core/aggregate.js`
- 新增：`test/aggregate.test.js`

步骤：

- [x] 编写 overview、daily costs、projects、sessions、tools、models、agents 测试。
- [x] 实现 `aggregateOverview(events, rates, filters)`。
- [x] 实现 `aggregateDailyCosts(events, rates, filters)`。
- [x] 实现 `aggregateProjects(events, rates, filters)`。
- [x] 实现 `aggregateSessions(events, rates, filters)`。
- [x] 实现 `getSessionTimeline(events, sessionId)`。
- [x] 实现 `aggregateTools(events, filters)`。
- [x] 实现 `aggregateModels(events, rates, filters)`。
- [x] 实现 `aggregateAgents(events, rates, filters)`。
- [x] agent 调用后工具分析使用同 session 后续 10 个事件窗口。
- [x] 运行 `npm test`。
- [x] 提交：`feat: add event aggregators`

## Task 6：拆分 Server 并添加 v2 API

**文件：**

- 修改：`server.js`
- 新增：`src/server.js`
- 新增：`src/api/routes.js`
- 新增：`test/api.test.js`

步骤：

- [x] 保留根目录 `server.js` 作为 package `bin` 的可执行 wrapper。
- [x] 将 Express app 创建逻辑迁移到 `src/server.js`。
- [x] 服务静态文件目录 `public/`。
- [x] 添加 v2 endpoints：
  - `/api/overview`
  - `/api/sessions`
  - `/api/sessions/:sessionId`
  - `/api/tools`
  - `/api/tools/:toolName`
  - `/api/agents`
  - `/api/agents/:agentType`
  - `/api/models`
  - `/api/sources`
- [x] 保留旧 endpoints：
  - `/api/stats`
  - `/api/history`
  - `/api/tool-calls`
  - `/api/tool-details/:toolName`
  - `/api/projects`
  - `/api/daily-costs`
- [x] API 测试使用 fixture `CLAUDE_DIR`。
- [x] 运行 `npm test`。
- [x] 提交：`feat: add v2 api routes`

## Task 7：将静态 UI 移入 public app shell

**文件：**

- 移动：`index.html` 到 `public/index.html`
- 新增：`public/styles.css`
- 新增：`public/app.js`

步骤：

- [x] 将 inline CSS 抽离到 `public/styles.css`。
- [x] 将 inline JS 抽离到 `public/app.js`。
- [x] 添加顶部导航：
  - Overview
  - Projects
  - Sessions
  - Agents
  - Tools
  - Models
  - Settings
- [x] 添加全局筛选：
  - Today / 7D / 30D / All
  - Source: Claude Code
  - Project
  - Refresh
- [x] 保持高信息密度、开发者工具风格。
- [x] 运行 `npm start`。
- [x] 验证 `http://localhost:3456` 或备用端口能渲染。
- [x] 提交：`feat: add tabbed dashboard ui`

## Task 8：实现 Overview 视图

**文件：**

- 新增：`public/views/overview.js`
- 修改：`public/app.js`

步骤：

- [x] 拉取 `/api/overview` 和 `/api/daily-costs`。
- [x] 渲染 cost、sessions、messages、tool calls、agent calls、cache hit 卡片。
- [x] 渲染 top projects 和 recent expensive sessions。
- [x] 展示 loading、empty、error 状态。
- [x] 筛选变化会重新加载视图。
- [x] 随 UI 提交一起完成。

## Task 9：实现 Sessions 视图

**文件：**

- 新增：`public/views/sessions.js`
- 修改：`public/app.js`

步骤：

- [x] 拉取 `/api/sessions`。
- [x] 渲染 session 表格：time、project、source、models、messages、tools、agents、cost、duration、last prompt。
- [x] 点击行后拉取 `/api/sessions/:sessionId`。
- [x] 渲染 timeline：user prompt、assistant summary、model usage、tool call、agent call、cost。
- [x] 随 UI 提交一起完成。

## Task 10：实现 Agents 视图

**文件：**

- 新增：`public/views/agents.js`
- 修改：`public/app.js`

步骤：

- [x] 拉取 `/api/agents`。
- [x] 渲染顶部指标：
  - total agent calls
  - sessions with agents
  - top agent type
  - agent-assisted cost
  - average tools after agent call
- [x] 渲染 agent type 表格。
- [x] 点击行后拉取 `/api/agents/:agentType`。
- [x] 渲染 related projects、common follow-up tools、related sessions。
- [x] 随 UI 提交一起完成。

## Task 11：实现 Projects、Tools、Models、Settings 视图

**文件：**

- 新增：`public/views/projects.js`
- 新增：`public/views/tools.js`
- 新增：`public/views/models.js`
- 新增：`public/views/settings.js`
- 修改：`public/app.js`

步骤：

- [x] Projects：渲染项目汇总表和详情面板。
- [x] Tools：保留 ranking/detail/export 行为，并增加 project/session counts。
- [x] Models：渲染 token/cost/cache 表格。
- [x] Settings：渲染 Claude data directory、pricing、source status、scan metadata。
- [x] 随 UI 提交一起完成。

## Task 12：文档和最终验证

**文件：**

- 修改：`README.md`
- 检查：`package.json`
- 检查：`package-lock.json`

步骤：

- [x] 更新 README，说明 v2 本地 dashboard、Claude Code-only 支持、未来 Codex/Cursor 方向。
- [x] 确认 `npm start` 仍可工作。
- [x] 确认 `npx`/`bin` 仍使用根目录 `server.js`。
- [x] 运行 `npm test`。
- [x] 运行 `npm start`。
- [x] 验证：
  - `curl -I http://localhost:3457`
  - `curl -s http://localhost:3457/api/overview`
  - `curl -s http://localhost:3457/api/agents`
- [x] JS 模块语法检查通过。
- [x] 提交：`docs: update v2 usage notes`

## 假设和约束

- 保持 CommonJS 和 Express。
- Phase 1 保持原生前端。
- 只使用 Node 内置测试，不引入 Jest/Vitest。
- Claude Code 是唯一已实现数据源。
- Codex、Cursor、云同步、认证、团队 dashboard、数据库存储都留作未来工作。
- agent follow-up 分析使用同 session 后续 10 个事件。
- 不提交无关的 `package-lock.json` 变更。
