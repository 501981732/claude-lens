import { api, dateTime, duration, escapeHtml, fmt, money, renderDetail, sourceBadge, table } from "../app.js";

export async function renderSessions() {
  const { sessions } = await api("/api/sessions");
  setTimeout(() => bindSessionRows(), 0);
  const rows = sessions.map((session) => `
    <tr class="clickable" data-session-id="${escapeHtml(session.sessionId)}">
      <td>${dateTime(session.startedAt)}</td>
      <td>${sourceBadge(session.source)}</td>
      <td><span class="badge">${escapeHtml(session.projectId)}</span></td>
      <td>${escapeHtml((session.models || []).join(", "))}</td>
      <td class="num">${fmt(session.messages)}</td>
      <td class="num">${fmt(session.toolCalls)}</td>
      <td class="num green">${fmt(session.agentCalls)}</td>
      <td class="num amber">${money(session.cost)}</td>
      <td class="num">${duration(session.durationMs)}</td>
      <td>${escapeHtml(session.lastPromptSummary || "")}</td>
    </tr>`);
  return `
    <div class="view-header"><h2>Sessions</h2><span class="muted">${fmt(sessions.length)} sessions</span></div>
    <section class="two-col">
      <div class="panel">${table([
        { label: "Time" }, { label: "Source" }, { label: "Project" }, { label: "Models" }, { label: "Msgs", cls: "num" }, { label: "Tools", cls: "num" }, { label: "Agents", cls: "num" }, { label: "Cost", cls: "num" }, { label: "Duration", cls: "num" }, { label: "Last Prompt" },
      ], rows)}</div>
      <div id="session-detail" class="panel detail-panel"><h3>Session Detail</h3><div class="muted">Select a session.</div></div>
    </section>`;
}

function bindSessionRows() {
  document.querySelectorAll("[data-session-id]").forEach((row) => {
    row.addEventListener("click", () => {
      const sessionId = row.dataset.sessionId;
      renderDetail("session-detail", async () => {
        const detail = await api(`/api/sessions/${encodeURIComponent(sessionId)}`);
        return `<h3>${escapeHtml(sessionId)} · ${money(detail.cost)}</h3>` + detail.events.map((event) => `
          <div class="detail-row">
            <div class="detail-title">${escapeHtml(event.type)}</div>
            <div>${escapeHtml(event.payload.textSummary || event.payload.inputSummary || event.payload.description || event.payload.model || "")}</div>
            <div class="detail-meta">${dateTime(event.timestamp)} · ${escapeHtml(event.projectId || "")}</div>
          </div>`).join("");
      });
    });
  });
}
