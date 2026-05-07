const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const { EVENT_TYPES, createEvent } = require("../../core/events");
const { parseCodexSessionFile } = require("./jsonl");
const { readCodexState } = require("./sqlite");

const SOURCE = "codex";

function sqliteMeta(state) {
  return {
    available: state.available,
    threadCount: state.threads.size,
    spawnEdgeCount: state.spawnEdges.length,
    dynamicToolCount: state.dynamicTools.length,
  };
}

function baseMeta(codexDir, status, sqlite = { available: false, threadCount: 0, spawnEdgeCount: 0, dynamicToolCount: 0 }) {
  return {
    source: SOURCE,
    status,
    codexDir,
    scannedFiles: 0,
    skippedLines: 0,
    errors: [],
    sqlite,
  };
}

function normalizeFilePath(filePath, codexDir) {
  if (!filePath) return null;
  return path.isAbsolute(filePath) ? filePath : path.join(codexDir, filePath);
}

async function readJsonlMetadata(filePath, idField) {
  const data = {
    count: 0,
    byId: new Map(),
    errors: [],
  };

  if (!fs.existsSync(filePath)) return data;

  try {
    const stream = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        data.count++;
        const id = record && record[idField];
        if (id) data.byId.set(id, record);
      } catch {
        data.errors.push({ file: filePath, message: "Invalid JSONL metadata line" });
      }
    }
  } catch (err) {
    data.errors.push({ file: filePath, message: err.message });
  }

  return data;
}

async function collectJsonlFiles(rootDir, recursive) {
  const files = [];
  if (!fs.existsSync(rootDir)) return files;

  const entries = await fs.promises.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory() && recursive) {
      files.push(...(await collectJsonlFiles(entryPath, recursive)));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(entryPath);
    }
  }

  return files;
}

async function collectSessionFiles(codexDir, state, includeArchived) {
  const files = [];
  const seen = new Set();
  let hasMissingRollout = false;

  for (const thread of state.threads.values()) {
    const rolloutPath = normalizeFilePath(thread.rollout_path, codexDir);
    if (rolloutPath && fs.existsSync(rolloutPath)) {
      const resolved = path.resolve(rolloutPath);
      if (!seen.has(resolved)) {
        files.push({ filePath: rolloutPath, thread });
        seen.add(resolved);
      }
    } else {
      hasMissingRollout = true;
    }
  }

  if (!state.available || hasMissingRollout || files.length === 0) {
    const sessionFiles = await collectJsonlFiles(path.join(codexDir, "sessions"), true);
    for (const filePath of sessionFiles) {
      const resolved = path.resolve(filePath);
      if (!seen.has(resolved)) {
        files.push({ filePath, thread: {} });
        seen.add(resolved);
      }
    }
  }

  if (includeArchived) {
    const archivedFiles = await collectJsonlFiles(path.join(codexDir, "archived_sessions"), false);
    for (const filePath of archivedFiles) {
      const resolved = path.resolve(filePath);
      if (!seen.has(resolved)) {
        files.push({ filePath, thread: {} });
        seen.add(resolved);
      }
    }
  }

  return files;
}

function firstTimestampForSession(events, sessionId) {
  let first = null;
  for (const event of events) {
    if (event.sessionId !== sessionId || !event.timestamp) continue;
    if (!first || event.timestamp < first) first = event.timestamp;
  }
  return first;
}

function timestampFromThread(thread) {
  const value = thread && (thread.updated_at_ms || thread.created_at_ms);
  if (!value) return null;
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function makeAgentCallEvent(edge, state, events) {
  const parent = state.threads.get(edge.parent_thread_id) || {};
  const child = state.threads.get(edge.child_thread_id) || {};
  const timestamp =
    timestampFromThread(child) ||
    timestampFromThread(parent) ||
    firstTimestampForSession(events, edge.child_thread_id) ||
    firstTimestampForSession(events, edge.parent_thread_id) ||
    null;

  return createEvent({
    source: SOURCE,
    type: EVENT_TYPES.AGENT_CALL,
    timestamp,
    projectId: parent.cwd || child.cwd || "unknown",
    sessionId: edge.parent_thread_id,
    messageId: `spawn:${edge.parent_thread_id}:${edge.child_thread_id}`,
    index: 0,
    payload: {
      agentType: child.agent_role || "unknown",
      agentName: child.agent_nickname || "",
      description: child.title || "",
      parentSessionId: edge.parent_thread_id,
      childSessionId: edge.child_thread_id,
      status: edge.status || "unknown",
    },
  });
}

function agentEventsFromSpawnEdges(state, events) {
  const agentEvents = [];
  const seen = new Set();

  for (const edge of state.spawnEdges) {
    if (!edge || !edge.parent_thread_id || !edge.child_thread_id) continue;
    const key = `${edge.parent_thread_id}\0${edge.child_thread_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    agentEvents.push(makeAgentCallEvent(edge, state, events));
  }

  return agentEvents;
}

function sessionIdFromEvents(events) {
  const event = events.find((item) => item.sessionId && item.sessionId !== "unknown");
  return event ? event.sessionId : null;
}

async function loadCodexEvents(codexDir, options = {}) {
  if (!codexDir || !fs.existsSync(codexDir)) {
    return { events: [], meta: baseMeta(codexDir, "not_configured") };
  }

  const state = await readCodexState(path.join(codexDir, "state_5.sqlite"));
  const meta = baseMeta(codexDir, "ok", sqliteMeta(state));
  meta.errors.push(...state.errors);

  const [history, sessionIndex] = await Promise.all([
    readJsonlMetadata(path.join(codexDir, "history.jsonl"), "session_id"),
    readJsonlMetadata(path.join(codexDir, "session_index.jsonl"), "id"),
  ]);
  meta.historyCount = history.count;
  meta.sessionIndexCount = sessionIndex.count;
  meta.sessionTitles = Array.from(sessionIndex.byId.values()).map((record) => ({
    sessionId: record.id,
    title: record.thread_name || record.title || "",
  }));
  meta.errors.push(...history.errors, ...sessionIndex.errors);

  const sessionFiles = await collectSessionFiles(codexDir, state, options.includeArchived === true);
  const events = [];
  const seenSessionIds = new Set();

  for (const { filePath, thread } of sessionFiles) {
    try {
      const result = await parseCodexSessionFile(filePath, {
        thread,
      });
      const parsedSessionId = sessionIdFromEvents(result.events);
      if (options.includeArchived === true && parsedSessionId && seenSessionIds.has(parsedSessionId)) {
        continue;
      }
      if (parsedSessionId) seenSessionIds.add(parsedSessionId);

      meta.scannedFiles++;
      meta.skippedLines += result.meta.skippedLines;
      events.push(...result.events);
    } catch (err) {
      meta.errors.push({ file: filePath, message: err.message });
    }
  }

  events.push(...agentEventsFromSpawnEdges(state, events));
  meta.status = meta.errors.length > 0 ? "warning" : "ok";

  return { events, meta };
}

module.exports = { loadCodexEvents };
