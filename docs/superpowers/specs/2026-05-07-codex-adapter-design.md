# Phase 2 Codex Adapter 设计说明

日期：2026-05-07

## 概要

Phase 2 的目标是将 Codex 本地数据接入 AI Coding Lens，让 `Codex` 从 Settings 和 Source 下拉中的 `Planned` 变成可用数据源。

本阶段继续保持本地优先，不上传数据，不引入云端同步，不引入数据库写入。Codex adapter 只读取用户本机 `~/.codex` 下已有文件，并把原始记录映射成 v2 已有的标准事件模型。

第一版 Codex 接入优先支持：

- sessions
- messages
- tool calls
- model usage / token usage
- projects
- models
- agent/subagent thread relationship

第一版不追求与 Claude Code 完全等价。Codex 原始数据缺少或语义不同的字段，应明确标记为 `unknown` 或使用保守估算。

## 调研结论

本机 Codex 数据主要位于：

```text
~/.codex
```

关键数据文件和目录：

```text
~/.codex/sessions/YYYY/MM/DD/*.jsonl
~/.codex/archived_sessions/*.jsonl
~/.codex/history.jsonl
~/.codex/session_index.jsonl
~/.codex/state_5.sqlite
~/.codex/logs_2.sqlite
~/.codex/sqlite/codex-dev.db
```

调研中观察到：

- `~/.codex/sessions/**/*.jsonl` 是主会话事件流。
- `~/.codex/history.jsonl` 只有轻量 prompt history：`session_id`、`ts`、`text`。
- `~/.codex/session_index.jsonl` 只有 session 索引：`id`、`thread_name`、`updated_at`。
- `~/.codex/state_5.sqlite` 包含结构化 thread 元信息、spawn 边、动态工具等。
- `~/.codex/logs_2.sqlite` 是日志表，适合诊断，不适合作为第一版 adapter 的核心数据源。
- `~/.codex/sqlite/codex-dev.db` 当前主要是 automations/inbox 相关，不作为 Phase 2 主数据源。

## Codex JSONL 结构

Codex session JSONL 顶层结构稳定为：

```js
{
  timestamp: "2026-05-07T...",
  type: "response_item",
  payload: {}
}
```

主要顶层 `type`：

- `session_meta`
- `turn_context`
- `event_msg`
- `response_item`

常见 `payload.type`：

- `message`
- `user_message`
- `agent_message`
- `reasoning`
- `agent_reasoning`
- `function_call`
- `function_call_output`
- `custom_tool_call`
- `custom_tool_call_output`
- `exec_command_end`
- `token_count`
- `collab_agent_spawn_end`
- `collab_agent_interaction_end`
- `collab_close_end`
- `turn_aborted`
- `context_compacted`
- `error`

常见工具名包括：

- `exec_command`
- `write_stdin`
- `apply_patch`
- `update_plan`
- `spawn_agent`
- `wait_agent`
- `send_input`
- `close_agent`
- `view_image`
- `js`
- MCP/dynamic tool names

## SQLite 结构

Phase 2 需要读取 `~/.codex/state_5.sqlite`，重点表如下。

### threads

`threads` 表提供 session/thread 元信息：

- `id`
- `rollout_path`
- `created_at_ms`
- `updated_at_ms`
- `source`
- `model_provider`
- `cwd`
- `title`
- `tokens_used`
- `model`
- `reasoning_effort`
- `agent_nickname`
- `agent_role`
- `agent_path`
- `git_branch`
- `git_sha`
- `git_origin_url`

用途：

- 用 `id` 匹配 session/thread。
- 用 `rollout_path` 定位 JSONL 文件。
- 用 `cwd` 映射 `projectId`。
- 用 `model` / `model_provider` / `reasoning_effort` 补齐模型上下文。
- 用 `agent_role` / `agent_nickname` 支持 subagent 分析。

### thread_spawn_edges

`thread_spawn_edges` 提供 parent/child thread 关系：

- `parent_thread_id`
- `child_thread_id`
- `status`

用途：

- 识别 Codex 多 agent / subagent 关系。
- 生成 parent session 中的 `agent_call` 事件。
- 将 child thread 关联回 parent session。

### thread_dynamic_tools

`thread_dynamic_tools` 提供每个 thread 可用的动态工具：

- `thread_id`
- `position`
- `name`
- `description`
- `input_schema`
- `namespace`
- `defer_loading`

用途：

- Settings 或 source metadata 可展示动态工具数量。
- 第一版不需要为每个 dynamic tool 单独生成事件。

## 标准事件映射

Codex adapter 输出的事件仍使用当前 v2 标准事件结构：

```js
{
  id: "event-id",
  source: "codex",
  type: "tool_call",
  timestamp: "2026-05-07T00:00:00.000Z",
  projectId: "/workspace/path",
  sessionId: "thread-id",
  messageId: "line-or-call-id",
  payload: {}
}
```

