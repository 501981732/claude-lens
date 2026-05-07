import { api, dateTime, escapeHtml, fmt, metric, money, pct, sourceBadge, table } from "../app.js";

export async function renderOverview() {
  const [overviewResponse, daily, sources] = await Promise.all([api("/api/overview"), api("/api/daily-costs"), api("/api/sources")]);
  const data = overviewResponse.data;
  const sourceSummary = sources.sources.map((source) => sourceBadge(source.id, source.enabled ? "Active" : "Planned")).join(" ");
  const projectRows = table(
    [{ label: "Source" }, { label: "Project" }, { label: "Cost", cls: "num" }, { label: "Sessions", cls: "num" }, { label: "Agents", cls: "num" }],
    data.topProjects.map((project) => `
      <tr>
        <td>${sourceBadge(project.source)}</td>
        <td><span class="badge">${escapeHtml(project.shortName || project.projectId)}</span></td>
        <td class="num amber">${money(project.cost)}</td>
        <td class="num">${fmt(project.sessions)}</td>
        <td class="num">${fmt(project.agentCalls)}</td>
      </tr>`),
  );
  const sessionRows = table(
    [{ label: "Started" }, { label: "Project" }, { label: "Cost", cls: "num" }, { label: "Prompt" }],
    data.recentExpensiveSessions.map((session) => `
      <tr>
        <td>${dateTime(session.startedAt)}</td>
        <td><span class="badge">${escapeHtml(session.projectId)}</span></td>
        <td class="num amber">${money(session.cost)}</td>
        <td>${escapeHtml(session.lastPromptSummary || "")}</td>
      </tr>`),
  );
  const days = daily.days || [];
  const dailyRows = table(
    [{ label: "Date" }, { label: "Cost", cls: "num" }, { label: "Msgs", cls: "num" }, { label: "Tools", cls: "num" }, { label: "Agents", cls: "num" }, { label: "Cache", cls: "num" }],
    days.slice(-14).reverse().map((day) => {
      const allInput = day.input + day.cacheRead + day.cacheCreate;
      const hit = allInput ? (day.cacheRead / allInput) * 100 : 0;
      return `
        <tr>
          <td>${day.date}</td>
          <td class="num amber">${money(day.cost)}</td>
          <td class="num">${fmt(day.messages)}</td>
          <td class="num">${fmt(day.toolCalls)}</td>
          <td class="num">${fmt(day.agentCalls)}</td>
          <td class="num green">${pct(hit)}</td>
        </tr>`;
    }),
  );

  return `
    <div class="view-header"><h2>Overview</h2><span class="muted">Scanned ${fmt(overviewResponse.meta.scannedFiles)} files · skipped ${fmt(overviewResponse.meta.skippedLines)} bad lines</span></div>
    <div class="panel source-strip"><span class="metric-label">Sources</span><span>${sourceSummary}</span></div>
    <section class="grid">
      ${metric("Estimated Cost", money(data.cost), "amber")}
      ${metric("Sessions", fmt(data.sessions))}
      ${metric("Messages", fmt(data.messages))}
      ${metric("Tool Calls", fmt(data.toolCalls), "blue")}
      ${metric("Agent Calls", fmt(data.agentCalls), "green")}
      ${metric("Cache Hit", pct(data.cacheHit), "green")}
    </section>
    <section class="two-col">
      <div class="panel"><h3>Daily Cost & Cache</h3>${dailyRows}</div>
      <div>
        <div class="panel"><h3>Top Projects</h3>${projectRows}</div>
        <div class="panel" style="margin-top:16px"><h3>Recent Expensive Sessions</h3>${sessionRows}</div>
      </div>
    </section>
  `;
}
