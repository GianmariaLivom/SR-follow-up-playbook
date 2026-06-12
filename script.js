const FALLBACK_DATA_URL = "data.json";
const EXPECTED_FLOWS = ["Before SR", "Follow up", "Future"];

const HEADER_MAP = [
  "flow",
  "objective",
  "inner_flow",
  "step",
  "trigger",
  "time",
  "action",
  "speech",
  "if_reply",
  "if_no_reply",
  "template"
];

let HEADER_LABELS = {
  flow: "Flow",
  objective: "Objective",
  inner_flow: "Inner flow",
  step: "Step",
  trigger: "What triggers the step",
  time: "Time",
  action: "Action",
  speech: "Template / Speech",
  if_reply: "If answer / reply",
  if_no_reply: "If no answer / no reply",
  template: "If No Answer / No Reply - Template",
  questions: "Questions",
  inspiration: "Inspiration",
  positive_wording: "Positive wording",
  positive_emotions: "Positive emotions",
  negative_wording: "Negative wording",
  negative_emotions: "Negative emotions",
  rules: "Rules",
  extra: "Notes"
};

let rows = [];
let selectedFlow = null;
let selectedInner = null;
let allExpanded = false;

const el = {
  sourcePill: document.getElementById("sourcePill"),
  searchInput: document.getElementById("searchInput"),
  channelFilter: document.getElementById("channelFilter"),
  languageFilter: document.getElementById("languageFilter"),
  resetBtn: document.getElementById("resetBtn"),
  breadcrumbs: document.getElementById("breadcrumbs"),
  flowGrid: document.getElementById("flowGrid"),
  innerPanel: document.getElementById("innerPanel"),
  innerPanelTitle: document.getElementById("innerPanelTitle"),
  flowObjective: document.getElementById("flowObjective"),
  innerGrid: document.getElementById("innerGrid"),
  stepsPanel: document.getElementById("stepsPanel"),
  stepsPanelTitle: document.getElementById("stepsPanelTitle"),
  innerDescription: document.getElementById("innerDescription"),
  stepsContainer: document.getElementById("stepsContainer"),
  flowCount: document.getElementById("flowCount"),
  innerCount: document.getElementById("innerCount"),
  stepCount: document.getElementById("stepCount"),
  expandAllBtn: document.getElementById("expandAllBtn")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();

  try {
    const live = await loadLiveRows();
    rows = live.rows;
    el.sourcePill.textContent = live.label;
  } catch (liveError) {
    console.warn("Live Google Sheet failed; using local fallback.", liveError);
    try {
      const response = await fetch(FALLBACK_DATA_URL + "?_=" + Date.now(), { cache: "no-store" });
      if (!response.ok) throw new Error("Could not read local data.json.");
      const payload = await response.json();
      applyColumnLabels(payload.columns || []);
      rows = normalizeRows(payload.rows || []);
      el.sourcePill.textContent = "Source: local fallback";
    } catch (fallbackError) {
      console.error(fallbackError);
      el.sourcePill.textContent = "Data load error";
      el.flowGrid.innerHTML = `<div class="empty-state">Could not load playbook data. Live error: ${escapeHtml(liveError.message || liveError)}. Fallback error: ${escapeHtml(fallbackError.message || fallbackError)}.</div>`;
      return;
    }
  }

  rows = rows.filter(hasUsefulData);
  const flowKeys = new Set(rows.map(r => flowKey(r.flow)));
  const missing = EXPECTED_FLOWS.filter(flow => !flowKeys.has(flowKey(flow)));

  populateFilters();
  render();

  if (missing.length) {
    el.sourcePill.textContent += ` · missing: ${missing.join(", ")}`;
  }
}

