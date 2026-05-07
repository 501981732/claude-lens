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
