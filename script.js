const FALLBACK_DATA_URL = "data.json";

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
  "template",
  "positive_wording_score",
  "positive_wording",
  "positive_emotions_score",
  "positive_emotions",
  "negative_wording_score",
  "negative_wording",
  "negative_emotions_score",
  "negative_emotions",
  "questions",
  "inspiration",
  "rules",
  "extra"
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
  template: "Template",
  positive_wording_score: "Positive wording score",
  positive_wording: "Positive wording",
  positive_emotions_score: "Positive emotions score",
  positive_emotions: "Positive emotions",
  negative_wording_score: "Negative wording score",
  negative_wording: "Negative wording",
  negative_emotions_score: "Negative emotions score",
  negative_emotions: "Negative emotions",
  questions: "Questions",
  inspiration: "Inspiration",
  rules: "Rules",
  extra: "Extra"
};

const HEADER_ALIASES = {
  flow: ["flow", "layer 1", "stage", "phase", "main flow", "main flows"],
  objective: ["objective"],
  inner_flow: ["inner flow", "inner_flow", "reach out process", "reach-out process", "reachout process", "layer 2", "process", "scenario", "sub flow", "subflow"],
  step: ["step", "steps", "nr", "no", "number"],
  trigger: ["what triggers the step", "trigger", "trigger of the step", "trigger step"],
  time: ["time", "timing", "when"],
  action: ["action", "channel", "action/channel", "action / channel", "touchpoint", "tool"],
  speech: ["template/speech", "template / speech", "speech", "message", "text", "script"],
  if_reply: ["if answer / reply", "if answer", "if reply", "if customer replies", "if answer reply"],
  if_no_reply: ["if no answer / no reply", "if no answer", "if no reply", "if customer does not reply", "if no answer no reply"],
  template: ["template", "if no answer / no reply - template", "if no answer template", "no reply template"],
  positive_wording_score: ["positive wording score", "potivie wording score"],
  positive_wording: ["positive wording", "potivie wording"],
  positive_emotions_score: ["positive emotions score", "potivie emotions score"],
  positive_emotions: ["positive emotions", "potivie emotions"],
  negative_wording_score: ["negative wording score"],
  negative_wording: ["negative wording"],
  negative_emotions_score: ["negative emotions score"],
  negative_emotions: ["negative emotions"],
  questions: ["questions"],
  inspiration: ["inspiration"],
  rules: ["rules", "stop / rule", "stop rule"],
  extra: ["extra", "notes", "note"]
};

const HEADER_TOKENS = new Set([
  "positive wording",
  "potivie wording",
  "positive emotions",
  "potivie emotions",
  "negative wording",
  "negative emotions",
  "questions",
  "inspiration",
  "rules"
]);

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
    const spreadsheetId = (window.PLAYBOOK_SPREADSHEET_ID || "").trim();
    const sheetName = (window.PLAYBOOK_SHEET_NAME || "").trim();
    const csvUrl = (window.PLAYBOOK_CSV_URL || "").trim();

    if (spreadsheetId && sheetName) {
      rows = await loadRowsFromGoogleSheet(spreadsheetId, sheetName, window.PLAYBOOK_RANGE || "A:AZ");
      el.sourcePill.textContent = "Source: Google Sheet";
    } else if (csvUrl) {
      rows = await loadRowsFromCsv(csvUrl);
      el.sourcePill.textContent = "Source: Google Sheet CSV";
    } else {
      const response = await fetch(FALLBACK_DATA_URL, { cache: "no-store" });
      const payload = await response.json();
      if (Array.isArray(payload.columns)) {
        payload.columns.forEach((label, index) => {
          const key = HEADER_MAP[index];
          if (key && cleanValue(label)) HEADER_LABELS[key] = cleanValue(label);
        });
      }
      rows = normalizeRows(payload.rows || []);
      el.sourcePill.textContent = "Source: local data.json";
    }

    rows = rows.filter(r => r.flow || r.inner_flow || r.step || r.template || r.speech);
    rows = filterAllowedFlows(rows);
    populateFilters();
    render();
  } catch (error) {
    console.error(error);
    el.sourcePill.textContent = "Data load error";
    el.flowGrid.innerHTML = `<div class="empty-state">Could not load the live Google Sheet data. Error: ${escapeHtml(error.message || error)}<br><br>Check that the sheet is shared with anyone who has the link and that the tab name is exactly: ${escapeHtml(window.PLAYBOOK_SHEET_NAME || "")}</div>`;
  }
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
    render();
  });
  el.expandAllBtn.addEventListener("click", () => {
    allExpanded = !allExpanded;
    el.expandAllBtn.textContent = allExpanded ? "Collapse all" : "Expand all";
    renderSteps();
  });
}

