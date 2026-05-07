import { api, escapeHtml, fmt, money, pct, table } from "../app.js";

export async function renderModels() {
  const data = await api("/api/models");
  const rows = data.models.map((model) => `
    <tr>
      <td><span class="badge">${escapeHtml(model.model)}</span></td>
      <td class="num">${fmt(model.responses)}</td>
      <td class="num">${fmt(model.input)}</td>
      <td class="num">${fmt(model.output)}</td>
      <td class="num">${fmt(model.cacheRead)}</td>
      <td class="num">${fmt(model.cacheCreate)}</td>
      <td class="num green">${pct(model.cacheHit)}</td>
      <td class="num">${fmt(model.averageOutputTokens)}</td>
      <td class="num">${fmt(model.projects)}</td>
      <td class="num">${fmt(model.sessions)}</td>
      <td class="num amber">${money(model.cost)}</td>
    </tr>`);
  return `
    <div class="view-header"><h2>Models</h2><span class="muted">${fmt(data.models.length)} models</span></div>
    <div class="panel">${table([
      { label: "Model" }, { label: "Responses", cls: "num" }, { label: "Input", cls: "num" }, { label: "Output", cls: "num" }, { label: "Cache Read", cls: "num" }, { label: "Cache Write", cls: "num" }, { label: "Cache Hit", cls: "num" }, { label: "Avg Output", cls: "num" }, { label: "Projects", cls: "num" }, { label: "Sessions", cls: "num" }, { label: "Cost", cls: "num" },
    ], rows)}</div>`;
}
