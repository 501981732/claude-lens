const { EVENT_TYPES } = require("./events");
const { calculateCost, roundMoney } = require("./pricing");

function byTimestamp(a, b) {
  return String(a.timestamp || "").localeCompare(String(b.timestamp || ""));
}

function shortProject(projectId) {
  return String(projectId || "unknown").split(/[\\/]/).filter(Boolean).pop() || "unknown";
}

function applyFilters(events, filters = {}) {
  const now = filters.now ? new Date(filters.now) : new Date();
  const start = timeRangeStart(filters.timeRange, now);
  return events.filter((event) => {
    if (filters.source && filters.source !== "all" && event.source !== filters.source) return false;
    if (filters.projectId && filters.projectId !== "all" && event.projectId !== filters.projectId) return false;
    if (start && event.timestamp && new Date(event.timestamp) < start) return false;
    return true;
  });
}

function timeRangeStart(range, now) {
  if (!range || range === "all") return null;
  const start = new Date(now);
  if (range === "today") {
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (range === "7d") {
    start.setDate(start.getDate() - 7);
    return start;
  }
  if (range === "30d") {
    start.setDate(start.getDate() - 30);
    return start;
  }
  return null;
}

function emptyUsage() {
  return { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
}

function addUsage(target, usagePayload = {}) {
  target.input += usagePayload.inputTokens || 0;
  target.output += usagePayload.outputTokens || 0;
  target.cacheRead += usagePayload.cacheReadTokens || 0;
  target.cacheCreate += usagePayload.cacheCreateTokens || 0;
}

function usageFromEvents(events) {
  const usage = emptyUsage();
  for (const event of events) {
    if (event.type === EVENT_TYPES.MODEL_USAGE) addUsage(usage, event.payload);
  }
  return usage;
}

function cacheHit(usage) {
  const allInput = usage.input + usage.cacheRead + usage.cacheCreate;
  return allInput > 0 ? (usage.cacheRead / allInput) * 100 : 0;
}

function aggregateOverview(events, rates, filters = {}) {
  const filtered = applyFilters(events, filters);
  const sessions = aggregateSessions(filtered, rates);
  const projects = aggregateProjects(filtered, rates);
  const usage = usageFromEvents(filtered);
  const recentExpensiveSessions = [...sessions].sort((a, b) => b.cost - a.cost).slice(0, 5);
  const topModels = aggregateModels(filtered, rates).models.slice(0, 5);

  return {
    sessions: sessions.length,
    messages: filtered.filter((event) => event.type === EVENT_TYPES.USER_MESSAGE).length,
    toolCalls: filtered.filter((event) => event.type === EVENT_TYPES.TOOL_CALL).length,
    agentCalls: filtered.filter((event) => event.type === EVENT_TYPES.AGENT_CALL).length,
    cost: calculateCost(usage, rates),
    cacheHit: cacheHit(usage),
    topModels,
    topProjects: projects.slice(0, 5),
    recentExpensiveSessions,
  };
}

function aggregateDailyCosts(events, rates, filters = {}) {
  const daily = new Map();
  for (const event of applyFilters(events, filters)) {
    if (!event.timestamp) continue;
    const day = String(event.timestamp).slice(0, 10);
    if (!daily.has(day)) {
      daily.set(day, {
        date: day,
        messages: 0,
        toolCalls: 0,
        agentCalls: 0,
        sessionsSet: new Set(),
        usage: emptyUsage(),
        models: {},
      });
    }
    const entry = daily.get(day);
    if (event.sessionId) entry.sessionsSet.add(event.sessionId);
    if (event.type === EVENT_TYPES.USER_MESSAGE) entry.messages++;
    if (event.type === EVENT_TYPES.TOOL_CALL) entry.toolCalls++;
    if (event.type === EVENT_TYPES.AGENT_CALL) entry.agentCalls++;
    if (event.type === EVENT_TYPES.MODEL_USAGE) {
      addUsage(entry.usage, event.payload);
      const model = event.payload.model || "unknown";
      entry.models[model] = (entry.models[model] || 0) + 1;
    }
  }

  const days = [...daily.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => formatUsageRow(entry, rates));
  const totals = days.reduce(
    (acc, day) => {
      acc.messages += day.messages;
      acc.toolCalls += day.toolCalls;
      acc.agentCalls += day.agentCalls;
      acc.sessions += day.sessions;
      acc.input += day.input;
      acc.output += day.output;
      acc.cacheRead += day.cacheRead;
      acc.cacheCreate += day.cacheCreate;
      acc.cost += day.cost;
      for (const [model, count] of Object.entries(day.models || {})) {
        acc.models[model] = (acc.models[model] || 0) + count;
      }
      return acc;
    },
    { messages: 0, toolCalls: 0, agentCalls: 0, sessions: 0, input: 0, output: 0, cacheRead: 0, cacheCreate: 0, cost: 0, models: {} },
  );
  totals.cost = roundMoney(totals.cost);
  return { days, totals, rates };
}

function formatUsageRow(entry, rates) {
  const usage = entry.usage;
  return {
    date: entry.date,
    messages: entry.messages,
    toolCalls: entry.toolCalls,
    agentCalls: entry.agentCalls,
    sessions: entry.sessionsSet.size,
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheCreate: usage.cacheCreate,
    cost: calculateCost(usage, rates),
    models: entry.models,
  };
}

function aggregateProjects(events, rates, filters = {}) {
  const projects = new Map();
  for (const event of applyFilters(events, filters)) {
    const projectId = event.projectId || "unknown";
    if (!projects.has(projectId)) {
      projects.set(projectId, {
        projectId,
        name: projectId,
        shortName: shortProject(projectId),
        source: event.source,
        sessionsSet: new Set(),
        messages: 0,
        toolCalls: 0,
        agentCalls: 0,
        usage: emptyUsage(),
        models: {},
        firstSeen: null,
        lastActive: null,
      });
    }
    const project = projects.get(projectId);
    if (event.sessionId) project.sessionsSet.add(event.sessionId);
    if (event.timestamp && (!project.firstSeen || event.timestamp < project.firstSeen)) project.firstSeen = event.timestamp;
    if (event.timestamp && (!project.lastActive || event.timestamp > project.lastActive)) project.lastActive = event.timestamp;
    if (event.type === EVENT_TYPES.USER_MESSAGE) project.messages++;
    if (event.type === EVENT_TYPES.TOOL_CALL) project.toolCalls++;
    if (event.type === EVENT_TYPES.AGENT_CALL) project.agentCalls++;
    if (event.type === EVENT_TYPES.MODEL_USAGE) {
      addUsage(project.usage, event.payload);
      const model = event.payload.model || "unknown";
      project.models[model] = (project.models[model] || 0) + 1;
    }
  }
  return [...projects.values()]
    .map((project) => ({
      projectId: project.projectId,
      name: project.name,
      shortName: project.shortName,
      source: project.source,
      sessions: project.sessionsSet.size,
      messages: project.messages,
      toolCalls: project.toolCalls,
      agentCalls: project.agentCalls,
      cost: calculateCost(project.usage, rates),
      cacheHit: cacheHit(project.usage),
      topModel: topKey(project.models),
      firstSeen: project.firstSeen,
      lastActive: project.lastActive,
    }))
    .sort((a, b) => b.cost - a.cost || b.messages - a.messages);
}

function aggregateSessions(events, rates, filters = {}) {
  const sessions = new Map();
  for (const event of applyFilters(events, filters)) {
    const sessionId = event.sessionId || "unknown";
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        sessionId,
        source: event.source,
        projectId: event.projectId,
        startedAt: null,
        endedAt: null,
        messages: 0,
        toolCalls: 0,
        agentCalls: 0,
        usage: emptyUsage(),
        models: {},
        lastPromptSummary: "",
      });
    }
    const session = sessions.get(sessionId);
    if (event.timestamp && (!session.startedAt || event.timestamp < session.startedAt)) session.startedAt = event.timestamp;
    if (event.timestamp && (!session.endedAt || event.timestamp > session.endedAt)) session.endedAt = event.timestamp;
    if (event.type === EVENT_TYPES.USER_MESSAGE) {
      session.messages++;
      session.lastPromptSummary = event.payload.textSummary || session.lastPromptSummary;
    }
    if (event.type === EVENT_TYPES.TOOL_CALL) session.toolCalls++;
    if (event.type === EVENT_TYPES.AGENT_CALL) session.agentCalls++;
    if (event.type === EVENT_TYPES.MODEL_USAGE) {
      addUsage(session.usage, event.payload);
      const model = event.payload.model || "unknown";
      session.models[model] = (session.models[model] || 0) + 1;
    }
  }
  return [...sessions.values()]
    .map((session) => ({
      sessionId: session.sessionId,
      source: session.source,
      projectId: session.projectId,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationMs: durationMs(session.startedAt, session.endedAt),
      messages: session.messages,
      toolCalls: session.toolCalls,
      agentCalls: session.agentCalls,
      models: Object.keys(session.models),
      cost: calculateCost(session.usage, rates),
      usage: session.usage,
      lastPromptSummary: session.lastPromptSummary,
    }))
    .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
}

