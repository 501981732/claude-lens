import { api, dateTime, escapeHtml, fmt, metric, money, renderDetail, table } from "../app.js";

export async function renderAgents() {
  const data = await api("/api/agents");
  setTimeout(() => bindAgentRows(), 0);
  const rows = data.agents.map((agent) => `
    <tr class="clickable" data-agent-type="${escapeHtml(agent.agentType)}">
      <td><span class="badge">${escapeHtml(agent.agentType)}</span></td>
      <td class="num">${fmt(agent.calls)}</td>
      <td class="num">${fmt(agent.projects)}</td>
      <td class="num">${fmt(agent.sessions)}</td>
      <td>${escapeHtml(agent.relatedTools.join(", "))}</td>
      <td class="num amber">${money(agent.estimatedRelatedCost)}</td>
      <td>${dateTime(agent.latestUse)}</td>
    </tr>`);
  return `
    <div class="view-header"><h2>Agents</h2><span class="muted">Agent calls are inferred from Claude Code Agent tool usage.</span></div>
    <section class="grid">
      ${metric("Agent Calls", fmt(data.summary.totalAgentCalls), "green")}
      ${metric("Sessions With Agents", fmt(data.summary.sessionsWithAgents))}
      ${metric("Top Agent Type", escapeHtml(data.summary.topAgentType || "-"), "blue")}
      ${metric("Agent-Assisted Cost", money(data.summary.agentAssistedCost), "amber")}
      ${metric("Avg Tools After Agent", fmt(data.summary.averageToolsAfterAgent))}
    </section>
    <section class="two-col">
      <div class="panel">${table([
        { label: "Agent Type" }, { label: "Calls", cls: "num" }, { label: "Projects", cls: "num" }, { label: "Sessions", cls: "num" }, { label: "Related Tools" }, { label: "Cost", cls: "num" }, { label: "Last Used" },
      ], rows)}</div>
      <div id="agent-detail" class="panel detail-panel"><h3>Agent Detail</h3><div class="muted">Select an agent type.</div></div>
    </section>`;
}

function bindAgentRows() {
  document.querySelectorAll("[data-agent-type]").forEach((row) => {
    row.addEventListener("click", () => {
      const agentType = row.dataset.agentType;
      renderDetail("agent-detail", async () => {
        const detail = await api(`/api/agents/${encodeURIComponent(agentType)}`);
        if (!detail.agent) return "<div class=\"empty\">No agent detail found.</div>";
        const descriptions = detail.agent.descriptions.map((description) => `<div class="detail-row">${escapeHtml(description)}</div>`).join("");
        const sessions = detail.sessions.map((session) => `
          <div class="detail-row">
            <div class="detail-title">${escapeHtml(session.sessionId)} · ${money(session.cost)}</div>
            <div>${escapeHtml(session.lastPromptSummary || "")}</div>
            <div class="detail-meta">${dateTime(session.startedAt)} · ${escapeHtml(session.projectId)}</div>
          </div>`).join("");
        return `<h3>${escapeHtml(agentType)}</h3><div class="muted">Related tools: ${escapeHtml(detail.agent.relatedTools.join(", ") || "-")}</div><h3 style="margin-top:16px">Descriptions</h3>${descriptions}<h3 style="margin-top:16px">Sessions</h3>${sessions}`;
      });
    });
  });
}
