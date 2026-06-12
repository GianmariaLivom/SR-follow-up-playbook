(function () {
  "use strict";

  const config = window.PLAYBOOK_CONFIG || {};
  const state = {
    columns: [],
    rows: [],
    filters: {},
    search: "",
    timer: null
  };

  const elements = {
    title: document.getElementById("app-title"),
    subtitle: document.getElementById("app-subtitle"),
    sheetLink: document.getElementById("sheet-link"),
    refresh: document.getElementById("refresh-button"),
    search: document.getElementById("search-input"),
    filters: document.getElementById("filter-panel"),
    grid: document.getElementById("playbook-grid"),
    count: document.getElementById("result-count"),
    lastUpdated: document.getElementById("last-updated"),
    error: document.getElementById("error-box"),
    template: document.getElementById("card-template")
  };

  init();

  function init() {
    document.title = config.title || "Playbook";
    elements.title.textContent = config.title || "Playbook";
    elements.subtitle.textContent = config.subtitle || "Live from Google Sheets";
    if (config.googleSheetEditUrl) {
      elements.sheetLink.href = config.googleSheetEditUrl;
    } else {
      elements.sheetLink.hidden = true;
    }

    elements.search.addEventListener("input", function (event) {
      state.search = event.target.value.trim().toLowerCase();
      render();
    });

    elements.refresh.addEventListener("click", function () {
      loadSheet(true);
    });

    loadSheet(false);

    const minutes = Number(config.autoRefreshMinutes || 0);
    if (minutes > 0) {
      state.timer = window.setInterval(function () {
        loadSheet(false);
      }, minutes * 60 * 1000);
    }
  }

  function loadSheet(manual) {
    clearError();
    elements.count.textContent = manual ? "Refreshing..." : "Loading...";
    elements.refresh.disabled = true;

    fetchGoogleSheet()
      .then(function (payload) {
        state.columns = payload.columns;
        state.rows = payload.rows;
        state.filters = pruneFilters(state.filters, state.columns);
        buildFilters();
        render();
        elements.lastUpdated.textContent = "Updated " + new Date().toLocaleString();
      })
      .catch(function (error) {
        showError(error.message || String(error));
        state.rows = [];
        render();
      })
      .finally(function () {
        elements.refresh.disabled = false;
      });
  }

  function fetchGoogleSheet() {
    return new Promise(function (resolve, reject) {
      if (!config.spreadsheetId || !config.sheetName) {
        reject(new Error("Missing spreadsheetId or sheetName in config.js."));
        return;
      }

      const callbackName = "__playbookSheetCallback_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
      const script = document.createElement("script");
      const timeout = window.setTimeout(function () {
        cleanup();
        reject(new Error("Google Sheet loading timeout. Publish the sheet to the web and verify the tab name: " + config.sheetName));
      }, 20000);

      window[callbackName] = function (response) {
        cleanup();
        try {
          if (response.status === "error") {
            const details = response.errors && response.errors.length ? response.errors.map(function (item) { return item.message; }).join("; ") : "Unknown Google Sheets error.";
            reject(new Error(details));
            return;
          }
          resolve(parseGoogleVisualizationResponse(response));
        } catch (error) {
          reject(error);
        }
      };

      script.onerror = function () {
        cleanup();
        reject(new Error("Cannot load Google Sheet. Check that it is published to the web and accessible publicly."));
      };

      const params = new URLSearchParams({
        sheet: config.sheetName,
        headers: "1",
        tqx: "responseHandler:" + callbackName,
        cachebust: String(Date.now())
      });
      script.src = "https://docs.google.com/spreadsheets/d/" + encodeURIComponent(config.spreadsheetId) + "/gviz/tq?" + params.toString();
      document.head.appendChild(script);

      function cleanup() {
        window.clearTimeout(timeout);
        delete window[callbackName];
        if (script.parentNode) script.parentNode.removeChild(script);
      }
    });
  }

  function parseGoogleVisualizationResponse(response) {
    const table = response.table;
    if (!table || !Array.isArray(table.cols) || !Array.isArray(table.rows)) {
      throw new Error("Google Sheets returned no table data.");
    }

    const columns = table.cols.map(function (col, index) {
      const label = String(col.label || col.id || "Column " + (index + 1)).trim();
      return label || "Column " + (index + 1);
    });

    const seen = new Map();
    const uniqueColumns = columns.map(function (column) {
      const key = column.toLowerCase();
      const count = (seen.get(key) || 0) + 1;
      seen.set(key, count);
      return count === 1 ? column : column + " " + count;
    });

    const rows = table.rows.map(function (row) {
      const item = {};
      uniqueColumns.forEach(function (column, index) {
        const cell = row.c && row.c[index] ? row.c[index] : null;
        item[column] = normalizeCell(cell);
      });
      return item;
    }).filter(function (row) {
      return Object.values(row).some(function (value) { return value !== ""; });
    });

    return { columns: uniqueColumns, rows: rows };
  }

  function normalizeCell(cell) {
    if (!cell) return "";
    if (cell.f !== undefined && cell.f !== null && String(cell.f).trim() !== "") return String(cell.f).trim();
    if (cell.v === undefined || cell.v === null) return "";
    if (cell.v instanceof Date) return cell.v.toLocaleDateString();
    return String(cell.v).trim();
  }

  function pruneFilters(filters, columns) {
    const valid = {};
    columns.forEach(function (column) {
      if (filters[column]) valid[column] = filters[column];
    });
    return valid;
  }

  function buildFilters() {
    const filterColumns = getFilterColumns();
    elements.filters.innerHTML = "";

    filterColumns.forEach(function (column) {
      const wrapper = document.createElement("div");
      wrapper.className = "filter-item";

      const label = document.createElement("label");
      label.textContent = column;
      label.setAttribute("for", "filter-" + slug(column));

      const select = document.createElement("select");
      select.id = "filter-" + slug(column);
      select.innerHTML = "<option value=\"\">All</option>";

      getUniqueValues(column).forEach(function (value) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        if (state.filters[column] === value) option.selected = true;
        select.appendChild(option);
      });

      select.addEventListener("change", function (event) {
        if (event.target.value) state.filters[column] = event.target.value;
        else delete state.filters[column];
        render();
      });

      wrapper.appendChild(label);
      wrapper.appendChild(select);
      elements.filters.appendChild(wrapper);
    });
  }

  function getFilterColumns() {
    const maxFilters = 4;
    const candidates = state.columns.filter(function (column) {
      const values = getUniqueValues(column);
      return values.length > 1 && values.length <= 30;
    });

    const preferred = candidates.filter(function (column) {
      return matchesAny(column, config.columns && config.columns.category);
    });

    return unique(preferred.concat(candidates)).slice(0, maxFilters);
  }

  function getUniqueValues(column) {
    return unique(state.rows.map(function (row) { return row[column]; }).filter(Boolean)).sort(naturalSort);
  }

  function render() {
    const rows = getVisibleRows();
    elements.grid.innerHTML = "";
    elements.count.textContent = rows.length + " result" + (rows.length === 1 ? "" : "s");

    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = state.rows.length ? "No matching entries." : "No data found in the selected sheet.";
      elements.grid.appendChild(empty);
      return;
    }

    const mapped = mapColumns();
    rows.forEach(function (row) {
      elements.grid.appendChild(createCard(row, mapped));
    });
  }

  function getVisibleRows() {
    return state.rows.filter(function (row) {
      const matchesSearch = !state.search || Object.values(row).some(function (value) {
        return String(value).toLowerCase().includes(state.search);
      });

      const matchesFilters = Object.entries(state.filters).every(function ([column, value]) {
        return row[column] === value;
      });

      return matchesSearch && matchesFilters;
    });
  }

  function createCard(row, mapped) {
    const fragment = elements.template.content.cloneNode(true);
    const card = fragment.querySelector("article");
    const chipBox = fragment.querySelector(".card-topline");
    const title = fragment.querySelector("h2");
    const body = fragment.querySelector(".card-body");
    const fields = fragment.querySelector(".field-list");
    const copyButton = fragment.querySelector(".copy-button");

    const titleText = getBestValue(row, mapped.title) || "Untitled";
    const bodyText = getBestValue(row, mapped.body) || "";
    title.textContent = titleText;
    body.textContent = bodyText;
    body.hidden = !bodyText;

    mapped.categories.forEach(function (column) {
      if (!row[column]) return;
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = row[column];
      chipBox.appendChild(chip);
    });

    const excluded = new Set([mapped.title, mapped.body].filter(Boolean).concat(mapped.categories));
    state.columns.forEach(function (column) {
      if (excluded.has(column) || !row[column]) return;
      fields.appendChild(createField(column, row[column]));
    });

    copyButton.addEventListener("click", function () {
      copyRow(row).then(function () {
        copyButton.textContent = "Copied";
        copyButton.classList.add("copied");
        window.setTimeout(function () {
          copyButton.textContent = "Copy";
          copyButton.classList.remove("copied");
        }, 1400);
      });
    });

    return card;
  }

  function createField(label, value) {
    const wrapper = document.createElement("div");
    wrapper.className = "field-row";
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;

    const url = detectUrl(value);
    if (url && String(value).trim() === url) {
      const link = document.createElement("a");
      link.href = url;
      link.textContent = url;
      link.target = "_blank";
      link.rel = "noopener";
      dd.appendChild(link);
    } else {
      dd.textContent = value;
    }

    wrapper.appendChild(dt);
    wrapper.appendChild(dd);
    return wrapper;
  }

  function copyRow(row) {
    const text = state.columns
      .filter(function (column) { return row[column]; })
      .map(function (column) { return column + ": " + row[column]; })
      .join("\n");

    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    return Promise.resolve();
  }

  function mapColumns() {
    const titleColumn = findColumn(config.columns && config.columns.title) || state.columns[0];
    const bodyColumn = findColumn(config.columns && config.columns.body, titleColumn) || findLongestTextColumn(titleColumn);
    const categoryColumns = unique([
      findColumn(config.columns && config.columns.category, titleColumn, bodyColumn),
      ...getFilterColumns()
    ]).filter(Boolean).slice(0, 3);

    return {
      title: titleColumn,
      body: bodyColumn,
      categories: categoryColumns
    };
  }

  function findColumn(keywords, excludeA, excludeB) {
    if (!Array.isArray(keywords)) return null;
    const excluded = new Set([excludeA, excludeB].filter(Boolean));
    return state.columns.find(function (column) {
      return !excluded.has(column) && matchesAny(column, keywords);
    }) || null;
  }

  function findLongestTextColumn(exclude) {
    return state.columns
      .filter(function (column) { return column !== exclude; })
      .map(function (column) {
        const averageLength = state.rows.reduce(function (sum, row) {
          return sum + String(row[column] || "").length;
        }, 0) / Math.max(state.rows.length, 1);
        return { column: column, averageLength: averageLength };
      })
      .sort(function (a, b) { return b.averageLength - a.averageLength; })[0]?.column || null;
  }

  function getBestValue(row, column) {
    return column ? row[column] : "";
  }

  function matchesAny(column, keywords) {
    const normalized = normalize(column);
    return (keywords || []).some(function (keyword) {
      return normalized.includes(normalize(keyword));
    });
  }

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/[\s_\-]+/g, " ").trim();
  }

  function unique(values) {
    return Array.from(new Set(values.filter(function (value) { return value !== null && value !== undefined && value !== ""; })));
  }

  function naturalSort(a, b) {
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  }

  function slug(value) {
    return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "filter";
  }

  function detectUrl(value) {
    const text = String(value || "").trim();
    return /^https?:\/\/\S+$/i.test(text) ? text : null;
  }

  function showError(message) {
    elements.error.hidden = false;
    elements.error.textContent = message + "\n\nRequired: Google Sheet must be published to the web, and the tab name in config.js must match exactly.";
  }

  function clearError() {
    elements.error.hidden = true;
    elements.error.textContent = "";
  }
})();
