import { data } from "./storage.js";
import { $, amountClass, escapeHtml, formatCurrency, formatPercent, requestView, setHtml } from "./utils.js";

const REPORT_COLORS = ["#e53670", "#f5cc4e", "#fb9843", "#2faf6a", "#55c2df", "#3177df", "#9659df", "#8b8b8b"];
const UNCATEGORIZED_LABEL = "未分類";

const reportState = {
  view: "chart",
  mode: "expense",
  calendarMode: "cash-flow",
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

function formatReportMonth(date) {
  return `${date.getFullYear()}/${padNumber(date.getMonth() + 1)}`;
}

function parseTransactionDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function inDateRange(date, start, end) {
  return date && date >= start && date <= end;
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
    if (!inDateRange(date, range.start, range.end)) return;
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

function getSecurityKey(item) {
  return `${String(item.symbol || "").trim().toUpperCase()}|${String(item.name || "").trim().toUpperCase()}`;
}

function getRealizedStockEvents() {
  const states = new Map();
  const events = [];
  const trades = [...data.stockTrades].sort((a, b) => {
    const dateCompare = String(a.date).localeCompare(String(b.date));
    if (dateCompare !== 0) return dateCompare;
    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });

  trades.forEach((trade) => {
    const key = `${trade.accountId}|${getSecurityKey(trade)}`;
    const state = states.get(key) || { quantity: 0, totalCost: 0, averageCost: 0 };
    const shares = Number(trade.shares) || 0;
    const price = Number(trade.price) || 0;
    const fee = Number(trade.fee) || 0;
    const tax = Number(trade.tax) || 0;

    if (trade.type === "buy") {
      state.totalCost += shares * price + fee + tax;
      state.quantity += shares;
      state.averageCost = state.quantity > 0 ? state.totalCost / state.quantity : 0;
    } else if (trade.type === "sell") {
      const sellShares = Math.min(shares, state.quantity);
      if (sellShares > 0) {
        const costBasis = state.averageCost * sellShares;
        const proceeds = sellShares * price - fee - tax;
        events.push({
          date: trade.date,
          amount: proceeds - costBasis
        });
        state.quantity -= sellShares;
        state.totalCost = state.averageCost * state.quantity;
        state.averageCost = state.quantity > 0 ? state.totalCost / state.quantity : 0;
      }
    }

    states.set(key, state);
  });

  return events;
}

function getRealizedCryptoEvents() {
  const states = new Map();
  const events = [];
  const trades = [...data.cryptoTrades].sort((a, b) => {
    const dateCompare = String(a.date).localeCompare(String(b.date));
    if (dateCompare !== 0) return dateCompare;
    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });

  trades.forEach((trade) => {
    const key = `${trade.accountId}|${getSecurityKey(trade)}`;
    const state = states.get(key) || { quantity: 0, totalCost: 0, averageCost: 0 };
    const quantity = Number(trade.quantity) || 0;
    const priceUsd = Number(trade.priceUsd) || 0;
    const fxRate = Number(trade.fxRate) || 0;
    const feeTwd = (Number(trade.feeUsd) || 0) * fxRate;

    if (trade.type === "buy") {
      state.totalCost += quantity * priceUsd * fxRate + feeTwd;
      state.quantity += quantity;
      state.averageCost = state.quantity > 0 ? state.totalCost / state.quantity : 0;
    } else if (trade.type === "sell") {
      const sellQuantity = Math.min(quantity, state.quantity);
      if (sellQuantity > 0) {
        const costBasis = state.averageCost * sellQuantity;
        const proceeds = sellQuantity * priceUsd * fxRate - feeTwd;
        events.push({
          date: trade.date,
          amount: proceeds - costBasis
        });
        state.quantity -= sellQuantity;
        state.totalCost = state.averageCost * state.quantity;
        state.averageCost = state.quantity > 0 ? state.totalCost / state.quantity : 0;
      }
    }

    states.set(key, state);
  });

  return events;
}

export function getMonthlyCalendarSummary(state = reportState) {
  const start = monthStart(state.anchorDate);
  const end = monthEnd(state.anchorDate);
  const dailyMap = new Map();

  for (let day = 1; day <= end.getDate(); day += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), day);
    dailyMap.set(toDateInputValue(date), {
      date,
      income: 0,
      expense: 0,
      realized: 0
    });
  }

  if (["cash-flow", "income", "expense"].includes(state.calendarMode)) {
    data.transactions.forEach((transaction) => {
      if (!["income", "expense"].includes(transaction.type)) return;
      const date = parseTransactionDate(transaction.date);
      if (!inDateRange(date, start, end)) return;
      const day = dailyMap.get(toDateInputValue(date));
      if (!day) return;
      day[transaction.type] += Number(transaction.amount || 0);
    });
  }

  const realizedEvents =
    state.calendarMode === "stock-realized" ? getRealizedStockEvents() : state.calendarMode === "crypto-realized" ? getRealizedCryptoEvents() : [];
  realizedEvents.forEach((event) => {
    const date = parseTransactionDate(event.date);
    if (!inDateRange(date, start, end)) return;
    const day = dailyMap.get(toDateInputValue(date));
    if (!day) return;
    day.realized += Number(event.amount || 0);
  });

  const days = Array.from(dailyMap.values()).map((day) => ({
    ...day,
    net: day.income - day.expense,
    value:
      state.calendarMode === "income"
        ? day.income
        : state.calendarMode === "expense"
          ? day.expense
          : ["stock-realized", "crypto-realized"].includes(state.calendarMode)
            ? day.realized
            : day.income - day.expense
  }));
  const totalIncome = days.reduce((total, day) => total + day.income, 0);
  const totalExpense = days.reduce((total, day) => total + day.expense, 0);
  const totalRealized = days.reduce((total, day) => total + day.realized, 0);
  const activeTotal =
    state.calendarMode === "income"
      ? totalIncome
      : state.calendarMode === "expense"
        ? totalExpense
        : ["stock-realized", "crypto-realized"].includes(state.calendarMode)
          ? totalRealized
          : totalIncome - totalExpense;
  const activeDays = days.filter((day) => hasCalendarValue(day, state.calendarMode)).length;

  return {
    start,
    end,
    days,
    firstWeekday: start.getDay(),
    totalIncome,
    totalExpense,
    totalRealized,
    activeTotal,
    activeDays,
    net: totalIncome - totalExpense,
    mode: state.calendarMode
  };
}

