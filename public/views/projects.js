import { api, dateTime, escapeHtml, fmt, money, renderDetail, table, pct } from "../app.js";

export async function renderProjects() {
  const projects = await api("/api/projects");
  setTimeout(() => bindProjectRows(), 0);
  const rows = projects.map((project) => `
    <tr class="clickable" data-project-id="${escapeHtml(project.projectId)}">
      <td><span class="badge">${escapeHtml(project.shortName || project.projectId)}</span><div class="detail-meta">${escapeHtml(project.projectId)}</div></td>
      <td class="num">${fmt(project.sessions)}</td>
      <td class="num">${fmt(project.messages)}</td>
      <td class="num">${fmt(project.toolCalls)}</td>
      <td class="num green">${fmt(project.agentCalls)}</td>
      <td>${escapeHtml(project.topModel || "-")}</td>
      <td class="num green">${pct(project.cacheHit)}</td>
      <td class="num amber">${money(project.cost)}</td>
      <td>${dateTime(project.lastActive)}</td>
    </tr>`);
  return `
    <div class="view-header"><h2>Projects</h2><span class="muted">${fmt(projects.length)} projects</span></div>
    <section class="two-col">
      <div class="panel">${table([
        { label: "Project" }, { label: "Sessions", cls: "num" }, { label: "Msgs", cls: "num" }, { label: "Tools", cls: "num" }, { label: "Agents", cls: "num" }, { label: "Top Model" }, { label: "Cache", cls: "num" }, { label: "Cost", cls: "num" }, { label: "Last Active" },
      ], rows)}</div>
      <div id="project-detail" class="panel detail-panel"><h3>Project Detail</h3><div class="muted">Select a project.</div></div>
    </section>`;
}

function bindProjectRows() {
  document.querySelectorAll("[data-project-id]").forEach((row) => {
    row.addEventListener("click", () => {
      const projectId = row.dataset.projectId;
      renderDetail("project-detail", async () => {
        const detail = await api(`/api/projects/${encodeURIComponent(projectId)}`);
        const project = detail.project;
        if (!project) return "<div class=\"empty\">No project detail found.</div>";
        return `
          <h3>${escapeHtml(project.shortName || project.projectId)}</h3>
          <div class="grid">
            <div>${fmt(project.sessions)} sessions</div>
            <div>${fmt(project.toolCalls)} tools</div>
            <div>${fmt(project.agentCalls)} agents</div>
            <div class="amber">${money(project.cost)}</div>
          </div>
          <h3>Top Tools</h3>${detail.tools.slice(0, 8).map((tool) => `<div class="detail-row">${escapeHtml(tool.toolName)} <span class="muted">${fmt(tool.calls)}</span></div>`).join("")}
          <h3 style="margin-top:16px">Sessions</h3>${detail.sessions.slice(0, 8).map((session) => `<div class="detail-row">${escapeHtml(session.sessionId)} · ${money(session.cost)}<div class="detail-meta">${dateTime(session.startedAt)}</div></div>`).join("")}
        `;
      });
    });
  });
}
