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
    if (input) child.stdin.end(input);
  });
}

async function hasSqliteCli() {
  try {
    await runSqlite(["--version"]);
    return true;
  } catch {
    return false;
  }
}

async function createCodexFixtureDb(targetDir) {
  if (!(await hasSqliteCli())) {
    return { skipped: true, reason: "sqlite3 CLI unavailable" };
  }

  fs.mkdirSync(targetDir, { recursive: true });
  const sqlitePath = path.join(targetDir, "state_5.sqlite");
  const sql = `
CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  rollout_path TEXT,
  created_at_ms INTEGER,
  updated_at_ms INTEGER,
  source TEXT,
  model_provider TEXT,
  cwd TEXT,
  title TEXT,
  tokens_used INTEGER,
  model TEXT,
  reasoning_effort TEXT,
  agent_nickname TEXT,
  agent_role TEXT,
  agent_path TEXT,
  git_branch TEXT,
  git_sha TEXT,
  git_origin_url TEXT
);
CREATE TABLE thread_spawn_edges (
  parent_thread_id TEXT,
  child_thread_id TEXT,
  status TEXT
);
CREATE TABLE thread_dynamic_tools (
  thread_id TEXT,
  position INTEGER,
  name TEXT,
  description TEXT,
  input_schema TEXT,
  namespace TEXT,
  defer_loading INTEGER
);

INSERT INTO threads (id, cwd, title, model, model_provider)
VALUES ('codex-parent-session', '/workspace/sample-project', 'Codex parent fixture', 'gpt-5.3-codex', 'openai');
INSERT INTO threads (id, cwd, title, model, model_provider, agent_role, agent_nickname)
VALUES ('codex-child-session', '/workspace/sample-project', 'Codex child fixture', 'gpt-5.3-codex', 'openai', 'explorer', 'Scout');

INSERT INTO thread_spawn_edges (parent_thread_id, child_thread_id, status)
VALUES ('codex-parent-session', 'codex-child-session', 'completed');

INSERT INTO thread_dynamic_tools (thread_id, position, name, namespace, defer_loading)
VALUES ('codex-parent-session', 0, 'exec_command', 'functions', 0);
`;

  await runSqlite([sqlitePath], sql);
  return { skipped: false, path: sqlitePath };
}

module.exports = { createCodexFixtureDb };