function getSessionTimeline(events, sessionId, rates = {}) {
  const sessionEvents = events.filter((event) => event.sessionId === sessionId).sort(byTimestamp);
  const usage = usageFromEvents(sessionEvents);
  return {
    sessionId,
    cost: calculateCost(usage, rates),
    events: sessionEvents.map((event) => ({
      id: event.id,
      type: event.type,
      timestamp: event.timestamp,
      projectId: event.projectId,
      payload: event.payload,
    })),
  };
}

function aggregateTools(events, filters = {}) {
  const tools = new Map();
  for (const event of applyFilters(events, filters)) {
    if (event.type !== EVENT_TYPES.TOOL_CALL) continue;
    const toolName = event.payload.toolName || "unknown";
    if (!tools.has(toolName)) {
      tools.set(toolName, { toolName, calls: 0, projects: new Set(), sessions: new Set(), latestUse: null, inputSummaries: [] });
    }
    const tool = tools.get(toolName);
    tool.calls++;
    tool.projects.add(event.projectId);
    tool.sessions.add(event.sessionId);
    if (event.payload.inputSummary) tool.inputSummaries.push(event.payload.inputSummary);
    if (event.timestamp && (!tool.latestUse || event.timestamp > tool.latestUse)) tool.latestUse = event.timestamp;
  }
  return {
    tools: [...tools.values()]
      .map((tool) => ({
        toolName: tool.toolName,
        tool: tool.toolName,
        calls: tool.calls,
        count: tool.calls,
        projects: tool.projects.size,
        sessions: tool.sessions.size,
        latestUse: tool.latestUse,
        inputSummaries: tool.inputSummaries.slice(0, 5),
      }))
      .sort((a, b) => b.calls - a.calls),
  };
}

