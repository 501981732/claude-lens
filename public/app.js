import { renderOverview } from "./views/overview.js";
import { renderProjects } from "./views/projects.js";
import { renderSessions } from "./views/sessions.js";
import { renderAgents } from "./views/agents.js";
import { renderTools } from "./views/tools.js";
import { renderModels } from "./views/models.js";
import { renderSettings } from "./views/settings.js";

const views = {
  overview: { label: "Overview", render: renderOverview },
  projects: { label: "Projects", render: renderProjects },
  sessions: { label: "Sessions", render: renderSessions },
  agents: { label: "Agents", render: renderAgents },
  tools: { label: "Tools", render: renderTools },
  models: { label: "Models", render: renderModels },
  settings: { label: "Settings", render: renderSettings },
};

const state = {
  view: "overview",
  filters: { timeRange: "7d", source: "all", projectId: "all" },
};

const app = document.getElementById("app");
const nav = document.getElementById("top-nav");
const rangeFilter = document.getElementById("range-filter");
const sourceFilter = document.getElementById("source-filter");
const projectFilter = document.getElementById("project-filter");
const refreshBtn = document.getElementById("refresh-btn");

const sourceLabels = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
};

const sourceStatusLabels = {
  ok: "Active",
  warning: "Warning",
  planned: "Planned",
  not_configured: "Not configured",
};

function initNav() {
  nav.innerHTML = Object.entries(views)
    .map(([id, view]) => `<button class="nav-tab ${id === state.view ? "active" : ""}" data-view="${id}" type="button">${view.label}</button>`)
    .join("");
  nav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    state.view = button.dataset.view;
    render();
  });
}

function filterQuery() {
  const params = new URLSearchParams();
  params.set("range", state.filters.timeRange);
  params.set("source", state.filters.source);
  params.set("project", state.filters.projectId);
  return params.toString();
}

export async function api(path) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${path}${separator}${filterQuery()}`);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

export function html(strings, ...values) {
  return strings.reduce((out, string, index) => out + string + (values[index] ?? ""), "");
}

export function escapeHtml(value = "") {
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
}

export function fmt(value) {
  return value == null ? "-" : Number(value).toLocaleString();
}

export function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

export function dateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function duration(ms) {
  if (!ms) return "-";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

export function metric(label, value, cls = "") {
  return `<div class="panel"><div class="metric-label">${label}</div><div class="metric-value ${cls}">${value}</div></div>`;
}

export function sourceName(source = "claude-code") {
  return sourceLabels[source] || source || "-";
}

export function sourceStatusLabel(status = "") {
  return sourceStatusLabels[status] || status || "-";
}

export function sourceBadge(source = "claude-code", status = "") {
  const label = sourceName(source);
  const suffix = status ? ` · ${status}` : "";
  return `<span class="badge source-badge">${escapeHtml(label + suffix)}</span>`;
}

export function table(headers, rows, empty = "No data found") {
  if (!rows.length) return `<div class="empty">${empty}</div>`;
  return `<table><thead><tr>${headers.map((header) => `<th class="${header.cls || ""}">${header.label}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

export async function renderDetail(containerId, renderer) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '<div class="loading">Loading details...</div>';
  try {
    el.innerHTML = await renderer();
  } catch (err) {
    el.innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  }
}

async function populateProjects() {
  try {
    const projects = await api("/api/projects");
    const current = state.filters.projectId;
    projectFilter.innerHTML = '<option value="all">All Projects</option>' +
      projects.map((project) => `<option value="${escapeHtml(project.projectId)}">${escapeHtml(project.shortName || project.projectId)}</option>`).join("");
    projectFilter.value = [...projectFilter.options].some((option) => option.value === current) ? current : "all";
    state.filters.projectId = projectFilter.value;
  } catch {
    projectFilter.innerHTML = '<option value="all">All Projects</option>';
  }
}

async function populateSources() {
  try {
    const data = await api("/api/sources");
    const current = state.filters.source;
    sourceFilter.replaceChildren();
    sourceFilter.appendChild(sourceOption("all", "All Active Sources"));
    data.sources.forEach((source) => {
      const status = sourceStatusLabel(source.status);
      const name = source.name || (source.id ? sourceName(source.id) : "Unknown");
      sourceFilter.appendChild(sourceOption(source.id || "", `${name} (${status})`, source.enabled !== true));
    });
    sourceFilter.value = [...sourceFilter.options].some((option) => option.value === current && !option.disabled) ? current : "all";
    state.filters.source = sourceFilter.value;
  } catch {
    sourceFilter.replaceChildren(
      sourceOption("all", "All Active Sources"),
      sourceOption("claude-code", "Claude Code (Active)"),
    );
  }
}

function sourceOption(value, label, disabled = false) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  option.disabled = disabled;
  return option;
}

async function render() {
  nav.querySelectorAll(".nav-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === state.view));
  app.innerHTML = '<div class="loading">Loading...</div>';
  try {
    app.innerHTML = await views[state.view].render({ state });
  } catch (err) {
    app.innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  }
}

function bindFilters() {
  rangeFilter.addEventListener("change", () => {
    state.filters.timeRange = rangeFilter.value;
    render();
  });
  sourceFilter.addEventListener("change", () => {
    state.filters.source = sourceFilter.value;
    render();
  });
  projectFilter.addEventListener("change", () => {
    state.filters.projectId = projectFilter.value;
    render();
  });
  refreshBtn.addEventListener("click", async () => {
    await populateSources();
    await populateProjects();
    render();
  });
}

initNav();
bindFilters();
await populateSources();
await populateProjects();
render();
