# AI Coding Lens v2 设计说明

日期：2026-05-07

## 概要

将 `claude-lens` 从一个只面向 Claude Code 的本地用量看板，升级为本地优先的 AI 编程活动分析器。

第一阶段仍只实现 Claude Code 数据源，但会引入统一事件模型、数据源适配器边界、更丰富的项目/session 分析，以及独立的多 agent 分析视图。

目标是在不引入云端部署、账号体系、数据库和复杂 IDE 支持的前提下，先把本地日志里的真实 AI 编程行为结构化，并形成可分析的产品能力。

## 当前项目状态

当前应用是一个轻量 Express 服务加单页 HTML：

- `server.js` 直接读取 `~/.claude`。
- `index.html` 通过多个 `/api/*` 接口拉取数据，并用原生 JavaScript 渲染页面。
- 没有数据库、构建步骤、认证系统或前端框架。
- 现有指标包括总览用量、缓存表现、每日成本、工具调用、项目活跃度、Prompt 历史和 Top Models。

当前代码已经能识别 Claude Code 的 `Agent` tool call，但只是把它当作普通工具调用展示。它还没有 agent 工作流模型、数据源适配层、session 时间线，也不支持多个 AI 编程工具的数据统一分析。

## 产品方向

推荐方向：先建设本地优先的 v2 架构，再考虑 Codex、Cursor 或云端部署。

产品定位：

> AI Coding Lens：一个本地优先的 AI 编程活动分析器，用于分析项目、session、模型、工具和 agent 使用情况。

第一阶段需要回答：

- 哪些项目最依赖 AI 编程？
- 哪些 session 成本最高？
- 哪些模型和工具最常被使用？
- agent 调用发生在哪些项目和 session？
- 使用 agent 的 session 是否通常伴随更多工具调用或更高成本？
- 未来 Claude Code、Codex、Cursor 的数据能否映射到同一套模型？

## 非目标

第一阶段不做：

- 云端存储。
- 登录和团队空间。
- 远程采集器。
- Cursor 支持。
- 完整 Codex 支持。
- 数据库。
- React 或其他复杂前端框架迁移。
- 使用 LLM 给 session 或 agent 做质量评分。
- 断言 agent 一定导致后续工具调用；第一阶段只做相关性分析。

## 架构设计

保持项目轻量，但拆清职责边界。

### 数据源适配层

适配器负责读取不同工具的原始数据，并输出统一事件。

第一阶段实现：

- `ClaudeCodeAdapter`

未来预留：

- `CodexAdapter`
- `CursorAdapter`

适配器不计算 dashboard 指标，只负责扫描文件、解析原始记录、生成标准事件。

### 事件模型层

所有数据源都映射到同一种事件结构：

```js
{
  id: "event-id",
  source: "claude-code",
  type: "tool_call",
  timestamp: "2026-05-07T00:00:00.000Z",
  projectId: "project-id",
  sessionId: "session-id",
  messageId: "message-id",
  payload: {}
}
```

初始事件类型：

- `user_message`
- `assistant_message`
- `model_usage`
- `tool_call`
- `agent_call`
- `session_activity`

### 聚合层

聚合器消费统一事件，生成 API 可直接返回的数据：

- 总览指标
- 每日成本
- 项目汇总
- session 汇总
- session 时间线
- 工具汇总
- 模型汇总
- agent 汇总

原来散落在 `server.js` 里的解析和统计逻辑应迁移到这一层。

### API 层

Express 继续作为 HTTP 层，但不再直接内联读取 `~/.claude`，而是调用适配器和聚合器。

候选接口：

- `GET /api/overview`
- `GET /api/projects`
- `GET /api/projects/:projectId`
- `GET /api/sessions`
- `GET /api/sessions/:sessionId`
- `GET /api/tools`
- `GET /api/tools/:toolName`
- `GET /api/agents`
- `GET /api/agents/:agentType`
- `GET /api/models`
- `GET /api/daily-costs`
- `GET /api/sources`

迁移期间保留旧接口，避免 UI 迁移过程中功能断裂。

### UI 层

第一阶段继续使用原生 HTML/CSS/JavaScript，不引入前端框架。

建议拆分为：

- `public/index.html`
- `public/styles.css`
- `public/app.js`
- `public/views/overview.js`
- `public/views/projects.js`
- `public/views/sessions.js`
- `public/views/agents.js`
- `public/views/tools.js`
- `public/views/models.js`
- `public/views/settings.js`

## 数据模型

### 模型用量 payload

```js
{
  model: "claude-sonnet-4",
  inputTokens: 1000,
  outputTokens: 500,
  cacheReadTokens: 300,
  cacheCreateTokens: 100
}
```

### 工具调用 payload

```js
{
  toolName: "Bash",
  inputSummary: "npm test",
  filePath: null,
  command: "npm test"
}
```

### Agent 调用 payload

```js
{
  agentType: "explorer",
  description: "Inspect the codebase for API boundaries",
  parentSessionId: "session-id",
  relatedToolCallId: "tool-call-event-id"
}
```

### Session 汇总

```js
{
  sessionId: "session-id",
  source: "claude-code",
  projectId: "project-id",
  startedAt: "2026-05-07T00:00:00.000Z",
  endedAt: "2026-05-07T00:30:00.000Z",
  messages: 12,
  toolCalls: 20,
  agentCalls: 2,
  models: ["claude-sonnet-4"],
  cost: 1.23,
  lastPromptSummary: "Fix failing tests"
}
```

