const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const http = require("node:http");

const { createApp } = require("../src/server");

const fixtureDir = path.join(__dirname, "fixtures", "claude-home");
const rates = { input: 5 / 1e6, output: 25 / 1e6, cacheRead: 0.5 / 1e6, cacheCreate: 6.25 / 1e6 };

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

async function withServer(fn) {
  const app = createApp({ claudeDir: fixtureDir, rates });
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