async function loadRowsFromCsv(url) {
  const separator = url.includes("?") ? "&" : "?";
  const response = await fetch(`${url}${separator}_=${Date.now()}`, { cache: "no-store" });
  const csvText = await response.text();
  const matrix = parseCsv(csvText);
  return rowsFromMatrix(matrix);
}

function loadRowsFromGoogleSheet(spreadsheetId, sheetName, range) {
  return new Promise((resolve, reject) => {
    const callbackName = "__playbookSheetCallback_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
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
        resolve(rowsFromMatrix(matrixFromGoogleVisualization(response)));
      } catch (error) {
        reject(error);
      }
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Cannot load Google Sheet."));
    };

    const params = new URLSearchParams({
      sheet: sheetName,
      range: range || "A:AZ",
      headers: "0",
      tqx: "responseHandler:" + callbackName,
      cachebust: String(Date.now())
    });
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
  if (!table || !Array.isArray(table.rows)) throw new Error("Google Sheets returned no table data.");
  const colCount = Math.max(
    table.cols ? table.cols.length : 0,
    ...table.rows.map(row => row.c ? row.c.length : 0)
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
  if (!headerInfo) {
    return rowsFromSectionedMatrix(matrix);
  }

  headerInfo.labels.forEach((label, index) => {
    const key = headerInfo.columnKeys[index];
    if (key && label) HEADER_LABELS[key] = label;
  });

  const dataRows = matrix.slice(headerInfo.rowIndex + 1);
  let currentFlow = "";
  let currentObjective = "";
  let currentInner = "Reach-out process";
  const stepIndex = headerInfo.columnKeys.indexOf("step");

  const output = [];

  dataRows.forEach((row, idx) => {
    const matchedFlow = findAllowedFlowInRow(row);
    const record = emptyRecord();

    headerInfo.columnKeys.forEach((key, index) => {
      if (!key) return;
      record[key] = cleanValue(row[index]);
    });

    if (matchedFlow) currentFlow = matchedFlow;
    if (record.flow) currentFlow = record.flow;
    else record.flow = currentFlow;

    if (record.objective) currentObjective = record.objective;
    else record.objective = currentObjective;

    const possibleInner = inferInnerFromRow(row, headerInfo.columnKeys, stepIndex, matchedFlow);
    if (record.inner_flow) currentInner = record.inner_flow;
    else if (possibleInner) currentInner = possibleInner;
    else record.inner_flow = currentInner;

    if (!record.inner_flow) record.inner_flow = currentInner || "Reach-out process";

    Object.keys(record).forEach(key => {
      if (HEADER_TOKENS.has(norm(record[key]))) record[key] = "";
    });

    record.row_number = headerInfo.rowIndex + idx + 2;

    const isOnlySectionRow = matchedFlow && !record.step && !record.trigger && !record.time && !record.action && !record.speech && !record.template;
    const hasUsefulData = record.step || record.trigger || record.time || record.action || record.speech || record.template || record.if_reply || record.if_no_reply;

    if (!isOnlySectionRow && record.flow && hasUsefulData) output.push(record);
  });

  return output.length ? output : rowsFromSectionedMatrix(matrix);
}

function findHeaderInfo(matrix) {
  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex++) {
    const row = matrix[rowIndex] || [];
    const columnKeys = row.map(value => canonicalHeaderKey(value));
    const hasFlow = columnKeys.includes("flow");
    const hasInner = columnKeys.includes("inner_flow");
    const hasStep = columnKeys.includes("step");
    const hasTrigger = columnKeys.includes("trigger");
    const hasTime = columnKeys.includes("time");
    const hasAction = columnKeys.includes("action");
    const hasSpeech = columnKeys.includes("speech") || columnKeys.includes("template");
    const rowText = norm(row.join(" "));

    if (
      (hasFlow && (hasInner || hasStep || hasTrigger || hasAction)) ||
      (hasStep && (hasTrigger || hasTime || hasAction || hasSpeech)) ||
      (rowText.includes("what triggers") && (rowText.includes("step") || rowText.includes("time")))
    ) {
      return {
        rowIndex,
        columnKeys,
        labels: row.map(value => cleanValue(value))
      };
    }
  }
  return null;
}

