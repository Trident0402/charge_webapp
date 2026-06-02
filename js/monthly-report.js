import { data } from "./storage.js";
import { $, escapeHtml, formatCurrency, formatPercent, requestView, setHtml } from "./utils.js";

const REPORT_COLORS = ["#e53670", "#f5cc4e", "#fb9843", "#2faf6a", "#55c2df", "#3177df", "#9659df", "#8b8b8b"];
const UNCATEGORIZED_LABEL = "未分類";

const reportState = {
  mode: "expense",
  period: "month",
  anchorDate: new Date(),
  customStartDate: toDateInputValue(monthStart(new Date())),
  customEndDate: toDateInputValue(monthEnd(new Date()))
};

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function toDateInputValue(date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function fromDateInputValue(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, day || 1);
}

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthEnd(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function addYears(date, amount) {
  return new Date(date.getFullYear() + amount, date.getMonth(), 1);
}

function formatReportDate(date) {
  return `${date.getFullYear()}/${padNumber(date.getMonth() + 1)}/${padNumber(date.getDate())}`;
}

function parseTransactionDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function getCategoryColor(category) {
  let hash = 0;
  String(category || "").split("").forEach((char) => {
    hash = (hash + char.charCodeAt(0)) % REPORT_COLORS.length;
  });
  return REPORT_COLORS[hash];
}

export function getReportDateRange(state = reportState) {
  if (state.period === "custom") {
    const start = fromDateInputValue(state.customStartDate);
    const end = fromDateInputValue(state.customEndDate);
    return start <= end ? { start, end } : { start: end, end: start };
  }

  if (state.period === "half-year") {
    const start = monthStart(state.anchorDate);
    const end = monthEnd(addMonths(state.anchorDate, 5));
    return { start, end };
  }

  if (state.period === "year") {
    return {
      start: new Date(state.anchorDate.getFullYear(), 0, 1),
      end: new Date(state.anchorDate.getFullYear(), 11, 31)
    };
  }

  return {
    start: monthStart(state.anchorDate),
    end: monthEnd(state.anchorDate)
  };
}

export function getMonthlyReportSummary(state = reportState) {
  const range = getReportDateRange(state);
  const categoryMap = new Map();

  data.transactions.forEach((transaction) => {
    if (transaction.type !== state.mode) return;
    const date = parseTransactionDate(transaction.date);
    if (!date || date < range.start || date > range.end) return;
    const category = String(transaction.category || "").trim() || UNCATEGORIZED_LABEL;
    categoryMap.set(category, (categoryMap.get(category) || 0) + Number(transaction.amount || 0));
  });

  const total = Array.from(categoryMap.values()).reduce((sum, amount) => sum + amount, 0);
  const categories = Array.from(categoryMap.entries())
    .map(([name, amount]) => ({
      name,
      amount,
      color: getCategoryColor(name),
      percent: total > 0 ? (amount / total) * 100 : 0
    }))
    .sort((a, b) => {
      if (b.amount !== a.amount) return b.amount - a.amount;
      return a.name.localeCompare(b.name, "zh-Hant");
    });

  return { range, total, categories };
}

function buildDonutGradient(categories) {
  if (!categories.length) return "#edf1f0";
  let current = 0;
  const stops = categories.map((category) => {
    const start = current;
    const end = current + category.percent;
    current = end;
    return `${category.color} ${start}% ${end}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function renderModeSwitch() {
  return `
    <div class="report-segment" aria-label="收入支出切換">
      <button class="${reportState.mode === "expense" ? "is-active" : ""}" type="button" data-report-mode="expense">支出</button>
      <button class="${reportState.mode === "income" ? "is-active" : ""}" type="button" data-report-mode="income">收入</button>
    </div>
  `;
}

function renderRangeControl(summary) {
  return `
    <div class="report-range-row">
      <button class="report-arrow-button" type="button" data-report-shift="-1" aria-label="上一期">‹</button>
      <strong>${formatReportDate(summary.range.start)} ~ ${formatReportDate(summary.range.end)}</strong>
      <button class="report-arrow-button" type="button" data-report-shift="1" aria-label="下一期">›</button>
    </div>
  `;
}

function renderPeriodSwitch() {
  const periods = [
    ["month", "月"],
    ["half-year", "半年"],
    ["year", "年"],
    ["custom", "自訂"]
  ];
  return `
    <div class="report-period-grid">
      ${periods
        .map(
          ([value, label]) => `
            <button class="${reportState.period === value ? "is-active" : ""}" type="button" data-report-period="${value}">${label}</button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderCustomRangeInputs() {
  if (reportState.period !== "custom") return "";
  return `
    <div class="report-custom-range">
      <label>
        開始
        <input id="reportStartDate" type="date" value="${escapeHtml(reportState.customStartDate)}" />
      </label>
      <label>
        結束
        <input id="reportEndDate" type="date" value="${escapeHtml(reportState.customEndDate)}" />
      </label>
    </div>
  `;
}

function renderDonut(summary) {
  const label = reportState.mode === "expense" ? "總支出" : "總收入";
  return `
    <div class="report-chart-wrap">
      <div class="report-donut" style="--report-chart: ${buildDonutGradient(summary.categories)}">
        <div class="report-donut-center">
          <span>${label}</span>
          <strong>${formatCurrency(summary.total)}</strong>
        </div>
      </div>
    </div>
  `;
}

function renderLegend(summary) {
  if (!summary.categories.length) return `<div class="empty-state">這個期間沒有${reportState.mode === "expense" ? "支出" : "收入"}資料</div>`;
  const visibleCategories = summary.categories.slice(0, 6);
  return `
    <div class="report-legend panel">
      ${visibleCategories
        .map(
          (category) => `
            <div class="report-legend-item">
              <span class="report-color-square" style="background:${category.color}"></span>
              <strong>${escapeHtml(category.name)}</strong>
              <span>${formatPercent(category.percent)}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderDetailList(summary) {
  const title = reportState.mode === "expense" ? "支出明細" : "收入明細";
  return `
    <div class="report-detail-card panel">
      <div class="report-detail-title">
        <h2>${title}</h2>
      </div>
      ${
        summary.categories.length
          ? summary.categories
              .map(
                (category) => `
                  <div class="report-detail-row">
                    <span class="report-category-dot" style="background:${category.color}">${escapeHtml(category.name.slice(0, 1))}</span>
                    <span>${escapeHtml(category.name)}</span>
                    <strong>${formatCurrency(category.amount)}</strong>
                  </div>
                `
              )
              .join("")
          : `<div class="empty-state">沒有明細可以顯示</div>`
      }
    </div>
  `;
}

export function renderMonthlyReportPage() {
  const summary = getMonthlyReportSummary();
  setHtml(
    "#monthlyReportPage",
    `
      <div class="monthly-report-page">
        ${renderModeSwitch()}
        ${renderRangeControl(summary)}
        ${renderPeriodSwitch()}
        ${renderCustomRangeInputs()}
        ${renderDonut(summary)}
        ${renderLegend(summary)}
        ${renderDetailList(summary)}
      </div>
    `
  );

  bindMonthlyReportEvents();
  requestView("monthly-report", {
    title: "月帳務報表",
    subtitle: "收入與支出分類統計",
    showBack: true
  });
}

function shiftPeriod(direction) {
  if (reportState.period === "custom") {
    const start = fromDateInputValue(reportState.customStartDate);
    const end = fromDateInputValue(reportState.customEndDate);
    const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
    start.setDate(start.getDate() + days * direction);
    end.setDate(end.getDate() + days * direction);
    reportState.customStartDate = toDateInputValue(start);
    reportState.customEndDate = toDateInputValue(end);
    return;
  }
  if (reportState.period === "half-year") reportState.anchorDate = addMonths(reportState.anchorDate, direction * 6);
  else if (reportState.period === "year") reportState.anchorDate = addYears(reportState.anchorDate, direction);
  else reportState.anchorDate = addMonths(reportState.anchorDate, direction);
}

function bindMonthlyReportEvents() {
  document.querySelectorAll("[data-report-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      reportState.mode = button.dataset.reportMode;
      renderMonthlyReportPage();
    });
  });

  document.querySelectorAll("[data-report-period]").forEach((button) => {
    button.addEventListener("click", () => {
      reportState.period = button.dataset.reportPeriod;
      renderMonthlyReportPage();
    });
  });

  document.querySelectorAll("[data-report-shift]").forEach((button) => {
    button.addEventListener("click", () => {
      shiftPeriod(Number(button.dataset.reportShift) || 0);
      renderMonthlyReportPage();
    });
  });

  $("#reportStartDate")?.addEventListener("change", (event) => {
    reportState.customStartDate = event.target.value;
    renderMonthlyReportPage();
  });

  $("#reportEndDate")?.addEventListener("change", (event) => {
    reportState.customEndDate = event.target.value;
    renderMonthlyReportPage();
  });
}
