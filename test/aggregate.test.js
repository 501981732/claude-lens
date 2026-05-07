const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { loadClaudeCodeEvents } = require("../src/sources/claude-code");
const {
  aggregateAgents,
  aggregateDailyCosts,
  aggregateModels,
  aggregateOverview,
  aggregateProjects,
  aggregateSessions,
  aggregateTools,
  getSessionTimeline,
} = require("../src/core/aggregate");

const fixtureDir = path.join(__dirname, "fixtures", "claude-home");
const rates = { input: 5 / 1e6, output: 25 / 1e6, cacheRead: 0.5 / 1e6, cacheCreate: 6.25 / 1e6 };

async function fixtureEvents() {
  const { events } = await loadClaudeCodeEvents(fixtureDir);
  return events;
}

test("aggregateOverview computes headline metrics", async () => {
  const overview = aggregateOverview(await fixtureEvents(), rates);

  assert.equal(overview.sessions, 2);
  assert.equal(overview.messages, 2);
  assert.equal(overview.toolCalls, 4);
  assert.equal(overview.agentCalls, 1);
  assert.ok(overview.cost > 0);
  assert.equal(overview.topProjects[0].projectId, "sample-project");
});

test("aggregateDailyCosts handles cache tokens and deduped sessions", async () => {
  const daily = aggregateDailyCosts(await fixtureEvents(), rates);

  assert.equal(daily.days.length, 1);
  assert.equal(daily.days[0].sessions, 2);
  assert.equal(daily.days[0].cacheRead, 300);
  assert.equal(daily.days[0].cacheCreate, 150);
  assert.equal(daily.totals.toolCalls, 4);
});

test("aggregateProjects and aggregateSessions summarize fixture data", async () => {
  const events = await fixtureEvents();
  const projects = aggregateProjects(events, rates);
  const sessions = aggregateSessions(events, rates);

  assert.equal(projects[0].projectId, "sample-project");
  assert.equal(projects[0].agentCalls, 1);
  assert.equal(sessions.length, 2);
  assert.equal(sessions.find((session) => session.sessionId === "session-1").agentCalls, 1);
});

test("getSessionTimeline returns chronological session events", async () => {
  const timeline = getSessionTimeline(await fixtureEvents(), "session-1", rates);

  assert.equal(timeline.sessionId, "session-1");
  assert.ok(timeline.events.length > 0);
  assert.equal(timeline.events[0].type, "user_message");
});

test("aggregateTools, aggregateModels, and aggregateAgents expose drilldowns", async () => {
  const events = await fixtureEvents();
  const tools = aggregateTools(events);
  const models = aggregateModels(events, rates);
  const agents = aggregateAgents(events, rates);

  assert.equal(tools.tools.find((tool) => tool.toolName === "Bash").calls, 2);
  assert.equal(models.models.find((model) => model.model === "claude-sonnet-4").responses, 2);
  assert.equal(agents.summary.totalAgentCalls, 1);
  assert.equal(agents.summary.sessionsWithAgents, 1);
  assert.equal(agents.agents[0].agentType, "explorer");
  assert.ok(agents.agents[0].relatedTools.includes("Bash"));
});