function canonicalHeaderKey(value) {
  const n = norm(value).replace(/[\n\r]+/g, " ").replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!n) return "";
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some(alias => n === norm(alias).replace(/[_-]+/g, " "))) return key;
  }
  if (n.includes("trigger") && n.includes("step")) return "trigger";
  if (n.includes("no answer") && n.includes("reply") && n.includes("template")) return "template";
  if (n.includes("no answer") || n.includes("no reply")) return "if_no_reply";
  if (n.includes("answer") || n.includes("reply")) return "if_reply";
  if (n.includes("speech") || n.includes("message")) return "speech";
  if (n.includes("template")) return "template";
  if (n.includes("reach") && n.includes("process")) return "inner_flow";
  if (n === "before sr" || n === "follow up" || n === "future") return "flow";
  return "";
}

function rowsFromSectionedMatrix(matrix) {
  let currentFlow = "";
  let currentInner = "Reach-out process";
  const output = [];

  matrix.forEach((row, rowIndex) => {
    const clean = row.map(cleanValue);
    const joined = clean.filter(Boolean).join(" | ");
    if (!joined) return;

    const matchedFlow = findAllowedFlowInRow(clean);
    if (matchedFlow) {
      currentFlow = matchedFlow;
      currentInner = "Reach-out process";
    }

    const isHeader = clean.some(v => canonicalHeaderKey(v) === "step") && clean.some(v => ["trigger", "time", "action", "speech", "template"].includes(canonicalHeaderKey(v)));
    if (isHeader) return;

    if (!currentFlow) return;

    const record = emptyRecord();
    record.flow = currentFlow;
    record.inner_flow = currentInner;
    record.row_number = rowIndex + 1;

    const stepCellIndex = clean.findIndex(v => /^\s*(step\s*)?\d+[a-z]?\s*$/i.test(v));
    if (stepCellIndex >= 0) record.step = clean[stepCellIndex].replace(/^step\s*/i, "");

    // Use likely SR table order when no formal header is available.
    const nonEmpty = clean.filter(Boolean);
    const sectionOnly = matchedFlow && nonEmpty.length <= 2;
    if (sectionOnly) return;

    const afterStep = stepCellIndex >= 0 ? clean.slice(stepCellIndex + 1).filter(Boolean) : nonEmpty.filter(v => flowKey(v) !== flowKey(currentFlow));
    record.trigger = afterStep[0] || "";
    record.time = afterStep[1] || "";
    record.action = afterStep[2] || "";
    record.speech = afterStep.slice(3).join("\n\n");

    const possibleInner = nonEmpty.find(v => !/^\s*(step\s*)?\d+[a-z]?\s*$/i.test(v) && flowKey(v) !== flowKey(currentFlow) && v.length < 80);
    if (possibleInner && !record.trigger.includes(possibleInner)) {
      currentInner = possibleInner;
      record.inner_flow = currentInner;
    }

    const hasUsefulData = record.step || record.trigger || record.time || record.action || record.speech;
    if (hasUsefulData) output.push(record);
  });

  return output;
}

function emptyRecord() {
  const record = {};
  HEADER_MAP.forEach(key => record[key] = "");
  return record;
}

function inferInnerFromRow(row, columnKeys, stepIndex, matchedFlow) {
  const valuesBeforeStep = stepIndex > 0 ? row.slice(0, stepIndex) : row.slice(0, 3);
  const candidates = valuesBeforeStep.map(cleanValue).filter(Boolean);
  for (const value of candidates) {
    if (matchedFlow && flowKey(value) === flowKey(matchedFlow)) continue;
    if (findAllowedFlow(value)) continue;
    if (HEADER_TOKENS.has(norm(value))) continue;
    if (canonicalHeaderKey(value)) continue;
    if (/^\d+[a-z]?$/i.test(value)) continue;
    return value;
  }
  return "";
}

function findAllowedFlowInRow(row) {
  for (const value of row) {
    const found = findAllowedFlow(value);
    if (found) return found;
  }
  return "";
}

function findAllowedFlow(value) {
  const allowed = Array.isArray(window.PLAYBOOK_ALLOWED_FLOWS) ? window.PLAYBOOK_ALLOWED_FLOWS : [];
  const key = flowKey(value);
  if (!key) return "";
  return allowed.find(flow => key === flowKey(flow) || key.includes(flowKey(flow))) || "";
}

