const test = require("node:test");
const assert = require("node:assert/strict");

const { getConfig } = require("../src/config");
const { calculateCost } = require("../src/core/pricing");

test("getConfig returns default Bedrock-style rates per token", () => {
  const config = getConfig({ HOME: "/tmp/home" });

  assert.equal(config.port, 3456);
  assert.equal(config.claudeDir, "/tmp/home/.claude");
  assert.equal(config.rates.input, 5 / 1e6);
  assert.equal(config.rates.output, 25 / 1e6);
  assert.equal(config.rates.cacheRead, 0.5 / 1e6);
  assert.equal(config.rates.cacheCreate, 6.25 / 1e6);
});

test("calculateCost applies cache-aware rates", () => {
  const cost = calculateCost(
    { input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000, cacheCreate: 1_000_000 },
    { input: 5 / 1e6, output: 25 / 1e6, cacheRead: 0.5 / 1e6, cacheCreate: 6.25 / 1e6 },
  );

  assert.equal(cost, 36.75);
});
