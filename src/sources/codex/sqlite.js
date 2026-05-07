const fs = require("node:fs");
const { execFile } = require("node:child_process");

function emptyState(available, errors = []) {
  return {
    available,
    threads: new Map(),
    spawnEdges: [],
    dynamicTools: [],
    errors,
  };
}

function runSqliteJson(sqlitePath, sql) {
  return new Promise((resolve, reject) => {
    execFile("sqlite3", ["-json", sqlitePath, sql], (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }

      try {
        resolve(stdout.trim() ? JSON.parse(stdout) : []);
      } catch (err) {
        err.stdout = stdout;
        reject(err);
      }
    });
  });
}

async function readCodexState(sqlitePath) {
  if (!fs.existsSync(sqlitePath)) {
    return emptyState(false);
  }

  try {
    const [threadRows, spawnEdges, dynamicTools] = await Promise.all([
      runSqliteJson(sqlitePath, "SELECT * FROM threads;"),
      runSqliteJson(sqlitePath, "SELECT * FROM thread_spawn_edges;"),
      runSqliteJson(
        sqlitePath,
        "SELECT thread_id, position, name, namespace, defer_loading FROM thread_dynamic_tools ORDER BY thread_id, position;",
      ),
    ]);
    const threads = new Map();
    for (const row of threadRows) {
      if (row && row.id) threads.set(row.id, row);
    }

    return {
      available: true,
      threads,
      spawnEdges,
      dynamicTools,
      errors: [],
    };
  } catch (err) {
    return emptyState(false, [
      {
        file: sqlitePath,
        message: err.message,
      },
    ]);
  }
}

module.exports = { readCodexState };