function normalizeRows(inputRows) {
  let currentFlow = "";
  let currentObjective = "";
  let currentInner = "";

  return inputRows.map((r) => {
    const record = { ...r };
    HEADER_MAP.forEach(k => record[k] = cleanValue(record[k]));

    if (record.flow) currentFlow = record.flow; else record.flow = currentFlow;
    if (record.objective) currentObjective = record.objective; else record.objective = currentObjective;
    if (record.inner_flow) currentInner = record.inner_flow; else record.inner_flow = currentInner;

    return record;
  });
}

function filterAllowedFlows(inputRows) {
  const allowed = window.PLAYBOOK_ALLOWED_FLOWS;
  if (!Array.isArray(allowed) || !allowed.length) return inputRows;
  const allowedSet = new Set(allowed.map(flowKey));
  return inputRows.filter(r => allowedSet.has(flowKey(r.flow)));
}

function flowKey(value) {
  return norm(value).replace(/[^a-z0-9]+/g, "");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function filteredRows() {
  const term = norm(el.searchInput.value);
  const channel = norm(el.channelFilter.value);
  const language = norm(el.languageFilter.value);

  return rows.filter(r => {
    const text = norm(Object.values(r).join(" "));
    const channelOk = !channel || norm(r.channel || r.action).includes(channel);
    const languageOk = !language || norm(r.language).includes(language);
    const textOk = !term || text.includes(term);
    return channelOk && languageOk && textOk;
  });
}

function render() {
  renderBreadcrumbs();
  renderFlows();

  if (selectedFlow) {
    renderInnerFlows();
  } else {
    el.innerPanel.classList.add("hidden");
    el.stepsPanel.classList.add("hidden");
  }

  if (selectedFlow && selectedInner) {
    renderSteps();
  } else {
    el.stepsPanel.classList.add("hidden");
  }
}

function renderBreadcrumbs() {
  const crumbs = [
    `<span class="crumb active">All flows</span>`
  ];
  if (selectedFlow) crumbs.push(`<span class="crumb">${escapeHtml(selectedFlow)}</span>`);
  if (selectedInner) crumbs.push(`<span class="crumb">${escapeHtml(selectedInner)}</span>`);
  el.breadcrumbs.innerHTML = crumbs.join("");
}

function renderFlows() {
  const data = filteredRows();
  const flowMap = groupBy(data, r => r.flow || "No flow");
  const preferred = Array.isArray(window.PLAYBOOK_ALLOWED_FLOWS) ? window.PLAYBOOK_ALLOWED_FLOWS : [];
  const flowNames = Object.keys(flowMap).filter(Boolean).sort((a, b) => {
    const ai = preferred.map(flowKey).indexOf(flowKey(a));
    const bi = preferred.map(flowKey).indexOf(flowKey(b));
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return a.localeCompare(b);
  });

  el.flowCount.textContent = `${flowNames.length} flows`;

  el.flowGrid.innerHTML = flowNames.map(flowName => {
    const items = flowMap[flowName];
    const objective = firstNonEmpty(items, "objective");
    const innerCount = Object.keys(groupBy(items, r => r.inner_flow || "No inner flow")).length;
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
  const innerMap = groupBy(data, r => r.inner_flow || "No inner flow");
  const innerNames = Object.keys(innerMap).filter(Boolean);

  el.innerPanel.classList.remove("hidden");
  el.innerPanelTitle.textContent = selectedFlow;
  el.flowObjective.textContent = firstNonEmpty(data, "objective") || "Reach-out process";
  el.innerCount.textContent = `${innerNames.length} inner flows`;

  el.innerGrid.innerHTML = innerNames.map(innerName => {
    const items = innerMap[innerName];
    const description = firstNonEmpty(items, "trigger") || firstNonEmpty(items, "action") || "";
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
  ].filter(([, value]) => value);

  const textBlocks = [
    [labelFor("speech"), r.speech],
    ["If No Answer / No Reply - Template", r.template],
    [labelFor("questions"), r.questions],
    [labelFor("inspiration"), r.inspiration],
    [labelFor("positive_wording"), combineScoreText(r.positive_wording_score, r.positive_wording)],
    [labelFor("positive_emotions"), combineScoreText(r.positive_emotions_score, r.positive_emotions)],
    [labelFor("negative_wording"), combineScoreText(r.negative_wording_score, r.negative_wording)],
    [labelFor("negative_emotions"), combineScoreText(r.negative_emotions_score, r.negative_emotions)],
    [labelFor("extra", "Notes"), r.notes || r.extra]
  ].filter(([, value]) => value && value !== "—" && value !== "-");

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
  const found = items.find(item => item[key]);
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

function norm(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
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