async function loadLiveRows() {
  const spreadsheetId = cleanValue(window.PLAYBOOK_SPREADSHEET_ID);
  const range = cleanValue(window.PLAYBOOK_RANGE) || "A:K";
  if (!spreadsheetId) throw new Error("Missing PLAYBOOK_SPREADSHEET_ID in config.js.");

  const attempts = [];
  const gid = cleanValue(window.PLAYBOOK_GID);
  if (gid) attempts.push({ gid, label: "Source: Google Sheet" });

  const sheetNames = Array.isArray(window.PLAYBOOK_SHEET_NAMES) ? window.PLAYBOOK_SHEET_NAMES : [];
  sheetNames.forEach(sheet => {
    if (cleanValue(sheet)) attempts.push({ sheet: cleanValue(sheet), label: "Source: Google Sheet" });
  });

  if (!attempts.length && cleanValue(window.PLAYBOOK_SHEET_NAME)) {
    attempts.push({ sheet: cleanValue(window.PLAYBOOK_SHEET_NAME), label: "Source: Google Sheet" });
  }

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const matrix = await loadMatrixFromGoogleSheet(spreadsheetId, attempt, range);
      const parsed = rowsFromMatrix(matrix);
      const flowKeys = new Set(parsed.map(r => flowKey(r.flow)));
      const hasExpected = EXPECTED_FLOWS.every(flow => flowKeys.has(flowKey(flow)));
      if (!hasExpected) {
        throw new Error(`Parsed flows: ${[...flowKeys].join(", ") || "none"}. Expected Before SR, Follow up, Future.`);
      }
      return { rows: parsed, label: attempt.label };
    } catch (error) {
      lastError = error;
      console.warn("Google Sheet attempt failed", attempt, error);
    }
  }

  throw lastError || new Error("No Google Sheet loading method configured.");
}

function loadMatrixFromGoogleSheet(spreadsheetId, selector, range) {
  return new Promise((resolve, reject) => {
    const callbackName = "__srPlaybookCallback_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Google Sheet loading timeout."));
    }, 20000);

    window[callbackName] = response => {
      cleanup();
      try {
        if (response.status === "error") {
          const message = response.errors && response.errors.length
            ? response.errors.map(item => item.message).join("; ")
            : "Unknown Google Sheets error.";
          reject(new Error(message));
          return;
        }
        resolve(matrixFromGoogleVisualization(response));
      } catch (error) {
        reject(error);
      }
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Cannot load Google Sheet script."));
    };

    const params = new URLSearchParams({
      range,
      headers: "0",
      tqx: "responseHandler:" + callbackName,
      cachebust: String(Date.now())
    });
    if (selector.gid) params.set("gid", selector.gid);
    if (selector.sheet) params.set("sheet", selector.sheet);

    script.src = "https://docs.google.com/spreadsheets/d/" + encodeURIComponent(spreadsheetId) + "/gviz/tq?" + params.toString();
    document.head.appendChild(script);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }
  });
}

function matrixFromGoogleVisualization(response) {
  const table = response.table;
  if (!table || !Array.isArray(table.rows)) throw new Error("Google Sheets returned no table rows.");
  const colCount = Math.max(
    table.cols ? table.cols.length : 0,
    ...table.rows.map(row => row.c ? row.c.length : 0),
    HEADER_MAP.length
  );

  return table.rows.map(row => {
    const out = [];
    for (let i = 0; i < colCount; i++) {
      const cell = row.c && row.c[i] ? row.c[i] : null;
      out.push(cleanCell(cell));
    }
    return out;
  });
}

function cleanCell(cell) {
  if (!cell) return "";
  if (cell.f !== undefined && cell.f !== null && String(cell.f).trim() !== "") return String(cell.f).trim();
  if (cell.v === undefined || cell.v === null) return "";
  return String(cell.v).trim();
}

