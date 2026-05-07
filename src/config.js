const os = require("os");
const path = require("path");

function numberFromEnv(env, key, fallback) {
  const value = env[key];
  if (value == null || value === "") return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getConfig(env = process.env) {
  const home = env.HOME || os.homedir();
  return {
    port: Number.parseInt(env.PORT || "3456", 10),
    claudeDir: env.CLAUDE_DIR || path.join(home, ".claude"),
    codexDir: env.CODEX_DIR || path.join(home, ".codex"),
    codexIncludeArchived: env.CODEX_INCLUDE_ARCHIVED === "true",
    rates: {
      input: numberFromEnv(env, "RATE_INPUT", 5.0) / 1e6,
      output: numberFromEnv(env, "RATE_OUTPUT", 25.0) / 1e6,
      cacheRead: numberFromEnv(env, "RATE_CACHE_READ", 0.5) / 1e6,
      cacheCreate: numberFromEnv(env, "RATE_CACHE_CREATE", 6.25) / 1e6,
    },
  };
}

module.exports = { getConfig };
