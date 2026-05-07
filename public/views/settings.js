import { api, escapeHtml, fmt, sourceBadge, sourceStatusLabel } from "../app.js";

const statusClasses = {
  ok: "ok",
  warning: "warning",
  planned: "planned",
  not_configured: "not-configured",
};

export async function renderSettings() {
  const data = await api("/api/sources");
  const rows = data.sources.map(sourceRow);
  return `
    <div class="view-header"><h2>Settings</h2><span class="muted">Local-only configuration</span></div>
    <section class="grid">
      <div class="panel"><div class="metric-label">Input Rate</div><div class="metric-value">$${(data.rates.input * 1e6).toFixed(2)}/M</div></div>
      <div class="panel"><div class="metric-label">Output Rate</div><div class="metric-value">$${(data.rates.output * 1e6).toFixed(2)}/M</div></div>
      <div class="panel"><div class="metric-label">Cache Read</div><div class="metric-value">$${(data.rates.cacheRead * 1e6).toFixed(2)}/M</div></div>
      <div class="panel"><div class="metric-label">Cache Write</div><div class="metric-value">$${(data.rates.cacheCreate * 1e6).toFixed(2)}/M</div></div>
    </section>
    <div class="panel">${tableMarkup(rows)}</div>`;
}

function tableMarkup(rows) {
  if (!rows.length) return '<div class="empty">No sources configured.</div>';
  return `<div class="table-scroll"><table><thead><tr><th>Source</th><th>Status</th><th>说明</th><th class="path-cell">Data Directory</th><th class="num">Files</th><th class="num">Skipped Lines</th><th>SQLite</th><th class="num">Threads</th><th class="num">Agent Links</th><th class="num">Dynamic Tools</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function sourceRow(source) {
  const sqlite = source.meta?.sqlite;
  return `
    <tr>
      <td>${sourceBadge(source.id)}</td>
      <td><span class="status-pill ${statusClass(source.status)}">${escapeHtml(sourceStatusLabel(source.status))}</span></td>
      <td>${escapeHtml(sourceDescription(source))}</td>
      <td class="path-cell">${escapeHtml(dataDirectory(source))}</td>
      <td class="num">${fmt(source.meta?.scannedFiles ?? 0)}</td>
      <td class="num">${fmt(source.meta?.skippedLines ?? 0)}</td>
      <td>${escapeHtml(sqliteAvailable(sqlite))}</td>
      <td class="num">${sqlite ? fmt(sqlite.threadCount ?? 0) : "-"}</td>
      <td class="num">${sqlite ? fmt(sqlite.spawnEdgeCount ?? 0) : "-"}</td>
      <td class="num">${sqlite ? fmt(sqlite.dynamicToolCount ?? 0) : "-"}</td>
    </tr>`;
}

function statusClass(status) {
  return statusClasses[status] || "";
}

function sourceDescription(source) {
  if (source.enabled) return "Available for filtering";
  if (source.status === "planned") return "Adapter planned";
  if (source.status === "not_configured") return "Directory not configured";
  return "Unavailable";
}

function dataDirectory(source) {
  if (source.id === "claude-code") return source.claudeDir || "-";
  if (source.id === "codex") return source.codexDir || "-";
  return "-";
}

function sqliteAvailable(sqlite) {
  if (!sqlite) return "-";
  return sqlite.available ? "Yes" : "No";
}
