# Phase 3 Cursor Adapter 设计说明

日期：2026-05-07

## 概要

Phase 3 的目标是把 Cursor 本地 AI coding tracking 数据接入 AI Coding Lens，让 `Cursor` 从 Settings 和 Source 下拉中的 `Planned` 变成可用数据源。

本阶段继续保持本地优先，不上传数据，不引入云同步，不写入 Cursor 数据库。第一版 Cursor adapter 只读 `~/.cursor/ai-tracking/ai-code-tracking.db`，把 Cursor 记录映射为现有标准事件模型。

第一版优先支持：

- Cursor source 状态、配置和扫描元信息
- Composer / Tab 等 AI 代码活动计数
- conversationId / requestId 粒度的 synthetic sessions
- model 分布
- 文件扩展名、文件名摘要、删除文件事件
- scored commit 的 AI 行数统计元信息

第一版不支持：

- token usage 和真实 cost。Cursor tracking DB 没有 token 字段，成本应保持 0，而不是估算。
- Cursor `state.vscdb` 的 `agentKv:*` blob。该区域结构不稳定且可能包含完整对话/代码内容，第一版不解析。
- 云账号、团队空间或远程同步。

## 调研结论

本机 Cursor 相关数据位于：

```text
~/.cursor
~/Library/Application Support/Cursor
```

第一版可用的轻量数据库：

```text
~/.cursor/ai-tracking/ai-code-tracking.db
```

关键表：

```sql
ai_code_hashes(hash, source, fileExtension, fileName, requestId, conversationId, timestamp, createdAt, model)
conversation_summaries(conversationId, title, tldr, overview, summaryBullets, model, mode, updatedAt)
ai_deleted_files(gitPath, composerId, conversationId, model, deletedAt)
scored_commits(commitHash, branchName, scoredAt, linesAdded, linesDeleted, tabLinesAdded, tabLinesDeleted, composerLinesAdded, composerLinesDeleted, humanLinesAdded, humanLinesDeleted, blankLinesAdded, blankLinesDeleted, commitMessage, commitDate, v1AiPercentage, v2AiPercentage)
tracked_file_content(gitPath, content, conversationId, model, fileExtension, createdAt)
tracking_state(key, value)
```

隐私边界：

- `tracked_file_content.content` 不读取。
- `conversation_summaries.overview` / `summaryBullets` 只做短摘要，不返回全文。
- `ai_code_hashes.hash` 不展示给前端，只用于稳定事件 ID 的 messageId/index。
- `state.vscdb` 的 `agentKv:*` 暂不读取。

## 标准事件映射

Cursor adapter 输出结构仍使用 `src/core/events.js` 的标准事件：

```js
{
  source: "cursor",
  type: "tool_call",
  timestamp: "2026-05-07T00:00:00.000Z",
  projectId: "cursor",
  sessionId: "cursor-conversation-1",
  messageId: "request-1",
  payload: {}
}
```

### session_activity

来源：

- `conversation_summaries`
- `scored_commits`

用途：

- 为 Cursor session timeline 提供上下文。
- 在 Settings 中展示 commit scoring 元信息。

### assistant_message

来源：

- `conversation_summaries`

映射：

```js
{
  model: row.model || "unknown",
  textSummary: truncate(row.title || row.tldr || row.overview || "")
}
```

### tool_call

来源：

- `ai_code_hashes`，仅纳入 `source !== "human"` 的记录。
- `ai_deleted_files`。

映射：

```js
{
  toolName: row.source || "cursor-ai",
  inputSummary: `${fileName || "unknown"} ${fileExtension || ""}`.trim(),
  fileName,
  fileExtension,
  requestId,
  conversationId,
  model,
  cursorKind: "ai_code_hash"
}
```

删除文件：

```js
{
  toolName: "delete_file",
  inputSummary: gitPath,
  filePath: gitPath,
  conversationId,
  model,
  cursorKind: "ai_deleted_file"
}
```

### model_usage

来源：

- `ai_code_hashes`，仅 `source !== "human"` 且有 `model`。

Cursor tracking DB 没有 token 字段，因此生成 0-token usage 事件，只用于 model response 计数：

```js
{
  model,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreateTokens: 0,
  estimated: false,
  unavailableReason: "cursor_ai_tracking_has_no_token_usage"
}
```

## 配置

新增环境变量：

```bash
CURSOR_DIR=/path/to/.cursor
CURSOR_AI_TRACKING_DB=/path/to/ai-code-tracking.db
```

默认值：

```js
cursorDir = path.join(home, ".cursor")
cursorAiTrackingDb = path.join(cursorDir, "ai-tracking", "ai-code-tracking.db")
```

## 元信息

`loadCursorEvents()` 返回：

```js
{
  events,
  meta: {
    source: "cursor",
    status: "ok" | "warning" | "not_configured",
    cursorDir,
    aiTrackingDb,
    scannedFiles: 1,
    skippedLines: 0,
    errors: [],
    sqlite: {
      available: true,
      aiCodeHashCount: 0,
      conversationSummaryCount: 0,
      deletedFileCount: 0,
      scoredCommitCount: 0,
      trackedFileContentCount: 0
    }
  }
}
```

状态规则：

- DB 文件缺失或路径未配置：`status = "not_configured"`，不返回事件。
- DB 文件存在但部分表缺失、schema 变化或某些查询失败：`status = "warning"`，保留已成功读取的表和可映射事件，并在 `meta.errors` 中记录失败查询。
- DB 文件存在且所有目标查询成功：`status = "ok"`。

## 测试策略

- 测试 fixture 运行时创建 SQLite DB，不提交二进制文件。
- 不依赖用户真实 `~/.cursor`。
- 覆盖缺失 DB、缺表、坏 schema、human 行过滤、无 model 行不生成 model usage、0-token model usage、API source filter。
