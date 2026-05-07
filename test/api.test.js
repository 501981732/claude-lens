const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");

const { createApp } = require("../src/server");
const { createCodexFixtureDb } = require("./helpers/create-codex-fixture-db");
const { createCursorFixtureDb } = require("./helpers/create-cursor-fixture-db");

const claudeFixtureDir = path.join(__dirname, "fixtures", "claude-home");
const codexFixtureDir = path.join(__dirname, "fixtures", "codex-home");
const rates = { input: 5 / 1e6, output: 25 / 1e6, cacheRead: 0.5 / 1e6, cacheCreate: 6.25 / 1e6 };
const config = {
  claudeDir: claudeFixtureDir,
  codexDir: codexFixtureDir,
  codexIncludeArchived: false,
  cursorDir: path.join(__dirname, "fixtures", "cursor-home"),
  cursorAiTrackingDb: path.join(__dirname, "fixtures", "cursor-home", "ai-tracking", "ai-code-tracking.db"),
  rates,
};

function request(server, pathname) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    http
      .get({ hostname: "127.0.0.1", port, path: pathname }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({ statusCode: res.statusCode, body: body ? JSON.parse(body) : null });
        });
      })
      .on("error", reject);
  });
}

async function withServer(fn, overrides = {}) {
  const app = createApp({ ...config, ...overrides });
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    return await fn(server);
  } finally {
    server.close();
  }
}

test("v2 API endpoints return fixture-backed data", async () => {
  await withServer(async (server) => {
    for (const pathname of ["/api/overview", "/api/sessions", "/api/agents", "/api/models", "/api/sources"]) {
      const response = await request(server, pathname);
      assert.equal(response.statusCode, 200, pathname);
      assert.ok(response.body);
    }
  });
});

test("legacy API endpoints remain available", async () => {
  await withServer(async (server) => {
    for (const pathname of ["/api/stats", "/api/history", "/api/tool-calls", "/api/tool-details/Bash", "/api/projects", "/api/daily-costs"]) {
      const response = await request(server, pathname);
      assert.equal(response.statusCode, 200, pathname);
      assert.ok(response.body);
    }
  });
});

test("GET /api/sources reports Codex as active when fixture exists", async () => {
  await withServer(async (server) => {
    const response = await request(server, "/api/sources");
    const codex = response.body.sources.find((source) => source.id === "codex");
    assert.equal(codex.enabled, true);
    assert.equal(codex.status, "ok");
    assert.equal(codex.codexDir, codexFixtureDir);
  });
});

test("GET /api/overview supports source=codex", async () => {
  await withServer(async (server) => {
    const response = await request(server, "/api/overview?source=codex");
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.data.sessions >= 1);
    assert.ok(response.body.data.toolCalls >= 1);
  });
});

test("GET /api/overview?source=codex ignores broken Claude source", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claude-lens-broken-claude-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.writeFileSync(path.join(tmp, "projects"), "not a directory");

  await withServer(async (server) => {
    const response = await request(server, "/api/overview?source=codex");
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.data.sessions >= 1);
    assert.ok(response.body.data.toolCalls >= 1);
  }, { claudeDir: tmp });
});

test("GET /api/overview keeps compatible source meta", async () => {
  await withServer(async (server) => {
    const response = await request(server, "/api/overview");
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.meta.source, "all");
    assert.equal(typeof response.body.meta.scannedFiles, "number");
    assert.equal(typeof response.body.meta.skippedLines, "number");
    assert.ok(Array.isArray(response.body.meta.errors));
    assert.ok(response.body.meta.sources.codex);
  });
});

test("GET /api/agents supports source=codex", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claude-lens-codex-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.cpSync(codexFixtureDir, tmp, { recursive: true });
  const db = await createCodexFixtureDb(tmp);
  if (db.skipped) return t.skip(db.reason);

  await withServer(async (server) => {
    const response = await request(server, "/api/agents?source=codex");
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.totalAgentCalls >= 1);
  }, { codexDir: tmp });
});

test("GET /api/sources reports Cursor as active when fixture DB exists", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claude-lens-cursor-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const created = await createCursorFixtureDb(tmp);
  if (created.skipped) return t.skip(created.reason);

  await withServer(
    async (server) => {
      const response = await request(server, "/api/sources");
      const cursor = response.body.sources.find((source) => source.id === "cursor");
      assert.equal(cursor.enabled, true);
      assert.equal(cursor.status, "ok");
      assert.equal(cursor.cursorDir, tmp);
      assert.equal(cursor.aiTrackingDb, created.path);
    },
    { cursorDir: tmp, cursorAiTrackingDb: created.path },
  );
});

test("GET /api/overview supports source=cursor", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claude-lens-cursor-overview-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const created = await createCursorFixtureDb(tmp);
  if (created.skipped) return t.skip(created.reason);

  await withServer(
    async (server) => {
      const response = await request(server, "/api/overview?source=cursor");
      assert.equal(response.statusCode, 200);
      assert.equal(response.body.data.toolCalls, 3);
      assert.equal(response.body.data.cost, 0);
      assert.equal(response.body.meta.sources.cursor.status, "ok");
    },
    { cursorDir: tmp, cursorAiTrackingDb: created.path },
  );
});
