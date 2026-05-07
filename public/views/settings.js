import { api, escapeHtml, fmt, sourceBadge } from "../app.js";

export async function renderSettings() {
  const data = await api("/api/sources");
  const rows = data.sources.map((source) => `
    <tr>
      <td>${sourceBadge(source.id)}</td>
      <td><span class="status-pill ${escapeHtml(source.status)}">${escapeHtml(statusLabel(source))}</span></td>
      <td>${escapeHtml(source.enabled ? "已接入" : "未接入，后续 adapter 预留")}</td>
      <td>${escapeHtml(source.claudeDir || "-")}</td>
      <td class="num">${fmt(source.meta?.scannedFiles || 0)}</td>
      <td class="num">${fmt(source.meta?.skippedLines || 0)}</td>
    </tr>`);
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
  return `<table><thead><tr><th>Source</th><th>Status</th><th>说明</th><th>Data Directory</th><th class="num">Files</th><th class="num">Skipped Lines</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function statusLabel(source) {
  if (source.status === "ok") return "Active";
  if (source.status === "warning") return "Warning";
  if (source.status === "planned") return "Planned";
  return source.status || "-";
}
