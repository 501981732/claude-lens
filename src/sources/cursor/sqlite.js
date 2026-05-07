const fs = require("node:fs");
const { execFile } = require("node:child_process");

function emptyCounts() {
  return {
    aiCodeHashCount: 0,
    conversationSummaryCount: 0,
    deletedFileCount: 0,
    scoredCommitCount: 0,
    trackedFileContentCount: 0,
  };
}

function emptyState(available = false, errors = []) {
  return {
    available,
    partial: false,
    aiCodeHashes: [],
    conversationSummaries: [],
    deletedFiles: [],
    scoredCommits: [],
    counts: emptyCounts(),
    errors,
  };
}

function runSqliteJson(dbPath, sql) {
  return new Promise((resolve, reject) => {
    execFile("sqlite3", ["-json", dbPath, sql], (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      try {
        resolve(stdout.trim() ? JSON.parse(stdout) : []);
      } catch (err) {
        err.stderr = stdout;
        reject(err);
      }
    });
  });
}

async function safeQuery(dbPath, sql, errors) {
  try {
    return await runSqliteJson(dbPath, sql);
  } catch (err) {
    errors.push({ file: dbPath, message: err.message });
    return [];
  }
}

async function readCursorAiTracking(dbPath) {
  if (!dbPath || !fs.existsSync(dbPath)) {
    return emptyState(false, [{ file: dbPath, message: "Cursor AI tracking DB not found" }]);
  }

  const errors = [];
  const [aiCodeHashes, conversationSummaries, deletedFiles, scoredCommits, trackedFileContentCount] = await Promise.all([
    safeQuery(
      dbPath,
      "SELECT hash, source, fileExtension, fileName, requestId, conversationId, timestamp, createdAt, model FROM ai_code_hashes ORDER BY createdAt, hash",
      errors,
    ),
    safeQuery(
      dbPath,
      "SELECT conversationId, title, tldr, overview, summaryBullets, model, mode, updatedAt FROM conversation_summaries ORDER BY updatedAt, conversationId",
      errors,
    ),
    safeQuery(
      dbPath,
      "SELECT gitPath, composerId, conversationId, model, deletedAt FROM ai_deleted_files ORDER BY deletedAt, gitPath",
      errors,
    ),
    safeQuery(
      dbPath,
      "SELECT commitHash, branchName, scoredAt, linesAdded, linesDeleted, tabLinesAdded, tabLinesDeleted, composerLinesAdded, composerLinesDeleted, humanLinesAdded, humanLinesDeleted, blankLinesAdded, blankLinesDeleted, commitMessage, commitDate, v1AiPercentage, v2AiPercentage FROM scored_commits ORDER BY scoredAt, commitHash",
      errors,
    ),
    safeQuery(dbPath, "SELECT count(*) AS count FROM tracked_file_content", errors),
  ]);

  return {
    available: true,
    partial: errors.length > 0,
    aiCodeHashes,
    conversationSummaries,
    deletedFiles,
    scoredCommits,
    counts: {
      aiCodeHashCount: aiCodeHashes.length,
      conversationSummaryCount: conversationSummaries.length,
      deletedFileCount: deletedFiles.length,
      scoredCommitCount: scoredCommits.length,
      trackedFileContentCount: trackedFileContentCount[0]?.count || 0,
    },
    errors,
  };
}

module.exports = { readCursorAiTracking };