function rowsFromMatrix(matrix) {
  const headerInfo = findHeaderInfo(matrix);
  if (!headerInfo) throw new Error("Could not find the Flow / Objective / Inner flow / Step header row.");

  applyColumnLabels(headerInfo.labels);

  let currentFlow = "";
  let currentObjective = "";
  let currentInner = "";
  const output = [];

  for (let rowIndex = headerInfo.rowIndex + 1; rowIndex < matrix.length; rowIndex++) {
    const sourceRow = matrix[rowIndex] || [];
    const record = emptyRecord();

    headerInfo.columnKeys.forEach((key, index) => {
      if (!key) return;
      const value = cleanValue(sourceRow[index]);
      if (value) record[key] = value;
    });

    const rawFlow = record.flow;
    const canonical = canonicalFlowName(rawFlow);
    if (canonical) currentFlow = canonical;
    else if (rawFlow) currentFlow = rawFlow;
    record.flow = currentFlow;

    if (record.objective) currentObjective = record.objective;
    else record.objective = currentObjective;

    if (record.inner_flow) currentInner = record.inner_flow;
    else record.inner_flow = currentInner || "Reach-out process";

    record.row_number = rowIndex + 1;

    if (!isExpectedFlow(record.flow)) continue;
    if (!hasUsefulData(record)) continue;
    output.push(record);
  }

  return output;
}

function findHeaderInfo(matrix) {
  for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 80); rowIndex++) {
    const row = matrix[rowIndex] || [];
    const rawKeys = row.map(value => canonicalHeaderKey(value));
    const columnKeys = disambiguateColumnKeys(rawKeys);
    const hasFlow = columnKeys.includes("flow");
    const hasObjective = columnKeys.includes("objective");
    const hasInner = columnKeys.includes("inner_flow");
    const hasStep = columnKeys.includes("step");
    const hasTrigger = columnKeys.includes("trigger");
    const hasTime = columnKeys.includes("time");
    const hasAction = columnKeys.includes("action");

    if (hasFlow && hasObjective && hasInner && hasStep) {
      return { rowIndex, columnKeys, labels: row.map(cleanValue) };
    }
    if (hasFlow && hasStep && (hasTrigger || hasTime || hasAction)) {
      return { rowIndex, columnKeys, labels: row.map(cleanValue) };
    }
  }
  return null;
}

function disambiguateColumnKeys(keys) {
  const counts = {};
  return keys.map(key => {
    if (!key) return "";
    const count = counts[key] || 0;
    counts[key] = count + 1;
    if (key === "if_no_reply" && count >= 1) return "template";
    return key;
  });
}

function canonicalHeaderKey(value) {
  const n = norm(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!n) return "";

  if (n === "flow") return "flow";
  if (n === "objective") return "objective";
  if (n === "inner flow" || n === "inner_flow") return "inner_flow";
  if (n === "step" || n === "steps") return "step";
  if (n.includes("trigger") && n.includes("step")) return "trigger";
  if (n === "time" || n === "timing") return "time";
  if (n === "action") return "action";
  if (n === "template/speech" || n === "template / speech" || n === "speech") return "speech";
  if (n.includes("answer") && n.includes("reply") && !n.includes("no")) return "if_reply";
  if (n.includes("no answer") || n.includes("no reply")) return "if_no_reply";
  if (n === "template") return "template";
  if (n === "questions") return "questions";
  if (n === "inspiration") return "inspiration";
  if (n === "rules") return "rules";
  if (n === "extra" || n === "notes") return "extra";
  return "";
}

function applyColumnLabels(labels) {
  if (!Array.isArray(labels)) return;
  const keys = disambiguateColumnKeys(labels.map(canonicalHeaderKey));
  labels.forEach((label, index) => {
    const key = keys[index];
    const clean = cleanValue(label);
    if (key && clean) HEADER_LABELS[key] = clean;
  });
  HEADER_LABELS.template = "If No Answer / No Reply - Template";
}

function normalizeRows(inputRows) {
  let currentFlow = "";
  let currentObjective = "";
  let currentInner = "";

  return inputRows.map((input, index) => {
    const record = emptyRecord();
    Object.keys(input || {}).forEach(key => {
      record[key] = cleanValue(input[key]);
    });

    const canonical = canonicalFlowName(record.flow);
    if (canonical) currentFlow = canonical;
    else if (record.flow) currentFlow = record.flow;
    record.flow = currentFlow;

    if (record.objective) currentObjective = record.objective;
    else record.objective = currentObjective;

    if (record.inner_flow) currentInner = record.inner_flow;
    else record.inner_flow = currentInner || "Reach-out process";

    record.row_number = Number(record.row_number) || index + 1;
    return record;
  }).filter(r => isExpectedFlow(r.flow) && hasUsefulData(r));
}

