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
    events.push(
      makeEvent(EVENT_TYPES.MODEL_USAGE, timestamp, "cursor", session, row.requestId || row.hash, indexBase + 1, {
        model,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreateTokens: 0,
        estimated: false,
        unavailableReason: "cursor_ai_tracking_has_no_token_usage",
      }),
    );
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
