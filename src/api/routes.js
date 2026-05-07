const express = require("express");

const {
  aggregateAgents,
  aggregateDailyCosts,
  aggregateModels,
  aggregateOverview,
  aggregateProjects,
  aggregateSessions,
  aggregateTools,
  getAgentDetails,
  getSessionTimeline,
  getToolDetails,
} = require("../core/aggregate");
const { loadClaudeCodeEvents, readHistory, readStats } = require("../sources/claude-code");
const { loadCodexEvents } = require("../sources/codex");

function queryFilters(query) {
  return {
    timeRange: query.range || query.timeRange || "all",
    source: query.source || "all",
    projectId: query.project || query.projectId || "all",
  };
}

function createRoutes(config) {
  const router = express.Router();

  async function eventContext(req) {
    const [claude, codex] = await Promise.all([
      loadClaudeCodeEvents(config.claudeDir),
      loadCodexEvents(config.codexDir, { includeArchived: config.codexIncludeArchived }),
    ]);

    return {
      events: [...claude.events, ...codex.events],
      meta: {
        sources: {
          "claude-code": claude.meta,
          codex: codex.meta,
        },
        scannedFiles: (claude.meta.scannedFiles || 0) + (codex.meta.scannedFiles || 0),
        skippedLines: (claude.meta.skippedLines || 0) + (codex.meta.skippedLines || 0),
        errors: [...(claude.meta.errors || []), ...(codex.meta.errors || [])],
      },
      sourceMeta: { claude, codex },
      filters: queryFilters(req.query),
    };
  }

  function sendError(res, err) {
    res.status(500).json({ error: err.message });
  }

  router.get("/api/stats", (req, res) => {
    const result = readStats(config.claudeDir);
    if (result.error) return res.status(500).json({ error: result.error });
    res.json(result.data);
  });

  router.get("/api/history", (req, res) => {
    const result = readHistory(config.claudeDir);
    if (result.meta.error) return res.status(500).json({ error: result.meta.error });
    res.json(result.data);
  });

  router.get("/api/overview", async (req, res) => {
    try {
      const { events, meta, filters } = await eventContext(req);
      res.json({ data: aggregateOverview(events, config.rates, filters), meta });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get("/api/daily-costs", async (req, res) => {
    try {
      const { events, filters } = await eventContext(req);
      res.json(aggregateDailyCosts(events, config.rates, filters));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get("/api/projects/:projectId", async (req, res) => {
    try {
      const { events, filters } = await eventContext(req);
      const projectId = req.params.projectId;
      const scoped = { ...filters, projectId };
      res.json({
        project: aggregateProjects(events, config.rates, scoped)[0] || null,
        sessions: aggregateSessions(events, config.rates, scoped),
        tools: aggregateTools(events, scoped).tools,
        agents: aggregateAgents(events, config.rates, scoped).agents,
        models: aggregateModels(events, config.rates, scoped).models,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get("/api/projects", async (req, res) => {
    try {
      const { events, filters } = await eventContext(req);
      res.json(
        aggregateProjects(events, config.rates, filters).map((project) => ({
          ...project,
          lastSeen: project.lastActive,
        })),
      );
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get("/api/sessions/:sessionId", async (req, res) => {
    try {
      const { events } = await eventContext(req);
      res.json(getSessionTimeline(events, req.params.sessionId, config.rates));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get("/api/sessions", async (req, res) => {
    try {
      const { events, filters } = await eventContext(req);
      res.json({ sessions: aggregateSessions(events, config.rates, filters) });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get("/api/tool-calls", async (req, res) => {
    try {
      const { events, filters } = await eventContext(req);
      const tools = aggregateTools(events, filters).tools;
      const byProject = {};
      for (const detail of getToolDetails(events, null, filters)) {
        if (!detail.toolName) continue;
        if (!byProject[detail.project]) byProject[detail.project] = {};
        byProject[detail.project][detail.toolName] = (byProject[detail.project][detail.toolName] || 0) + 1;
      }
      res.json({ tools, byProject });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get("/api/tool-details/:toolName", async (req, res) => {
    try {
      const { events, filters } = await eventContext(req);
      res.json(getToolDetails(events, req.params.toolName, filters));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get("/api/tools/:toolName", async (req, res) => {
    try {
      const { events, filters } = await eventContext(req);
      res.json({ details: getToolDetails(events, req.params.toolName, filters) });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get("/api/tools", async (req, res) => {
    try {
      const { events, filters } = await eventContext(req);
      res.json(aggregateTools(events, filters));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get("/api/agents/:agentType", async (req, res) => {
    try {
      const { events, filters } = await eventContext(req);
      res.json(getAgentDetails(events, config.rates, req.params.agentType, filters));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get("/api/agents", async (req, res) => {
    try {
      const { events, filters } = await eventContext(req);
      const data = aggregateAgents(events, config.rates, filters);
      res.json({ ...data, totalAgentCalls: data.summary.totalAgentCalls });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get("/api/models", async (req, res) => {
    try {
      const { events, filters } = await eventContext(req);
      res.json(aggregateModels(events, config.rates, filters));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get("/api/sources", async (req, res) => {
    try {
      const { sourceMeta } = await eventContext(req);
      const { claude, codex } = sourceMeta;
      res.json({
        sources: [
          {
            id: "claude-code",
            name: "Claude Code",
            enabled: true,
            claudeDir: config.claudeDir,
            status: (claude.meta.errors || []).length ? "warning" : "ok",
            meta: claude.meta,
          },
          {
            id: "codex",
            name: "Codex",
            enabled: codex.meta.status === "ok" || codex.meta.status === "warning",
            codexDir: config.codexDir,
            status: codex.meta.status,
            meta: codex.meta,
          },
          {
            id: "cursor",
            name: "Cursor",
            enabled: false,
            claudeDir: null,
            status: "planned",
            meta: {
              source: "cursor",
              scannedFiles: 0,
              skippedLines: 0,
              errors: [],
            },
          },
        ],
        rates: config.rates,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}

module.exports = { createRoutes };
