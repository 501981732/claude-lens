const fs = require("fs");
const path = require("path");
const readline = require("readline");

const { EVENT_TYPES, createEvent } = require("../core/events");

const SOURCE = "claude-code";

function safeReadJson(filePath, fallback) {
  try {
    return { data: JSON.parse(fs.readFileSync(filePath, "utf8")), error: null };
  } catch (err) {
    return { data: fallback, error: err.message };
  }
}

function safeReadJsonl(filePath) {
  try {
    const lines = fs
      .readFileSync(filePath, "utf8")
      .split("\n")
      .filter((line) => line.trim());
    const data = [];
    let skippedLines = 0;
    for (const line of lines) {
      try {
        data.push(JSON.parse(line));
      } catch {
        skippedLines++;
      }
    }
    return { data, skippedLines, error: null };
  } catch (err) {
    return { data: [], skippedLines: 0, error: err.message };
  }
}

function readStats(claudeDir) {
  return safeReadJson(path.join(claudeDir, "stats-cache.json"), {});
}

function readHistory(claudeDir) {
  const result = safeReadJsonl(path.join(claudeDir, "history.jsonl"));
  return {
    data: result.data.map((obj) => ({
      display: obj.display,
      timestamp: normalizeTimestamp(obj.timestamp),
      project: obj.project,
      sessionId: obj.sessionId,
    })),
    meta: { skippedLines: result.skippedLines, error: result.error },
  };
}

function normalizeTimestamp(timestamp) {
  if (!timestamp) return null;
  if (typeof timestamp === "number") return new Date(timestamp).toISOString();
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? String(timestamp) : date.toISOString();
}

function projectIdFromPath(filePath, projectsDir) {
  const relative = path.relative(projectsDir, filePath);
  const first = relative.split(path.sep)[0];
  return first || "unknown";
}

function findJsonlFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findJsonlFiles(fullPath));
    } else if (entry.name.endsWith(".jsonl")) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

function extractTextSummary(content) {
  if (typeof content === "string") return content.slice(0, 240);
  if (!Array.isArray(content)) return "";
  return content
    .filter((item) => item.type === "text" && item.text)
    .map((item) => item.text)
    .join(" ")
    .slice(0, 240);
}

function summarizeToolInput(toolName, input = {}) {
  if (toolName === "Bash") return input.description || input.command || "";
  if (toolName === "Read" || toolName === "Edit" || toolName === "Write") return input.file_path || "";
  if (toolName === "Grep") return input.pattern || "";
  if (toolName === "Glob") return input.pattern || "";
  if (toolName === "Agent") return input.description || "";
  return JSON.stringify(input).slice(0, 240);
}

function toolPayload(item) {
  const input = item.input || {};
  return {
    toolName: item.name || "unknown",
    toolUseId: item.id || "",
    inputSummary: summarizeToolInput(item.name, input),
    filePath: input.file_path || input.path || null,
    command: input.command || null,
    description: input.description || "",
    pattern: input.pattern || "",
    glob: input.glob || "",
    rawInput: input,
  };
}

function eventsFromRecord(obj, filePath, projectsDir, indexBase) {
  const projectId = projectIdFromPath(filePath, projectsDir);
  const sessionId = obj.sessionId || path.basename(filePath, ".jsonl");
  const messageId = obj.uuid || obj.message?.id || `${path.basename(filePath)}-${indexBase}`;
  const timestamp = normalizeTimestamp(obj.timestamp);
  const events = [];
  let index = indexBase * 100;

  if (obj.type === "user") {
    const text = typeof obj.message?.content === "string" ? obj.message.content : extractTextSummary(obj.message?.content);
    events.push(
      createEvent({
        source: SOURCE,
        type: EVENT_TYPES.USER_MESSAGE,
        timestamp,
        projectId,
        sessionId,
        messageId,
        index: index++,
        payload: { textSummary: text.slice(0, 240), cwd: obj.cwd || "" },
      }),
    );
  }

  if (obj.type === "assistant" && obj.message) {
    const content = obj.message.content;
    events.push(
      createEvent({
        source: SOURCE,
        type: EVENT_TYPES.ASSISTANT_MESSAGE,
        timestamp,
        projectId,
        sessionId,
        messageId,
        index: index++,
        payload: {
          model: obj.message.model || "unknown",
          textSummary: extractTextSummary(content),
        },
      }),
    );

    const usage = obj.message.usage || {};
    events.push(
      createEvent({
        source: SOURCE,
        type: EVENT_TYPES.MODEL_USAGE,
        timestamp,
        projectId,
        sessionId,
        messageId,
        index: index++,
        payload: {
          model: obj.message.model || "unknown",
          inputTokens: usage.input_tokens || 0,
          outputTokens: usage.output_tokens || 0,
          cacheReadTokens: usage.cache_read_input_tokens || 0,
          cacheCreateTokens: usage.cache_creation_input_tokens || 0,
        },
      }),
    );

    if (Array.isArray(content)) {
      for (const item of content) {
        if (item.type !== "tool_use") continue;
        const toolEvent = createEvent({
          source: SOURCE,
          type: EVENT_TYPES.TOOL_CALL,
          timestamp,
          projectId,
          sessionId,
          messageId,
          index: index++,
          payload: toolPayload(item),
        });
        events.push(toolEvent);

        if (item.name === "Agent") {
          const input = item.input || {};
          events.push(
            createEvent({
              source: SOURCE,
              type: EVENT_TYPES.AGENT_CALL,
              timestamp,
              projectId,
              sessionId,
              messageId,
              index: index++,
              payload: {
                agentType: input.subagent_type || "unknown",
                description: input.description || "",
                parentSessionId: sessionId,
                relatedToolCallId: toolEvent.id,
              },
            }),
          );
        }
      }
    }
  }

  return events;
}

async function parseJsonlFile(filePath, projectsDir) {
  const events = [];
  let skippedLines = 0;
  let lineNumber = 0;
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    lineNumber++;
    try {
      const obj = JSON.parse(line);
      events.push(...eventsFromRecord(obj, filePath, projectsDir, lineNumber));
    } catch {
      skippedLines++;
    }
  }

  return { events, skippedLines };
}

async function loadClaudeCodeEvents(claudeDir) {
  const projectsDir = path.join(claudeDir, "projects");
  const files = findJsonlFiles(projectsDir);
  const events = [];
  const meta = {
    source: SOURCE,
    scannedFiles: 0,
    skippedLines: 0,
    errors: [],
  };

  for (const file of files) {
    try {
      const parsed = await parseJsonlFile(file, projectsDir);
      events.push(...parsed.events);
      meta.scannedFiles++;
      meta.skippedLines += parsed.skippedLines;
    } catch (err) {
      meta.errors.push({ file, message: err.message });
    }
  }

  return { events, meta };
}

module.exports = {
  SOURCE,
  findJsonlFiles,
  loadClaudeCodeEvents,
  readHistory,
  readStats,
};
