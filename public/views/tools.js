import { api, dateTime, escapeHtml, fmt, renderDetail, table } from "../app.js";

export async function renderTools() {
  const data = await api("/api/tools");
  setTimeout(() => bindToolRows(), 0);
  const rows = data.tools.map((tool) => `
    <tr class="clickable" data-tool-name="${escapeHtml(tool.toolName)}">
      <td><span class="badge">${escapeHtml(tool.toolName)}</span></td>
      <td class="num">${fmt(tool.calls)}</td>
      <td class="num">${fmt(tool.projects)}</td>
      <td class="num">${fmt(tool.sessions)}</td>
      <td>${escapeHtml((tool.inputSummaries || []).slice(0, 2).join(" · "))}</td>
      <td>${dateTime(tool.latestUse)}</td>
    </tr>`);
  return `
    <div class="view-header"><h2>Tools</h2><span class="muted">${fmt(data.tools.length)} tools</span></div>
    <section class="two-col">
      <div class="panel">${table([
        { label: "Tool" }, { label: "Calls", cls: "num" }, { label: "Projects", cls: "num" }, { label: "Sessions", cls: "num" }, { label: "Common Input" }, { label: "Latest" },
      ], rows)}</div>
      <div id="tool-detail" class="panel detail-panel"><h3>Tool Detail</h3><div class="muted">Select a tool.</div></div>
    </section>`;
}

function bindToolRows() {
  document.querySelectorAll("[data-tool-name]").forEach((row) => {
    row.addEventListener("click", () => {
      const toolName = row.dataset.toolName;
      renderDetail("tool-detail", async () => {
        const detail = await api(`/api/tools/${encodeURIComponent(toolName)}`);
        window._lastToolCalls = { toolName, calls: detail.details };
        return `<div class="toolbar"><button class="icon-btn" id="export-tool">Export</button></div><h3>${escapeHtml(toolName)} · ${fmt(detail.details.length)} calls</h3>` +
          detail.details.slice(0, 200).map((call) => `
            <div class="detail-row">
              <div class="code-line">${escapeHtml(call.command || call.file_path || call.pattern || call.inputSummary || "")}</div>
              <div class="detail-meta">${dateTime(call.timestamp)} · ${escapeHtml(call.project || "")}</div>
            </div>`).join("");
      }).then(() => {
        const button = document.getElementById("export-tool");
        if (button) button.addEventListener("click", exportToolCalls);
      });
    });
  });
}

function exportToolCalls() {
  const { toolName, calls } = window._lastToolCalls || {};
  if (!toolName || !calls) return;
  const lines = [`${toolName} - ${calls.length} calls`, "=".repeat(40), ""];
  for (const call of calls) {
    lines.push(call.command || call.file_path || call.pattern || call.inputSummary || "(no input)");
    lines.push(`  [${dateTime(call.timestamp)} · ${call.project}]`);
    lines.push("");
  }
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${toolName.toLowerCase()}-calls.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
