const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { getConfig } = require("../src/config");

test("getConfig returns default Codex directory and archived flag", () => {
  const config = getConfig({ HOME: "/tmp/home" });
  assert.equal(config.codexDir, path.join("/tmp/home", ".codex"));
  assert.equal(config.codexIncludeArchived, false);
});

test("getConfig reads CODEX_DIR and CODEX_INCLUDE_ARCHIVED", () => {
  const config = getConfig({
    HOME: "/tmp/home",
    CODEX_DIR: "/tmp/custom-codex",
    CODEX_INCLUDE_ARCHIVED: "true",
  });
  assert.equal(config.codexDir, "/tmp/custom-codex");
  assert.equal(config.codexIncludeArchived, true);
});

test("getConfig returns default Cursor directory and ai tracking DB", () => {
  const config = getConfig({ HOME: "/tmp/home" });
  assert.equal(config.cursorDir, path.join("/tmp/home", ".cursor"));
  assert.equal(config.cursorAiTrackingDb, path.join("/tmp/home", ".cursor", "ai-tracking", "ai-code-tracking.db"));
});

test("getConfig reads CURSOR_DIR and CURSOR_AI_TRACKING_DB", () => {
  const config = getConfig({
    HOME: "/tmp/home",
    CURSOR_DIR: "/tmp/custom-cursor",
    CURSOR_AI_TRACKING_DB: "/tmp/custom-cursor/custom.db",
  });
  assert.equal(config.cursorDir, "/tmp/custom-cursor");
  assert.equal(config.cursorAiTrackingDb, "/tmp/custom-cursor/custom.db");
});