function getChartModeLabel() {
  return reportState.mode === "expense" ? "支出" : "收入";
}

function getCalendarModeLabel(mode = reportState.calendarMode) {
  const labels = {
    "cash-flow": "收入支出",
    income: "收入",
    expense: "支出",
    "stock-realized": "股票實現損益",
    "crypto-realized": "虛擬貨幣實現損益"
  };
  return labels[mode] || "收入支出";
}

function renderViewSwitch() {
  return `
    <div class="report-view-tabs" aria-label="月報表子頁切換">
      <button class="${reportState.view === "chart" ? "is-active" : ""}" type="button" data-report-view="chart">圓餅圖</button>
      <button class="${reportState.view === "calendar" ? "is-active" : ""}" type="button" data-report-view="calendar">月曆</button>
    </div>
  `;
}

function renderReportMenu({ label, options, modeAttribute }) {
  return `
    <details class="report-menu">
      <summary aria-label="開啟報表選單">
        <span aria-hidden="true">☰</span>
        <strong>${escapeHtml(label)}</strong>
      </summary>
      <div class="report-menu-list">
        ${options
          .map(
            (option) => `
              <button class="${option.active ? "is-active" : ""}" type="button" ${modeAttribute}="${option.value}">
                ${escapeHtml(option.label)}
              </button>
            `
          )
          .join("")}
      </div>
    </details>
  `;
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
  return renderReportMenu({
    label: getChartModeLabel(),
    modeAttribute: "data-report-mode",
    options: [
      { value: "expense", label: "支出", active: reportState.mode === "expense" },
      { value: "income", label: "收入", active: reportState.mode === "income" }
    ]
  });
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

function renderCalendarMonthControl(summary) {
  return `
    <div class="report-range-row">
      <button class="report-arrow-button" type="button" data-calendar-shift="-1" aria-label="上一月">‹</button>
      <strong>${formatReportMonth(summary.start)}</strong>
      <button class="report-arrow-button" type="button" data-calendar-shift="1" aria-label="下一月">›</button>
    </div>
  `;
}

function renderCalendarSummary(summary) {
  if (summary.mode === "cash-flow") {
    return `
      <div class="report-calendar-summary">
        <div class="mini-metric"><span>本月收入</span><strong class="amount-positive">${formatCurrency(summary.totalIncome)}</strong></div>
        <div class="mini-metric"><span>本月支出</span><strong class="amount-negative">${formatCurrency(summary.totalExpense)}</strong></div>
        <div class="mini-metric"><span>本月淨額</span><strong class="${amountClass(summary.net)}">${formatCurrency(summary.net)}</strong></div>
      </div>
    `;
  }
  const isExpense = summary.mode === "expense";
  const isRealized = ["stock-realized", "crypto-realized"].includes(summary.mode);
  const totalClass = isExpense ? "amount-negative" : isRealized ? amountClass(summary.activeTotal) : "amount-positive";
  const average = summary.activeDays > 0 ? summary.activeTotal / summary.activeDays : 0;
  return `
    <div class="report-calendar-summary">
      <div class="mini-metric"><span>本月${getCalendarModeLabel(summary.mode)}</span><strong class="${totalClass}">${formatCurrency(summary.activeTotal)}</strong></div>
      <div class="mini-metric"><span>有紀錄天數</span><strong>${summary.activeDays}</strong></div>
      <div class="mini-metric"><span>日平均</span><strong class="${totalClass}">${formatCurrency(average)}</strong></div>
    </div>
  `;
}

function renderCalendarGrid(summary) {
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const blanks = Array.from({ length: summary.firstWeekday }, (_, index) => `<div class="report-calendar-day is-empty" aria-hidden="true" data-empty-day="${index}"></div>`);
  return `
    <div class="report-calendar panel">
      <div class="report-calendar-weekdays">
        ${weekdays.map((weekday) => `<span>${weekday}</span>`).join("")}
      </div>
      <div class="report-calendar-grid">
        ${blanks.join("")}
        ${summary.days.map(renderCalendarDay).join("")}
      </div>
    </div>
  `;
}

function renderCalendarDay(day) {
  const hasRecord = hasCalendarValue(day, reportState.calendarMode);
  const stateValue = reportState.calendarMode === "expense" ? -day.value : day.value;
  const stateClass = hasRecord ? (stateValue >= 0 ? "is-positive" : "is-negative") : "";
  if (reportState.calendarMode !== "cash-flow") {
    return `
      <div class="report-calendar-day ${hasRecord ? "has-record" : ""} ${stateClass}">
        <strong>${day.date.getDate()}</strong>
        ${hasRecord ? `<span class="calendar-net ${amountClass(stateValue)}">${formatCalendarValue(day, reportState.calendarMode)}</span>` : ""}
      </div>
    `;
  }
  return `
    <div class="report-calendar-day ${hasRecord ? "has-record" : ""} ${stateClass}">
      <strong>${day.date.getDate()}</strong>
      ${day.income > 0 ? `<span class="calendar-income">+${formatCurrency(day.income)}</span>` : ""}
      ${day.expense > 0 ? `<span class="calendar-expense">-${formatCurrency(day.expense)}</span>` : ""}
      ${hasRecord ? `<span class="calendar-net ${amountClass(day.net)}">${day.net >= 0 ? "+" : ""}${formatCurrency(day.net)}</span>` : ""}
    </div>
  `;
}

function renderCalendarDailyList(summary) {
  const daysWithRecords = summary.days.filter((day) => hasCalendarValue(day, summary.mode));
  return `
    <div class="report-detail-card panel">
      <div class="report-detail-title">
        <h2>每日摘要</h2>
      </div>
      ${
        daysWithRecords.length
          ? daysWithRecords
              .map((day) => renderCalendarListRow(day, summary.mode))
              .join("")
          : `<div class="empty-state">這個月份還沒有${getCalendarModeLabel(summary.mode)}紀錄</div>`
      }
    </div>
  `;
}

function hasCalendarValue(day, mode) {
  if (mode === "cash-flow") return day.income > 0 || day.expense > 0;
  if (mode === "income") return day.income > 0;
  if (mode === "expense") return day.expense > 0;
  return day.realized !== 0;
}

function formatCalendarValue(day, mode) {
  if (mode === "income") return `+${formatCurrency(day.income)}`;
  if (mode === "expense") return `-${formatCurrency(day.expense)}`;
  const value = day.realized;
  return `${value >= 0 ? "+" : ""}${formatCurrency(value)}`;
}

function renderCalendarListRow(day, mode) {
  const rowValue = mode === "cash-flow" ? day.net : mode === "income" ? day.income : mode === "expense" ? -day.expense : day.realized;
  const prefix = mode === "expense" ? "-" : rowValue >= 0 ? "+" : "-";
  return `
    <div class="report-calendar-list-row">
      <span>${padNumber(day.date.getMonth() + 1)}/${padNumber(day.date.getDate())}</span>
      <div>
        ${
          mode === "cash-flow"
            ? `<small>收入 ${formatCurrency(day.income)}</small><small>支出 ${formatCurrency(day.expense)}</small>`
            : `<small>${escapeHtml(getCalendarModeLabel(mode))}</small>`
          }
      </div>
      <strong class="${amountClass(rowValue)}">${prefix}${formatCurrency(Math.abs(rowValue))}</strong>
    </div>
  `;
}

function renderCalendarPage() {
  const summary = getMonthlyCalendarSummary();
  return `
    ${renderReportMenu({
      label: getCalendarModeLabel(),
      modeAttribute: "data-calendar-mode",
      options: [
        { value: "cash-flow", label: "收入支出", active: reportState.calendarMode === "cash-flow" },
        { value: "income", label: "收入", active: reportState.calendarMode === "income" },
        { value: "expense", label: "支出", active: reportState.calendarMode === "expense" },
        { value: "stock-realized", label: "股票實現損益", active: reportState.calendarMode === "stock-realized" },
        { value: "crypto-realized", label: "虛擬貨幣實現損益", active: reportState.calendarMode === "crypto-realized" }
      ]
    })}
    ${renderCalendarMonthControl(summary)}
    ${renderCalendarSummary(summary)}
    ${renderCalendarGrid(summary)}
    ${renderCalendarDailyList(summary)}
  `;
}

function renderChartPage(summary) {
  return `
    ${renderModeSwitch()}
    ${renderRangeControl(summary)}
    ${renderPeriodSwitch()}
    ${renderCustomRangeInputs()}
    ${renderDonut(summary)}
    ${renderLegend(summary)}
    ${renderDetailList(summary)}
  `;
}

export function renderMonthlyReportPage() {
  const summary = getMonthlyReportSummary();
  setHtml(
    "#monthlyReportPage",
    `
      <div class="monthly-report-page">
        ${renderViewSwitch()}
        <div class="report-subpage">
          ${reportState.view === "calendar" ? renderCalendarPage() : renderChartPage(summary)}
        </div>
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
  document.querySelectorAll("[data-report-view]").forEach((button) => {
    button.addEventListener("click", () => {
      reportState.view = button.dataset.reportView;
      renderMonthlyReportPage();
    });
  });

  document.querySelectorAll("[data-report-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      reportState.mode = button.dataset.reportMode;
      renderMonthlyReportPage();
    });
  });

  document.querySelectorAll("[data-calendar-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      reportState.calendarMode = button.dataset.calendarMode;
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

  document.querySelectorAll("[data-calendar-shift]").forEach((button) => {
    button.addEventListener("click", () => {
      reportState.anchorDate = addMonths(reportState.anchorDate, Number(button.dataset.calendarShift) || 0);
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
