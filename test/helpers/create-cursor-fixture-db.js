const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

function runSqlite(args, input) {
  return new Promise((resolve, reject) => {
    const child = execFile("sqlite3", args, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
    child.stdin.end(input);
  });
}

async function sqliteAvailable() {
  try {
    await runSqlite(["--version"], "");
    return true;
  } catch {
    return false;
  }
}

async function createCursorFixtureDb(targetDir) {
  if (!(await sqliteAvailable())) return { skipped: true, reason: "sqlite3 CLI is not available" };

  const dbDir = path.join(targetDir, "ai-tracking");
  await fs.promises.mkdir(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, "ai-code-tracking.db");

  await runSqlite(
    [dbPath],
    `
CREATE TABLE ai_code_hashes (
  hash TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  fileExtension TEXT,
  fileName TEXT,
  requestId TEXT,
  conversationId TEXT,
  timestamp INTEGER,
  createdAt INTEGER NOT NULL,
  model TEXT
);
CREATE TABLE conversation_summaries (
  conversationId TEXT PRIMARY KEY,
  title TEXT,
  tldr TEXT,
  overview TEXT,
  summaryBullets TEXT,
  model TEXT,
  mode TEXT,
  updatedAt INTEGER NOT NULL
);
CREATE TABLE tracked_file_content (
  gitPath TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  conversationId TEXT,
  model TEXT,
  fileExtension TEXT,
  createdAt INTEGER NOT NULL
);
CREATE TABLE ai_deleted_files (
  gitPath TEXT NOT NULL,
  composerId TEXT,
  conversationId TEXT,
  model TEXT,
  deletedAt INTEGER NOT NULL,
  PRIMARY KEY (gitPath, deletedAt)
);
CREATE TABLE scored_commits (
  commitHash TEXT NOT NULL,
  branchName TEXT NOT NULL,
  scoredAt INTEGER NOT NULL,
  linesAdded INTEGER,
  linesDeleted INTEGER,
  tabLinesAdded INTEGER,
  tabLinesDeleted INTEGER,
  composerLinesAdded INTEGER,
  composerLinesDeleted INTEGER,
  humanLinesAdded INTEGER,
  humanLinesDeleted INTEGER,
  blankLinesAdded INTEGER,
  blankLinesDeleted INTEGER,
  commitMessage TEXT,
  commitDate TEXT,
  v1AiPercentage TEXT,
  v2AiPercentage TEXT,
  PRIMARY KEY (commitHash, branchName)
);
INSERT INTO ai_code_hashes VALUES
  ('hash-1','composer','js','src/app.js','request-1','conversation-1',1778064000000,1778064000000,'claude-4.6-sonnet-medium-thinking'),
  ('hash-2','tab','css','public/styles.css','request-2','conversation-1',1778064060000,1778064060000,'gpt-5.5'),
  ('hash-3','human','md','README.md','request-3','conversation-2',1778064120000,1778064120000,NULL);
INSERT INTO conversation_summaries VALUES
  ('conversation-1','Implement dashboard polish','Updated Cursor UI','Small dashboard changes','["Update UI","Run tests"]','claude-4.6-sonnet-medium-thinking','composer',1778064180000);
INSERT INTO ai_deleted_files VALUES
  ('src/old.js','composer-1','conversation-1','claude-4.6-sonnet-medium-thinking',1778064240000);
INSERT INTO scored_commits VALUES
  ('abc123','main',1778064300000,20,5,3,0,12,2,5,3,0,0,'feat: cursor fixture','2026-05-07T00:25:00.000Z','70','75');
`,
  );

  return { path: dbPath };
}

module.exports = { createCursorFixtureDb };