function getToolDetails(events, toolName, filters = {}) {
  return applyFilters(events, filters)
    .filter((event) => event.type === EVENT_TYPES.TOOL_CALL && (!toolName || event.payload.toolName === toolName))
    .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")))
    .map((event) => ({
      id: event.id,
      project: event.projectId,
      sessionId: event.sessionId,
      timestamp: event.timestamp,
      ...event.payload,
      command: event.payload.command || "",
      file_path: event.payload.filePath || "",
      subagent_type: event.payload.rawInput?.subagent_type || "",
    }));
}

function aggregateModels(events, rates, filters = {}) {
  const models = new Map();
  for (const event of applyFilters(events, filters)) {
    if (event.type !== EVENT_TYPES.MODEL_USAGE) continue;
    const model = event.payload.model || "unknown";
    if (!models.has(model)) {
      models.set(model, { model, responses: 0, usage: emptyUsage(), projects: new Set(), sessions: new Set() });
    }
    const entry = models.get(model);
    entry.responses++;
    addUsage(entry.usage, event.payload);
    entry.projects.add(event.projectId);
    entry.sessions.add(event.sessionId);
  }
  return {
    models: [...models.values()]
      .map((entry) => ({
        model: entry.model,
        responses: entry.responses,
        input: entry.usage.input,
        output: entry.usage.output,
        cacheRead: entry.usage.cacheRead,
        cacheCreate: entry.usage.cacheCreate,
        cost: calculateCost(entry.usage, rates),
        projects: entry.projects.size,
        sessions: entry.sessions.size,
        averageOutputTokens: entry.responses ? Math.round(entry.usage.output / entry.responses) : 0,
        cacheHit: cacheHit(entry.usage),
      }))
      .sort((a, b) => b.cost - a.cost || b.responses - a.responses),
  };
}