### session_activity

来源：

- `session_meta`
- `turn_context`
- `threads`

映射：

```js
{
  sourceKind: "codex",
  originator: session_meta.originator,
  cliVersion: session_meta.cli_version,
  modelProvider: session_meta.model_provider || threads.model_provider,
  model: turn_context.model || threads.model || "unknown",
  reasoningEffort: turn_context.effort || threads.reasoning_effort || "",
  cwd: session_meta.cwd || turn_context.cwd || threads.cwd,
  title: threads.title || session_index.thread_name || "",
  git: session_meta.git || threads git fields
}
```

### user_message

来源：

- `response_item` with `payload.type === "message"` and `payload.role === "user"`
- `response_item` with `payload.type === "user_message"`
- `history.jsonl` 可作为 fallback，但不作为第一优先来源

映射：

```js
{
  textSummary: truncated text,
  cwd,
  origin: "codex-jsonl"
}
```

### assistant_message

来源：

- `response_item` with `payload.type === "message"` and `payload.role === "assistant"`
- `response_item` with `payload.type === "agent_message"`

映射：

```js
{
  model: current turn_context model || threads.model || "unknown",
  textSummary: truncated text,
  phase: payload.phase || ""
}
```

说明：

- `developer` role 不映射为用户或助手消息，可作为 `session_activity` 或直接忽略。
- `reasoning` / `agent_reasoning` 第一版不展示正文，只可计入 timeline 事件摘要。

### model_usage

来源：

- `event_msg` with `payload.type === "token_count"`
- `payload.info.last_token_usage`

观察到的 usage keys：

```js
{
  input_tokens: 0,
  cached_input_tokens: 0,
  output_tokens: 0,
  reasoning_output_tokens: 0,
  total_tokens: 0
}
```

映射策略：

```js
{
  model: current turn_context model || threads.model || "unknown",
  inputTokens: max(input_tokens - cached_input_tokens, 0),
  outputTokens: output_tokens + reasoning_output_tokens,
  cacheReadTokens: cached_input_tokens,
  cacheCreateTokens: 0,
  reasoningOutputTokens: reasoning_output_tokens,
  totalTokens: total_tokens
}
```

重要约束：

- 使用 `last_token_usage`，不要用 `total_token_usage`，避免累计值重复计费。
- Codex 没有观察到 Claude 那种 `cache_creation_input_tokens` 字段，第一版将 `cacheCreateTokens` 置为 `0`。
- `reasoning_output_tokens` 是否单独计价后续可以再细分；第一版将其并入 `outputTokens`，并保留原始字段供后续优化。

### tool_call

来源：

- `response_item` with `payload.type === "function_call"`
- `response_item` with `payload.type === "custom_tool_call"`
- `event_msg` with `payload.type === "exec_command_end"` 用于补充命令执行结果

基础映射：

```js
{
  toolName: payload.name || inferred tool name,
  toolUseId: payload.call_id,
  inputSummary: summarized arguments,
  command: parsed command when available,
  filePath: inferred file path when available,
  status: exec status when available,
  exitCode: exec exit_code when available,
  durationMs: exec duration when available,
  cwd: exec cwd when available
}
```

合并规则：

- 以 `call_id` 为关联 key。
- `function_call` 先生成 tool call。
- 如果后续存在同 `call_id` 的 `exec_command_end`，用其补充 `command`、`cwd`、`exitCode`、`durationMs`、`status`。
- `function_call_output` 和 `custom_tool_call_output` 第一版不存完整 output，只保留 `hasOutput: true` 或短摘要，避免泄漏大量命令输出。

### agent_call

来源：

- `state_5.sqlite.thread_spawn_edges`
- `threads.agent_role`
- `threads.agent_nickname`
- `session_meta.source.subagent`
- Codex JSONL 中 `spawn_agent` / `wait_agent` / `send_input` / `close_agent` 等工具调用

第一版主策略：

- 以 `thread_spawn_edges` 为准，识别 parent/child 关系。
- 对每条 edge，在 parent session 中生成一个 `agent_call`。
- child thread 的 `threads.agent_role` 作为 `agentType`。
- child thread 的 `agent_nickname` 作为 `agentName`。
- child thread id 写入 `childSessionId`。

映射：

```js
{
  agentType: child.agent_role || "unknown",
  agentName: child.agent_nickname || "",
  description: child.title || child.first_user_message || "",
  parentSessionId: edge.parent_thread_id,
  childSessionId: edge.child_thread_id,
  status: edge.status
}
```

补充策略：

- 如果 JSONL 中有 `spawn_agent` tool call，但 SQLite edge 缺失，可生成 fallback `agent_call`。
- 如果 SQLite 和 JSONL 都有记录，以 SQLite edge 为主，避免重复统计。

