# AGENTS.md

## 沟通要求

- 所有面向用户的回答必须使用简体中文。
- 回答要直接、务实、信息密度高，避免空泛寒暄。
- 如果涉及代码、命令、路径或配置，优先给出可执行的下一步。

## 项目上下文

本仓库是 `AI Coding Lens`，一个本地优先的 Claude Code 活动分析 dashboard。

当前范围：

- Node.js + Express 后端。
- 原生 HTML/CSS/JavaScript 前端。
- 从本地 `~/.claude` 读取 Claude Code 数据。
- 使用标准事件模型，为未来 Codex/Cursor adapter 预留空间。
- 当前阶段不包含云同步、登录、数据库或团队空间。

## 开发命令

在仓库根目录执行：

```bash
npm install
npm test
npm start
```

应用默认运行在：

```text
http://localhost:3456
```

常用环境变量：

```bash
CLAUDE_DIR=/path/to/.claude
PORT=3456
RATE_INPUT=5.0
RATE_OUTPUT=25.0
RATE_CACHE_READ=0.5
RATE_CACHE_CREATE=6.25
```

## 架构说明

- `server.js` 是 package `bin` 兼容用的可执行 wrapper。
- `src/server.js` 创建并启动 Express app。
- `src/api/routes.js` 暴露旧 API 和 v2 API。
- `src/sources/claude-code.js` 将 Claude Code 文件解析成标准事件。
- `src/core/events.js` 定义标准事件类型和事件构造逻辑。
- `src/core/aggregate.js` 计算 dashboard 汇总和 drill-down 数据。
- `src/core/pricing.js` 计算 cache-aware cost。
- `public/` 存放 tabbed static dashboard。
- `test/fixtures/claude-home/` 存放合成 Claude 数据，用于测试。

## 实现规则

- 保持项目轻量：CommonJS、Express、原生前端。
- 优先使用小而聚焦的模块，不要把逻辑重新堆回 `server.js`。
- 除非有明确迁移说明，否则保留 legacy APIs。
- 自动化测试不得依赖用户真实的 `~/.claude` 数据。
- 使用 Node 内置测试 runner：`node --test`。
- 保持本地优先和隐私友好；未经明确批准，不引入上传、远程同步或云端存储。
- agent 分析中，Claude Code 的 `Agent` tool call 只能视为推断出的 agent event，不能视为可靠因果工作流。

## Git 规则

- 修改前先检查 `git status --short`。
- 不要 revert 用户或他人未明确要求回退的改动。
- commit 应按子系统聚焦。
- 不提交生成缓存、本地 `.env` 或无关的 package-lock 变更。