function emptyRecord() {
  const record = {};
  HEADER_MAP.forEach(key => record[key] = "");
  record.positive_wording_score = "";
  record.positive_wording = "";
  record.positive_emotions_score = "";
  record.positive_emotions = "";
  record.negative_wording_score = "";
  record.negative_wording = "";
  record.negative_emotions_score = "";
  record.negative_emotions = "";
  record.questions = "";
  record.inspiration = "";
  record.rules = "";
  record.extra = "";
  return record;
}

function canonicalFlowName(value) {
  const key = flowKey(value);
  if (!key) return "";
  if (key === "beforesr" || key === "beforeshowroom") return "Before SR";
  if (key === "followup" || key === "followups") return "Follow up";
  if (key === "future") return "Future";
  return "";
}

function isExpectedFlow(value) {
  return EXPECTED_FLOWS.some(flow => flowKey(flow) === flowKey(value));
}

function hasUsefulData(record) {
  return !!(record && (record.step || record.trigger || record.time || record.action || record.speech || record.if_reply || record.if_no_reply || record.template));
}

function bindEvents() {
  el.searchInput.addEventListener("input", render);
  el.channelFilter.addEventListener("change", render);
  el.languageFilter.addEventListener("change", render);
  el.resetBtn.addEventListener("click", () => {
    el.searchInput.value = "";
    el.channelFilter.value = "";
    el.languageFilter.value = "";
    selectedFlow = null;
    selectedInner = null;
    allExpanded = false;
    el.expandAllBtn.textContent = "Expand all";
    render();
  });
  el.expandAllBtn.addEventListener("click", () => {
    allExpanded = !allExpanded;
    el.expandAllBtn.textContent = allExpanded ? "Collapse all" : "Expand all";
    renderSteps();
  });
}

function filteredRows() {
  const term = norm(el.searchInput.value);
  const channel = norm(el.channelFilter.value);
  const language = norm(el.languageFilter.value);

  return rows.filter(r => {
    const text = norm(Object.values(r).join(" "));
    const channelOk = !channel || norm(inferChannel(r)).includes(channel);
    const languageOk = !language || norm(r.language).includes(language);
    const textOk = !term || text.includes(term);
    return channelOk && languageOk && textOk;
  });
}

function render() {
  renderBreadcrumbs();
  renderFlows();

  if (selectedFlow) renderInnerFlows();
  else {
    el.innerPanel.classList.add("hidden");
    el.stepsPanel.classList.add("hidden");
  }

  if (selectedFlow && selectedInner) renderSteps();
  else el.stepsPanel.classList.add("hidden");
}

function renderBreadcrumbs() {
  const crumbs = [`<span class="crumb active">All flows</span>`];
  if (selectedFlow) crumbs.push(`<span class="crumb">${escapeHtml(selectedFlow)}</span>`);
  if (selectedInner) crumbs.push(`<span class="crumb">${escapeHtml(selectedInner)}</span>`);
  el.breadcrumbs.innerHTML = crumbs.join("");
}