## 数据源优先级

第一版 adapter 的读取顺序：

1. 读取 `state_5.sqlite` 的 `threads`、`thread_spawn_edges`、`thread_dynamic_tools`。
2. 根据 `threads.rollout_path` 读取对应 JSONL。
3. 如果 SQLite 不可用，fallback 扫描 `~/.codex/sessions/**/*.jsonl`。
4. 可选扫描 `~/.codex/archived_sessions/*.jsonl`，默认第一版先不启用，避免和 active sessions 重复。
5. 用 `history.jsonl`、`session_index.jsonl` 补充标题和 prompt summary。

## 配置设计

新增环境变量：

```bash
CODEX_DIR=/Users/yourname/.codex
CODEX_INCLUDE_ARCHIVED=false
```

默认：

- `CODEX_DIR` 默认为 `~/.codex`
- `CODEX_INCLUDE_ARCHIVED` 默认为 `false`

`src/config.js` 需要增加：

```js
codexDir: env.CODEX_DIR || path.join(home, ".codex")
codexIncludeArchived: env.CODEX_INCLUDE_ARCHIVED === "true"
```

## API 和 UI 行为

### `/api/sources`

Codex adapter 实现后：

- 如果 `CODEX_DIR` 存在且可读取，Codex 显示 `Active`。
- 如果不存在，Codex 显示 `Not configured`。
- 如果存在但解析失败，Codex 显示 `Warning` 并展示 error meta。

### Source filter

顶部 Source 下拉应支持：

- All Active Sources
- Claude Code
- Codex
- Cursor (Planned)

当 Codex Active 后：

- Overview 可同时展示 Claude Code + Codex。
- Projects/Sessions/Tools/Models 支持按 `source=codex` 过滤。
- Agents 支持 Codex subagent/thread_spawn 分析。

## 测试设计

新增 fixture：

```text
test/fixtures/codex-home/
  history.jsonl
  session_index.jsonl
  state_5.sqlite 或 state_5.sql fixture builder
  sessions/2026/05/07/rollout-*.jsonl
```

推荐不要直接提交二进制 SQLite fixture。更好的方式：

- 新增 `test/helpers/create-codex-fixture-db.js`
- 测试运行时创建临时 SQLite DB
- 插入最小 `threads`、`thread_spawn_edges`、`thread_dynamic_tools`

测试用例：

- Codex session JSONL 能生成 `user_message`、`assistant_message`。
- `token_count.last_token_usage` 能生成 `model_usage`，且不重复累计 `total_token_usage`。
- `function_call` 能生成 `tool_call`。
- `exec_command_end` 能通过 `call_id` 补齐 command/status/duration。
- `thread_spawn_edges` 能生成 `agent_call`。
- 缺少 SQLite 时能 fallback 扫描 `sessions/**/*.jsonl`。
- malformed JSONL line 被跳过并计入 `meta.skippedLines`。
- `/api/sources` 能将 Codex 从 Planned/Not configured 切到 Active。

## 实施建议

建议分 5 个小任务实施：

1. 配置与 fixture：增加 `CODEX_DIR`、`CODEX_INCLUDE_ARCHIVED` 和 Codex fixture。
2. SQLite reader：读取 `threads`、`thread_spawn_edges`、`thread_dynamic_tools`。
3. JSONL parser：解析 Codex session 事件并生成标准事件。
4. Codex adapter：合并 SQLite 元信息和 JSONL 事件，输出 `{ events, meta }`。
5. API 接入：让 routes 同时加载 Claude + Codex 事件，并更新 `/api/sources` 状态。

## 风险和限制

- Codex 数据结构可能随 Codex 版本变化，需要 adapter 对未知 `payload.type` 保持容错。
- `logs_2.sqlite` 很大，不应作为每次 dashboard 加载的主扫描对象。
- `session_meta` 可能包含大量 instructions，不应进入 UI 或持久化摘要。
- tool output 可能包含敏感代码或命令输出，第一版只保留短摘要或状态，不展示完整 output。
- Codex token 计费与 Claude 费率不同，第一版可以先复用当前 rates 做估算，但 UI 应标注为 estimated。
- `reasoning_output_tokens` 的计费规则需要后续确认；第一版先并入 output 估算。
- archived sessions 可能与 active sessions 重复，默认不启用。

## 开放问题

- 是否要在 UI 中单独展示 `reasoningOutputTokens`？
- Codex 的 `tokens_used` 和 JSONL `token_count` 哪个更适合作为 session 汇总来源？
- 是否要读取 `archived_sessions`，以及如何去重？
- Codex `logs_2.sqlite` 是否需要作为 diagnostics 页面，而不是主 dashboard 数据源？
- subagent 的名称展示优先使用 `agent_nickname` 还是 `agent_role`？
