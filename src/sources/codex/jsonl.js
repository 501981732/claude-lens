const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const { EVENT_TYPES, createEvent } = require("../../core/events");

const SOURCE = "codex";
const SUMMARY_LIMIT = 220;

function normalizeTimestamp(timestamp) {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? String(timestamp) : date.toISOString();
}

function truncate(value, limit = SUMMARY_LIMIT) {
  const text = String(value || "");
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function fallbackSessionId(filePath) {
  return path.basename(filePath, ".jsonl") || "unknown";
}

function getContextState(filePath, context) {
  const thread = context.thread || {};
  return {
    fallbackSessionId: fallbackSessionId(filePath),
    contextThread: thread,
    sessionMeta: {},
    turnContext: {},
  };
}

function currentSessionId(state) {
  return state.contextThread.id || state.sessionMeta.id || state.fallbackSessionId;
}

function currentProjectId(state) {
  return state.sessionMeta.cwd || state.turnContext.cwd || state.contextThread.cwd || "unknown";
}

function currentModel(state) {
  return state.turnContext.model || state.contextThread.model || "unknown";
}

function extractTextSummary(content) {
  if (typeof content === "string") return truncate(content);
  if (!Array.isArray(content)) return "";
  return truncate(
    content
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        if (typeof item.text === "string") return item.text;
        if (typeof item.content === "string") return item.content;
        return "";
      })
      .filter(Boolean)
      .join(" "),
  );
}

function parseJsonObject(value) {
  if (!value || typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function summarizeToolInput(toolName, input) {
  if (!input) return "";
  if (typeof input === "string") return truncate(input);
  if (toolName === "exec_command") return truncate(input.cmd || input.command || "");
  if (toolName === "apply_patch") return truncate(input.patch || input.input || "");
  return truncate(JSON.stringify(input));
}

function toolPayloadFromResponseItem(payload) {
  const toolName = payload.name || "unknown";
  const args = parseJsonObject(payload.arguments);
  const input = args || payload.input || payload.arguments || {};

  return {
    toolName,
    toolUseId: payload.call_id || "",
    callId: payload.call_id || "",
    inputSummary: summarizeToolInput(toolName, input),
    command: args?.cmd || args?.command || null,
    workdir: args?.workdir || null,
    hasOutput: false,
  };
}

function usagePayload(usage, model) {
  const inputTokens = Number(usage.input_tokens || 0);
  const cachedInputTokens = Number(usage.cached_input_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);
  const reasoningOutputTokens = Number(usage.reasoning_output_tokens || 0);

  return {
    model,
    inputTokens: Math.max(inputTokens - cachedInputTokens, 0),
    cacheReadTokens: cachedInputTokens,
    cacheCreateTokens: 0,
    outputTokens: outputTokens + reasoningOutputTokens,
    reasoningOutputTokens,
    totalTokens: Number(usage.total_tokens || 0),
  };
}

function makeEvent(state, type, record, messageId, index, payload = {}) {
  return createEvent({
    source: SOURCE,
    type,
    timestamp: normalizeTimestamp(record.timestamp),
    projectId: currentProjectId(state),
    sessionId: currentSessionId(state),
    messageId,
    index,
    payload,
  });
}

function updateSessionContext(state, record) {
  const payload = record.payload || {};
  if (record.type === "session_meta") {
    state.sessionMeta = { ...state.sessionMeta, ...payload };
  }
  if (record.type === "turn_context") {
    state.turnContext = { ...state.turnContext, ...payload };
  }
}

function eventsFromRecord(record, state, lineNumber, toolEventsByCallId) {
  const events = [];
  const payload = record.payload || {};
  const messageId = payload.call_id || payload.id || `${state.fallbackSessionId}-${lineNumber}`;
  let index = lineNumber * 100;
  const isToolOutput = payload.type === "function_call_output" || payload.type === "custom_tool_call_output";

  if (record.type === "session_meta" || record.type === "turn_context") {
    updateSessionContext(state, record);
    events.push(
      makeEvent(state, EVENT_TYPES.SESSION_ACTIVITY, record, messageId, index++, {
        kind: record.type,
        cwd: payload.cwd || "",
        model: payload.model || currentModel(state),
        modelProvider: payload.model_provider || state.contextThread.model_provider || "",
        title: state.contextThread.title || "",
      }),
    );
    return events;
  }

  if (record.type === "response_item") {
    if (payload.type === "message" && payload.role === "user") {
      events.push(
        makeEvent(state, EVENT_TYPES.USER_MESSAGE, record, messageId, index++, {
          textSummary: extractTextSummary(payload.content),
        }),
      );
    }

    if (payload.type === "message" && payload.role === "assistant") {
      events.push(
        makeEvent(state, EVENT_TYPES.ASSISTANT_MESSAGE, record, messageId, index++, {
          model: currentModel(state),
          textSummary: extractTextSummary(payload.content),
        }),
      );
    }

    if (payload.type === "agent_message") {
      events.push(
        makeEvent(state, EVENT_TYPES.ASSISTANT_MESSAGE, record, messageId, index++, {
          model: currentModel(state),
          textSummary: extractTextSummary(payload.content),
          agent: true,
        }),
      );
    }

    if (payload.type === "function_call" || payload.type === "custom_tool_call") {
      const event = makeEvent(state, EVENT_TYPES.TOOL_CALL, record, messageId, index++, toolPayloadFromResponseItem(payload));
      events.push(event);
      if (payload.call_id) toolEventsByCallId.set(payload.call_id, event);
    }

    if (isToolOutput && payload.call_id) {
      const event = toolEventsByCallId.get(payload.call_id);
      if (event) event.payload.hasOutput = true;
    }
  }

  if (record.type === "event_msg") {
    if (payload.type === "token_count") {
      const usage = payload.info?.last_token_usage;
      if (usage) {
        events.push(makeEvent(state, EVENT_TYPES.MODEL_USAGE, record, messageId, index++, usagePayload(usage, currentModel(state))));
      }
    }

    if (payload.type === "exec_command_end" && payload.call_id) {
      const event = toolEventsByCallId.get(payload.call_id);
      if (event) {
        event.payload.exitCode = payload.exit_code ?? null;
        event.payload.durationMs = payload.duration_ms ?? null;
        event.payload.cwd = payload.cwd || event.payload.workdir || "";
        event.payload.command = payload.cmd || event.payload.command || null;
        event.payload.status = payload.status || "";
      }
    }
  }

  if ((record.type === "function_call_output" || record.type === "custom_tool_call_output") && payload.call_id) {
    const event = toolEventsByCallId.get(payload.call_id);
    if (event) event.payload.hasOutput = true;
  }

  return events;
}

async function parseCodexSessionFile(filePath, context = {}) {
  const events = [];
  const meta = {
    source: SOURCE,
    file: filePath,
    skippedLines: 0,
  };
  const state = getContextState(filePath, context);
  const toolEventsByCallId = new Map();
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let lineNumber = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    lineNumber++;
    try {
      const record = JSON.parse(line);
      events.push(...eventsFromRecord(record, state, lineNumber, toolEventsByCallId));
    } catch {
      meta.skippedLines++;
    }
  }

  return { events, meta };
}

module.exports = { parseCodexSessionFile };