function renderFlows() {
  const data = filteredRows();
  const flowMap = groupBy(data, r => r.flow || "No flow");
  const flowNames = EXPECTED_FLOWS.filter(flow => flowMap[flow] && flowMap[flow].length);

  el.flowCount.textContent = `${flowNames.length} flows`;

  el.flowGrid.innerHTML = flowNames.map(flowName => {
    const items = flowMap[flowName];
    const objective = firstNonEmpty(items, "objective");
    const innerCount = Object.keys(groupBy(items, r => r.inner_flow || "Reach-out process")).length;
    const stepCount = items.filter(r => r.step).length;
    const selectedClass = selectedFlow === flowName ? " selected" : "";

    return `
      <button class="card${selectedClass}" onclick="selectFlow('${jsString(flowName)}')">
        <span class="card-title">${escapeHtml(flowName)}</span>
        <span class="card-desc">${escapeHtml(objective || "Reach-out process")}</span>
        <span class="card-meta">
          <span class="tag green">${innerCount} inner flows</span>
          <span class="tag">${stepCount} steps</span>
        </span>
      </button>
    `;
  }).join("") || `<div class="empty-state">No flows match the current filters.</div>`;
}

function selectFlow(flowName) {
  selectedFlow = flowName;
  selectedInner = null;
  allExpanded = false;
  el.expandAllBtn.textContent = "Expand all";
  render();
  el.innerPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function selectInner(innerName) {
  selectedInner = innerName;
  allExpanded = false;
  el.expandAllBtn.textContent = "Expand all";
  render();
  el.stepsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderInnerFlows() {
  const data = filteredRows().filter(r => r.flow === selectedFlow);
  const innerMap = groupBy(data, r => r.inner_flow || "Reach-out process");
  const innerNames = Object.keys(innerMap).filter(Boolean);

  el.innerPanel.classList.remove("hidden");
  el.innerPanelTitle.textContent = selectedFlow;
  el.flowObjective.textContent = firstNonEmpty(data, "objective") || "Reach-out process";
  el.innerCount.textContent = `${innerNames.length} inner flows`;

  el.innerGrid.innerHTML = innerNames.map(innerName => {
    const items = innerMap[innerName];
    const description = firstNonEmpty(items, "trigger") || firstNonEmpty(items, "action") || "Reach-out process";
    const stepCount = items.filter(r => r.step).length;
    const selectedClass = selectedInner === innerName ? " selected" : "";

    return `
      <button class="card${selectedClass}" onclick="selectInner('${jsString(innerName)}')">
        <span class="card-title">${escapeHtml(innerName)}</span>
        <span class="card-desc">${escapeHtml(description)}</span>
        <span class="card-meta">
          <span class="tag green">${stepCount} steps</span>
          <span class="tag">${escapeHtml(firstNonEmpty(items, "time") || "Timing varies")}</span>
        </span>
      </button>
    `;
  }).join("") || `<div class="empty-state">No inner flows match the current filters.</div>`;
}

function renderSteps() {
  const data = filteredRows()
    .filter(r => r.flow === selectedFlow && r.inner_flow === selectedInner)
    .sort((a, b) => numeric(a.step) - numeric(b.step) || numeric(a.row_number) - numeric(b.row_number));

  el.stepsPanel.classList.remove("hidden");
  el.stepsPanelTitle.textContent = selectedInner;
  el.innerDescription.textContent = firstNonEmpty(data, "objective") || "";
  el.stepCount.textContent = `${data.length} rows`;

  el.stepsContainer.innerHTML = data.map((r, index) => stepCard(r, index)).join("") ||
    `<div class="empty-state">No steps match the current filters.</div>`;
}

function stepCard(r, index) {
  const openClass = allExpanded || index === 0 ? " open" : "";
  const stepLabel = r.step || "?";
  const title = r.trigger || `Step ${stepLabel}`;
  const summary = [r.time, r.action].filter(Boolean).join(" · ");

  const infoBoxes = [
    [labelFor("trigger"), r.trigger],
    [labelFor("time"), r.time],
    [labelFor("action"), r.action],
    [labelFor("if_reply"), r.if_reply],
    [labelFor("if_no_reply"), r.if_no_reply],
    [labelFor("rules", "Stop / rule"), r.rules || r.stop_rule]
  ].filter(([, value]) => displayValue(value));

  const textBlocks = [
    [labelFor("speech"), r.speech],
    [labelFor("template"), r.template],
    [labelFor("questions"), r.questions],
    [labelFor("inspiration"), r.inspiration],
    [labelFor("positive_wording"), combineScoreText(r.positive_wording_score, r.positive_wording)],
    [labelFor("positive_emotions"), combineScoreText(r.positive_emotions_score, r.positive_emotions)],
    [labelFor("negative_wording"), combineScoreText(r.negative_wording_score, r.negative_wording)],
    [labelFor("negative_emotions"), combineScoreText(r.negative_emotions_score, r.negative_emotions)],
    [labelFor("extra", "Notes"), r.notes || r.extra]
  ].filter(([, value]) => displayValue(value));

  return `
    <article class="step-card${openClass}">
      <button class="step-toggle" onclick="this.closest('.step-card').classList.toggle('open')">
        <span class="step-number">${escapeHtml(stepLabel)}</span>
        <span class="step-title">
          <strong>${escapeHtml(title)}</strong>
          <span class="step-summary">${escapeHtml(summary)}</span>
        </span>
        <span class="chevron">›</span>
      </button>
      <div class="step-body">
        ${infoBoxes.length ? `<div class="info-grid">${infoBoxes.map(([label, value]) => `
          <div class="info-box"><strong>${escapeHtml(label)}</strong><div>${escapeHtml(value)}</div></div>
        `).join("")}</div>` : ""}
        ${textBlocks.map(([label, value]) => textBlock(label, value)).join("")}
      </div>
    </article>
  `;
}

function textBlock(label, value) {
  const id = `copy-${Math.random().toString(36).slice(2)}`;
  setTimeout(() => {
    const node = document.getElementById(id);
    if (node) node.dataset.copyText = value;
  }, 0);

  return `
    <section class="text-block">
      <div class="text-block-head">
        <span class="text-block-title">${escapeHtml(label)}</span>
        <button class="copy-btn" id="${id}" onclick="copyBlock(this)">Copy</button>
      </div>
      <div class="text-block-content">${escapeHtml(value)}</div>
    </section>
  `;
}

async function copyBlock(button) {
  const text = button.dataset.copyText || button.closest(".text-block").querySelector(".text-block-content").innerText;
  await navigator.clipboard.writeText(text);
  const old = button.textContent;
  button.textContent = "Copied";
  setTimeout(() => button.textContent = old, 900);
}

function populateFilters() {
  el.channelFilter.querySelectorAll("option:not([value=''])").forEach(option => option.remove());
  el.languageFilter.querySelectorAll("option:not([value=''])").forEach(option => option.remove());

  const channels = unique(rows.map(r => inferChannel(r)).filter(Boolean));
  const languages = unique(rows.map(r => r.language).filter(Boolean));

  channels.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    el.channelFilter.appendChild(option);
  });

  languages.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    el.languageFilter.appendChild(option);
  });
}

function inferChannel(row) {
  const text = norm([row.channel, row.action, row.speech, row.template].join(" "));
  if (text.includes("whatsapp")) return "WhatsApp";
  if (text.includes("email")) return "Email";
  if (text.includes("call") || text.includes("phone")) return "Call";
  return row.channel || "";
}

function combineScoreText(score, text) {
  if (!score && !text) return "";
  if (score && text) return `Score: ${score}\n${text}`;
  return score || text;
}

function labelFor(key, fallback) {
  return HEADER_LABELS[key] || fallback || key;
}

function groupBy(list, fn) {
  return list.reduce((acc, item) => {
    const key = fn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function firstNonEmpty(items, key) {
  const found = items.find(item => displayValue(item[key]));
  return found ? found[key] : "";
}

function unique(values) {
  return [...new Set(values.map(v => String(v).trim()).filter(Boolean))].sort();
}

function numeric(value) {
  const n = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 9999;
}

function cleanValue(value) {
  return String(value ?? "").trim();
}

function displayValue(value) {
  const v = cleanValue(value);
  return !!v && v !== "—" && v !== "-";
}

function norm(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function flowKey(value) {
  return norm(value).replace(/[^a-z0-9]+/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function jsString(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "");
}