function aggregateAgents(events, rates, filters = {}) {
  const filtered = applyFilters(events, filters).sort(byTimestamp);
  const sessions = aggregateSessions(filtered, rates);
  const agentSessions = new Set(filtered.filter((event) => event.type === EVENT_TYPES.AGENT_CALL).map((event) => event.sessionId));
  const sessionCostById = new Map(sessions.map((session) => [session.sessionId, session.cost]));
  const agents = new Map();
  const agentEvents = filtered.filter((event) => event.type === EVENT_TYPES.AGENT_CALL);

  for (const event of agentEvents) {
    const agentType = event.payload.agentType || "unknown";
    if (!agents.has(agentType)) {
      agents.set(agentType, {
        agentType,
        calls: 0,
        projects: new Set(),
        sessions: new Set(),
        relatedTools: new Map(),
        latestUse: null,
        descriptions: [],
      });
    }
    const agent = agents.get(agentType);
    agent.calls++;
    agent.projects.add(event.projectId);
    agent.sessions.add(event.sessionId);
    if (event.payload.description) agent.descriptions.push(event.payload.description);
    if (event.timestamp && (!agent.latestUse || event.timestamp > agent.latestUse)) agent.latestUse = event.timestamp;
    for (const tool of followUpTools(filtered, event)) {
      agent.relatedTools.set(tool, (agent.relatedTools.get(tool) || 0) + 1);
    }
  }

  const agentRows = [...agents.values()]
    .map((agent) => {
      const relatedCost = [...agent.sessions].reduce((sum, sessionId) => sum + (sessionCostById.get(sessionId) || 0), 0);
      return {
        agentType: agent.agentType,
        calls: agent.calls,
        projects: agent.projects.size,
        sessions: agent.sessions.size,
        relatedTools: [...agent.relatedTools.entries()].sort((a, b) => b[1] - a[1]).map(([tool]) => tool),
        relatedToolCounts: Object.fromEntries(agent.relatedTools),
        estimatedRelatedCost: roundMoney(relatedCost),
        latestUse: agent.latestUse,
        descriptions: agent.descriptions.slice(0, 10),
      };
    })
    .sort((a, b) => b.calls - a.calls);

  const totalFollowUpTools = agentRows.reduce((sum, agent) => sum + Object.values(agent.relatedToolCounts).reduce((a, b) => a + b, 0), 0);
  const agentAssistedCost = [...agentSessions].reduce((sum, sessionId) => sum + (sessionCostById.get(sessionId) || 0), 0);
  return {
    summary: {
      totalAgentCalls: agentEvents.length,
      sessionsWithAgents: agentSessions.size,
      agentAssistedCost: roundMoney(agentAssistedCost),
      averageToolsAfterAgent: agentEvents.length ? Math.round((totalFollowUpTools / agentEvents.length) * 10) / 10 : 0,
      topAgentType: agentRows[0]?.agentType || null,
    },
    agents: agentRows,
    sessions: sessions.filter((session) => agentSessions.has(session.sessionId)),
  };
}

function getAgentDetails(events, rates, agentType, filters = {}) {
  const agents = aggregateAgents(events, rates, filters);
  return {
    summary: agents.summary,
    agent: agents.agents.find((agent) => agent.agentType === agentType) || null,
    sessions: agents.sessions.filter((session) =>
      events.some((event) => event.sessionId === session.sessionId && event.type === EVENT_TYPES.AGENT_CALL && (event.payload.agentType || "unknown") === agentType),
    ),
  };
}

function followUpTools(events, agentEvent) {
  const index = events.findIndex((event) => event.id === agentEvent.id);
  if (index === -1) return [];
  return events
    .slice(index + 1)
    .filter((event) => event.sessionId === agentEvent.sessionId)
    .slice(0, 10)
    .filter((event) => event.type === EVENT_TYPES.TOOL_CALL)
    .map((event) => event.payload.toolName || "unknown");
}

function topKey(counts) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function durationMs(startedAt, endedAt) {
  if (!startedAt || !endedAt) return 0;
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
}

module.exports = {
  aggregateAgents,
  aggregateDailyCosts,
  aggregateModels,
  aggregateOverview,
  aggregateProjects,
  aggregateSessions,
  aggregateTools,
  applyFilters,
  getAgentDetails,
  getSessionTimeline,
  getToolDetails,
};