## 页面设计

### Overview

Overview 保留总览看板角色，并增加全局筛选：

- 时间范围：Today、7D、30D、All
- 数据源
- 项目

展示：

- sessions
- messages
- tool calls
- agent calls
- estimated cost
- cache hit
- top models
- top projects
- recent expensive sessions

### Projects

项目列表字段：

- project
- source
- sessions
- messages
- cost
- tool calls
- agent calls
- top model
- cache hit
- last active

项目详情展示：

- daily trend
- session list
- tool breakdown
- agent breakdown
- model breakdown

### Sessions

session 列表字段：

- time
- project
- source
- model mix
- messages
- tool calls
- agent calls
- cost
- duration
- last prompt summary

session 详情展示时间线：

- user prompt
- assistant summary
- model usage
- tool call
- agent call
- cost accumulation

### Agents

Agents 是第一阶段重点页面。

顶部指标：

- total agent calls
- sessions with agents
- agent-assisted cost
- average tools after agent call
- top agent type

表格字段：

- agent type
- calls
- projects
- sessions
- related tool calls
- estimated related cost
- latest use

agent 详情展示：

- 使用该 agent type 的项目
- 常见 description
- agent 调用后常见工具
- 相关 sessions

### Tools

升级现有工具调用分析：

- tool name
- calls
- projects used
- sessions used
- related cost when inferable
- common input summary
- trend

保留工具详情和导出功能。

### Models

模型表字段：

- model
- responses
- input tokens
- output tokens
- cache read tokens
- cache create tokens
- estimated cost
- projects
- sessions
- average output tokens
- cache hit

### Settings

第一阶段只展示本地配置：

- Claude data directory
- pricing preset
- scan status
- source status

## 多 Agent 分析

Claude Code 当前把 agent 使用记录为 `Agent` tool call。第一阶段将每个 `Agent` tool call 映射为 `agent_call` 事件。

定义 agent segment 为：

- agent 调用本身
- 同一 session 中最近的上一个 user prompt
- 同一 session 中后续固定窗口内的 tool calls
- 同一 session 中后续 assistant model usage
- project、session、date、source、cost 上下文

这能提供有用的相关性分析，但不声称证明因果关系。

第一阶段支持回答：

- 哪些项目使用 agent 最多？
- 哪些 agent type 最常见？
- 哪些 session 包含 agent？
- agent 调用后常见哪些工具？
- agent-assisted session 是否比普通 session 更贵？
- agent-assisted session 是否工具调用更多？

第一阶段不做：

- 还原隐藏的 subagent 内部对话。
- 判断 agent 是否成功。
- 推断复杂 agent 调用图。
- 使用 LLM 总结或评分质量。

## 错误处理

应用需要优雅处理缺失或不完整 Claude 数据：

- 缺少 `~/.claude`：展示 source status error。
- 缺少可选文件：返回空集合，而不是让服务崩溃。
- JSONL malformed line：跳过并统计数量。
- 未知工具输入：保留通用 summary。
- 未支持的数据源：展示 disabled source status。

API 响应应包含元数据，方便 UI 解释数据质量：

```js
{
  data: [],
  meta: {
    source: "claude-code",
    scannedFiles: 10,
    skippedLines: 2,
    errors: []
  }
}
```

## 测试

第一阶段添加聚焦 parser 和 aggregator 的测试。

推荐测试：

- Claude JSONL 记录能映射为标准事件。
- `Agent` tool call 能映射为 `agent_call`。
- malformed JSONL line 会被跳过。
- daily cost 聚合能正确处理 cache tokens。
- project/session 汇总能正确去重 session。
- agent-assisted 与 non-agent session 对比能基于 fixture 工作。

测试使用 `test/fixtures/` 下的合成 JSONL，不依赖开发者真实 `~/.claude` 数据。

## 交付顺序

1. 增加测试脚本和 fixture。
2. 增加配置、事件模型和 pricing helper。
3. 实现 Claude Code adapter。
4. 基于统一事件实现聚合器。
5. 增加 v2 API，并保留旧 API。
6. 将前端拆到 `public/`。
7. 实现 Overview、Sessions、Agents、Tools、Models、Projects、Settings 视图。
8. 更新 README。
9. 完整运行测试和本地服务验证。

## 未来扩展

### Codex

在 v2 事件模型稳定后增加 `CodexAdapter`。adapter 输出同样的标准事件，不把 Codex 特有逻辑写进聚合器。

### Cursor

先调研 Cursor 本地数据可用性。只有当 Cursor 日志能可靠映射到 source/session/message/tool/model 模型时再实现。

### 云端

云端应在本地洞察价值验证后再做。云端版本需要：

- 本地采集器
- 上传队列
- 数据脱敏
- 账号和团队模型
- 项目权限
- 远程存储与索引
- source health reporting

本地优先事件模型可以降低未来云端同步难度，因为采集器可以上传标准化、脱敏后的事件，而不是上传原始日志。

## 待决问题

- Phase 1 后是否继续使用原生 JS，还是迁移到 React。
- “agent 调用后的工具窗口”大小是否固定为 10 个事件。
- 是否将标准事件持久化到本地磁盘以提升加载速度。
- pricing preset 放在 `.env`、UI settings，还是两者都支持。
- 默认展示多少 prompt 文本，才能兼顾可用性和隐私。
