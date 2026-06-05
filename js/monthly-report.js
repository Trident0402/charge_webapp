import { data } from "./storage.js";
import { $, amountClass, escapeHtml, formatCurrency, formatNumber, formatPercent, requestView, setHtml } from "./utils.js";

const REPORT_COLORS = ["#e53670", "#f5cc4e", "#fb9843", "#2faf6a", "#55c2df", "#3177df", "#9659df", "#8b8b8b"];
const UNCATEGORIZED_LABEL = "未分類";

const reportState = {
  view: "calendar",
  mode: "expense",
  calendarMode: "daily-profit",
  period: "month",
  anchorDate: new Date(),
  customStartDate: toDateInputValue(monthStart(new Date())),
  customEndDate: toDateInputValue(monthEnd(new Date())),
  annualPage: "home",
  annualChartMode: "cashflow",
  selectedAnnualMonth: new Date().getMonth(),
  expandedAnnualMonths: []
};

function isLiabilityTransaction(transaction) {
  return data.accounts.find((account) => account.id === transaction.accountId)?.type === "liability";
}

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
    if (isLiabilityTransaction(transaction)) return;
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

function getSecurityAliasKey(value) {
  return String(value || "").trim().toUpperCase();
}

function getCryptoTradeType(trade) {
  return trade.type === "profit" ? "buy" : trade.type;
}

function getCryptoRealizedEffect(trade) {
  if (trade.realizedEffect === "profit" || trade.realizedEffect === "loss") return trade.realizedEffect;
  return trade.type === "profit" ? "profit" : "";
}

function getCryptoUnitPriceUsd(trade) {
  const quantity = Number(trade.quantity) || 0;
  if (trade.type === "profit") return quantity > 0 ? (Number(trade.priceUsd) || 0) / quantity : Number(trade.priceUsd) || 0;
  return Number(trade.priceUsd) || 0;
}

function getCryptoGrossValueTwd(trade) {
  const fxRate = Number(trade.fxRate) || 0;
  if (trade.type === "profit") return (Number(trade.priceUsd) || 0) * fxRate;
  return (Number(trade.quantity) || 0) * (Number(trade.priceUsd) || 0) * fxRate;
}

function getTransactionsUntil(accountId, endDate) {
  return data.transactions.filter((transaction) => {
    if (transaction.accountId !== accountId) return false;
    const date = parseTransactionDate(transaction.date);
    return date && date <= endDate;
  });
}

function getCashBalanceAt(account, endDate) {
  return getTransactionsUntil(account.id, endDate).reduce((balance, transaction) => {
    if (["expense", "transfer-out"].includes(transaction.type)) return balance - Number(transaction.amount || 0);
    return balance + Number(transaction.amount || 0);
  }, Number(account.initialBalance) || 0);
}

function getCashAssetsAt(endDate) {
  return data.accounts
    .filter((account) => !["stock", "crypto", "liability"].includes(account.type))
    .reduce((total, account) => total + getCashBalanceAt(account, endDate), 0);
}

function getLatestStockPriceAt(holding, endDate) {
  const aliases = [...(holding.symbols || []), ...(holding.names || []), holding.symbol, holding.name]
    .map(getSecurityAliasKey)
    .filter(Boolean);
  const prices = data.stockPrices
    .filter((price) => aliases.includes(getSecurityAliasKey(price.symbol)))
    .filter((price) => {
      const date = parseTransactionDate(price.date);
      return date && date <= endDate;
    })
    .sort((a, b) => {
      const dateCompare = String(b.date).localeCompare(String(a.date));
      if (dateCompare !== 0) return dateCompare;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
  return prices[0]?.price ?? null;
}

function getStockMarketValueAt(endDate) {
  const holdings = [];
  const trades = data.stockTrades
    .filter((trade) => {
      const date = parseTransactionDate(trade.date);
      return date && date <= endDate;
    })
    .sort((a, b) => {
      const dateCompare = String(a.date).localeCompare(String(b.date));
      if (dateCompare !== 0) return dateCompare;
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });

  trades.forEach((trade) => {
    let holding = holdings.find((item) => {
      const symbols = (item.symbols || [item.symbol]).map(getSecurityAliasKey);
      const names = (item.names || [item.name]).map(getSecurityAliasKey);
      return symbols.includes(getSecurityAliasKey(trade.symbol)) || names.includes(getSecurityAliasKey(trade.name));
    });
    if (!holding) {
      holding = {
        symbol: trade.symbol,
        name: trade.name,
        symbols: [trade.symbol].filter(Boolean),
        names: [trade.name].filter(Boolean),
        shares: 0,
        totalCost: 0,
        averageCost: 0,
        latestBuyPrice: 0,
        latestBuyDate: ""
      };
      holdings.push(holding);
    }
    if (trade.symbol && !holding.symbols.map(getSecurityAliasKey).includes(getSecurityAliasKey(trade.symbol))) holding.symbols.push(trade.symbol);
    if (trade.name && !holding.names.map(getSecurityAliasKey).includes(getSecurityAliasKey(trade.name))) holding.names.push(trade.name);

    const shares = Number(trade.shares) || 0;
    const price = Number(trade.price) || 0;
    if (trade.type === "buy") {
      holding.totalCost += shares * price + Number(trade.fee || 0) + Number(trade.tax || 0);
      holding.shares += shares;
      if (!holding.latestBuyDate || String(trade.date).localeCompare(holding.latestBuyDate) >= 0) {
        holding.latestBuyDate = trade.date;
        holding.latestBuyPrice = price;
      }
    } else if (trade.type === "sell") {
      const sellShares = Math.min(shares, holding.shares);
      holding.shares -= sellShares;
      holding.totalCost = holding.averageCost * holding.shares;
    }
    holding.averageCost = holding.shares > 0 ? holding.totalCost / holding.shares : 0;
  });

  return holdings
    .filter((holding) => holding.shares > 0)
    .reduce((total, holding) => {
      const latestPrice = getLatestStockPriceAt(holding, endDate) ?? holding.latestBuyPrice ?? holding.averageCost;
      return total + holding.shares * latestPrice;
    }, 0);
}

function getLatestCryptoPriceAt(accountId, holding, endDate) {
  const aliases = [...(holding.symbols || []), ...(holding.names || []), holding.symbol, holding.name]
    .map(getSecurityAliasKey)
    .filter(Boolean);
  const prices = data.cryptoPrices
    .filter((price) => price.accountId === accountId && aliases.includes(getSecurityAliasKey(price.symbol)))
    .filter((price) => {
      const date = parseTransactionDate(price.date);
      return date && date <= endDate;
    })
    .sort((a, b) => {
      const dateCompare = String(b.date).localeCompare(String(a.date));
      if (dateCompare !== 0) return dateCompare;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
  return prices[0] ? { priceUsd: Number(prices[0].priceUsd) || 0, fxRate: Number(prices[0].fxRate) || 0 } : null;
}

function getCryptoMarketValueAt(endDate) {
  const holdings = [];
  const trades = data.cryptoTrades
    .filter((trade) => {
      const date = parseTransactionDate(trade.date);
      return date && date <= endDate;
    })
    .sort((a, b) => {
      const dateCompare = String(a.date).localeCompare(String(b.date));
      if (dateCompare !== 0) return dateCompare;
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });

  trades.forEach((trade) => {
    const keyPrefix = trade.accountId;
    let holding = holdings.find((item) => {
      if (item.accountId !== keyPrefix) return false;
      const symbols = (item.symbols || [item.symbol]).map(getSecurityAliasKey);
      const names = (item.names || [item.name]).map(getSecurityAliasKey);
      return symbols.includes(getSecurityAliasKey(trade.symbol)) || names.includes(getSecurityAliasKey(trade.name));
    });
    if (!holding) {
      holding = {
        accountId: keyPrefix,
        symbol: trade.symbol,
        name: trade.name,
        symbols: [trade.symbol].filter(Boolean),
        names: [trade.name].filter(Boolean),
        quantity: 0,
        totalCost: 0,
        averageCost: 0,
        latestBuyPriceUsd: 0,
        latestBuyFxRate: 0,
        latestBuyDate: ""
      };
      holdings.push(holding);
    }
    if (trade.symbol && !holding.symbols.map(getSecurityAliasKey).includes(getSecurityAliasKey(trade.symbol))) holding.symbols.push(trade.symbol);
    if (trade.name && !holding.names.map(getSecurityAliasKey).includes(getSecurityAliasKey(trade.name))) holding.names.push(trade.name);

    const quantity = Number(trade.quantity) || 0;
    const priceUsd = Number(trade.priceUsd) || 0;
    const fxRate = Number(trade.fxRate) || 0;
    const feeTwd = (Number(trade.feeUsd) || 0) * fxRate;
    const tradeType = getCryptoTradeType(trade);
    if (tradeType === "buy") {
      holding.totalCost += getCryptoGrossValueTwd(trade) + feeTwd;
      holding.quantity += quantity;
      holding.latestBuyPriceUsd = getCryptoUnitPriceUsd(trade);
      holding.latestBuyFxRate = fxRate;
      holding.latestBuyDate = trade.date;
    } else if (tradeType === "sell") {
      const sellQuantity = Math.min(quantity, holding.quantity);
      holding.quantity -= sellQuantity;
      holding.totalCost = holding.averageCost * holding.quantity;
    }
    holding.averageCost = holding.quantity > 0 ? holding.totalCost / holding.quantity : 0;
  });

  return holdings
    .filter((holding) => holding.quantity > 0)
    .reduce((total, holding) => {
      const latestPrice = getLatestCryptoPriceAt(holding.accountId, holding, endDate);
      const priceUsd = latestPrice?.priceUsd ?? holding.latestBuyPriceUsd ?? 0;
      const fxRate = latestPrice?.fxRate ?? holding.latestBuyFxRate ?? 1;
      return total + holding.quantity * priceUsd * fxRate;
    }, 0);
}

function calculateMonthlyPayment(principal, annualInterestRate, repaymentMonths) {
  const amount = Math.abs(Number(principal) || 0);
  const months = Math.max(0, Math.floor(Number(repaymentMonths) || 0));
  const annualRate = Math.max(0, Number(annualInterestRate) || 0);
  if (!amount || !months) return 0;
  const monthlyRate = annualRate / 100 / 12;
  if (!monthlyRate) return amount / months;
  const factor = (1 + monthlyRate) ** months;
  return (amount * monthlyRate * factor) / (factor - 1);
}

function calculateTotalRepayment(principal, annualInterestRate, repaymentMonths) {
  const amount = Math.abs(Number(principal) || 0);
  const months = Math.max(0, Math.floor(Number(repaymentMonths) || 0));
  if (!amount) return 0;
  if (!months) return amount;
  return calculateMonthlyPayment(amount, annualInterestRate, months) * months;
}

function getLiabilityDebtAt(account, endDate) {
  const transactions = getTransactionsUntil(account.id, endDate);
  const initialPrincipal = Math.abs(Number(account.initialBalance) || 0);
  const borrowed = transactions
    .filter((transaction) => ["income", "transfer-out"].includes(transaction.type))
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
  const paid = transactions
    .filter((transaction) => ["expense", "transfer-in"].includes(transaction.type))
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
  const borrowedTotal = calculateTotalRepayment(initialPrincipal + borrowed, account.annualInterestRate, account.repaymentMonths);
  return Math.max(0, borrowedTotal - paid);
}

function getLiabilityTotalAt(endDate) {
  return data.accounts
    .filter((account) => account.type === "liability")
    .reduce((total, account) => total + getLiabilityDebtAt(account, endDate), 0);
}

function getTotalAssetsAt(endDate) {
  return getCashAssetsAt(endDate) + getStockMarketValueAt(endDate) + getCryptoMarketValueAt(endDate);
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

    const tradeType = getCryptoTradeType(trade);
    const realizedEffect = getCryptoRealizedEffect(trade);
    const grossValueTwd = getCryptoGrossValueTwd(trade);

    if (tradeType === "buy") {
      state.totalCost += grossValueTwd + feeTwd;
      state.quantity += quantity;
      state.averageCost = state.quantity > 0 ? state.totalCost / state.quantity : 0;
      if (realizedEffect === "profit") {
        events.push({
          date: trade.date,
          amount: grossValueTwd - feeTwd
        });
      }
    } else if (tradeType === "sell") {
      const sellQuantity = Math.min(quantity, state.quantity);
      if (sellQuantity > 0) {
        const costBasis = state.averageCost * sellQuantity;
        const proceeds = sellQuantity * priceUsd * fxRate - feeTwd;
        events.push({
          date: trade.date,
          amount: realizedEffect === "loss" ? -(grossValueTwd + feeTwd) : proceeds - costBasis
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
      stockRealized: 0,
      cryptoRealized: 0
    });
  }

  data.transactions.forEach((transaction) => {
    if (isLiabilityTransaction(transaction)) return;
    if (!["income", "expense"].includes(transaction.type)) return;
    const date = parseTransactionDate(transaction.date);
    if (!inDateRange(date, start, end)) return;
    const day = dailyMap.get(toDateInputValue(date));
    if (!day) return;
    day[transaction.type] += Number(transaction.amount || 0);
  });

  getRealizedStockEvents().forEach((event) => {
    const date = parseTransactionDate(event.date);
    if (!inDateRange(date, start, end)) return;
    const day = dailyMap.get(toDateInputValue(date));
    if (!day) return;
    day.stockRealized += Number(event.amount || 0);
  });

  getRealizedCryptoEvents().forEach((event) => {
    const date = parseTransactionDate(event.date);
    if (!inDateRange(date, start, end)) return;
    const day = dailyMap.get(toDateInputValue(date));
    if (!day) return;
    day.cryptoRealized += Number(event.amount || 0);
  });

  const days = Array.from(dailyMap.values()).map((day) => ({
    ...day,
    net: day.income - day.expense,
    totalProfit: day.income - day.expense + day.stockRealized + day.cryptoRealized,
    value: getCalendarDayValue(day, state.calendarMode)
  }));
  const totalIncome = days.reduce((total, day) => total + day.income, 0);
  const totalExpense = days.reduce((total, day) => total + day.expense, 0);
  const totalStockRealized = days.reduce((total, day) => total + day.stockRealized, 0);
  const totalCryptoRealized = days.reduce((total, day) => total + day.cryptoRealized, 0);
  const totalRealized = totalStockRealized + totalCryptoRealized;
  const net = totalIncome - totalExpense;
  const activeTotal = days.reduce((total, day) => total + day.value, 0);
  const activeDays = days.filter((day) => hasCalendarValue(day, state.calendarMode)).length;

  return {
    start,
    end,
    days,
    firstWeekday: start.getDay(),
    totalIncome,
    totalExpense,
    totalStockRealized,
    totalCryptoRealized,
    totalRealized,
    activeTotal,
    activeDays,
    net,
    mode: state.calendarMode
  };
}

function getCalendarDayValue(day, mode) {
  if (mode === "stock-realized") return day.stockRealized;
  if (mode === "crypto-realized") return day.cryptoRealized;
  if (mode === "total-profit") return day.income - day.expense + day.stockRealized + day.cryptoRealized;
  return day.income - day.expense;
}

function getChartModeLabel() {
  return reportState.mode === "expense" ? "支出" : "收入";
}

function getCalendarModeLabel(mode = reportState.calendarMode) {
  const labels = {
    "daily-profit": "日常損益",
    "stock-realized": "股票帳戶實現收益",
    "crypto-realized": "虛擬貨幣帳戶實現收益",
    "total-profit": "總損益"
  };
  return labels[mode] || "日常損益";
}

function renderViewSwitch() {
  return `
    <div class="report-view-tabs" aria-label="月報表子頁切換">
      <button class="${reportState.view === "calendar" ? "is-active" : ""}" type="button" data-report-view="calendar">月曆</button>
      <button class="${reportState.view === "chart" ? "is-active" : ""}" type="button" data-report-view="chart">圓餅圖</button>
      <button class="${reportState.view === "annual" ? "is-active" : ""}" type="button" data-report-view="annual">年度資產總覽</button>
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

function renderCalendarModeSwitch() {
  return renderReportMenu({
    label: getCalendarModeLabel(),
    modeAttribute: "data-calendar-mode",
    options: [
      { value: "daily-profit", label: "日常損益", active: reportState.calendarMode === "daily-profit" },
      { value: "stock-realized", label: "股票帳戶實現收益", active: reportState.calendarMode === "stock-realized" },
      { value: "crypto-realized", label: "虛擬貨幣帳戶實現收益", active: reportState.calendarMode === "crypto-realized" },
      { value: "total-profit", label: "總損益", active: reportState.calendarMode === "total-profit" }
    ]
  });
}

function renderReportTopbar() {
  return `
    <div class="report-topbar">
      ${renderViewSwitch()}
      ${reportState.view === "calendar" ? renderCalendarModeSwitch() : reportState.view === "chart" ? renderModeSwitch() : ""}
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
  if (summary.mode === "daily-profit") {
    return `
      <div class="report-calendar-summary">
        <div class="mini-metric"><span>本月收入</span><strong class="amount-positive">${formatCurrency(summary.totalIncome)}</strong></div>
        <div class="mini-metric"><span>本月支出</span><strong class="amount-negative">${formatCurrency(summary.totalExpense)}</strong></div>
        <div class="mini-metric"><span>日常損益</span><strong class="${amountClass(summary.net)}">${formatCurrency(summary.net)}</strong></div>
      </div>
    `;
  }
  const totalClass = amountClass(summary.activeTotal);
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
  const stateValue = day.value;
  const stateClass = hasRecord ? (stateValue >= 0 ? "is-positive" : "is-negative") : "";
  if (reportState.calendarMode !== "daily-profit") {
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
  if (mode === "daily-profit") return day.income > 0 || day.expense > 0;
  if (mode === "stock-realized") return day.stockRealized !== 0;
  if (mode === "crypto-realized") return day.cryptoRealized !== 0;
  return day.totalProfit !== 0;
}

function formatCalendarValue(day, mode) {
  const value = getCalendarDayValue(day, mode);
  return `${value >= 0 ? "+" : ""}${formatCurrency(value)}`;
}

function renderCalendarListRow(day, mode) {
  const rowValue = getCalendarDayValue(day, mode);
  const prefix = rowValue >= 0 ? "+" : "-";
  return `
    <div class="report-calendar-list-row">
      <span>${padNumber(day.date.getMonth() + 1)}/${padNumber(day.date.getDate())}</span>
      <div>
        ${
          mode === "daily-profit"
            ? `<small>收入 ${formatCurrency(day.income)}</small><small>支出 ${formatCurrency(day.expense)}</small>`
            : mode === "total-profit"
              ? `<small>日常 ${formatCurrency(day.net)}</small><small>股票 ${formatCurrency(day.stockRealized)} · 虛擬 ${formatCurrency(day.cryptoRealized)}</small>`
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
    ${renderCalendarMonthControl(summary)}
    ${renderCalendarSummary(summary)}
    ${renderCalendarGrid(summary)}
    ${renderCalendarDailyList(summary)}
  `;
}

function renderChartPage(summary) {
  return `
    <div class="report-chart-page">
      ${renderRangeControl(summary)}
      ${renderPeriodSwitch()}
      ${renderCustomRangeInputs()}
      ${renderDonut(summary)}
      ${renderLegend(summary)}
      ${renderDetailList(summary)}
    </div>
  `;
}

function getAnnualYear() {
  return reportState.anchorDate.getFullYear();
}

function isSalaryCategory(category) {
  return String(category || "").trim() === "薪資";
}

function getAnnualMonthSummary(year, monthIndex) {
  const start = new Date(year, monthIndex, 1);
  const end = monthEnd(start);
  const monthTransactions = data.transactions.filter((transaction) => {
    if (isLiabilityTransaction(transaction)) return false;
    if (!["income", "expense"].includes(transaction.type)) return false;
    const account = data.accounts.find((item) => item.id === transaction.accountId);
    if (!account || ["stock", "crypto", "liability"].includes(account.type)) return false;
    const date = parseTransactionDate(transaction.date);
    return inDateRange(date, start, end);
  });

  const totalIncome = monthTransactions
    .filter((transaction) => transaction.type === "income")
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
  const salaryIncome = monthTransactions
    .filter((transaction) => transaction.type === "income" && isSalaryCategory(transaction.category))
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
  const nonSalaryIncome = monthTransactions
    .filter((transaction) => transaction.type === "income" && !isSalaryCategory(transaction.category))
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
  const totalExpense = monthTransactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
  const totalAssets = getTotalAssetsAt(end);
  const liability = getLiabilityTotalAt(end);

  return {
    monthIndex,
    label: `${monthIndex + 1}月`,
    start,
    end,
    totalIncome,
    salaryIncome,
    nonSalaryIncome,
    totalExpense,
    net: totalIncome - totalExpense,
    totalAssets,
    liability,
    netWorth: totalAssets - liability
  };
}

export function getAnnualReportSummary(year = getAnnualYear()) {
  const months = Array.from({ length: 12 }, (_, monthIndex) => getAnnualMonthSummary(year, monthIndex));
  const now = new Date();
  const activeMonthIndex = year === now.getFullYear() ? now.getMonth() : 11;
  const activeMonth = months[Math.min(11, Math.max(0, activeMonthIndex))];
  const totalIncome = months.reduce((total, month) => total + month.totalIncome, 0);
  const totalExpense = months.reduce((total, month) => total + month.totalExpense, 0);
  const salaryIncome = months.reduce((total, month) => total + month.salaryIncome, 0);
  const nonSalaryIncome = months.reduce((total, month) => total + month.nonSalaryIncome, 0);
  const annualNet = totalIncome - totalExpense;
  const averageMonthlyNet = annualNet / 12;
  const averageNonSalaryIncome = nonSalaryIncome / 12;
  const nonSalaryRatio = totalIncome > 0 ? (nonSalaryIncome / totalIncome) * 100 : 0;

  return {
    year,
    months,
    activeMonth,
    totalIncome,
    totalExpense,
    salaryIncome,
    nonSalaryIncome,
    annualNet,
    averageMonthlyNet,
    averageNonSalaryIncome,
    nonSalaryRatio,
    totalAssets: activeMonth.totalAssets,
    liability: activeMonth.liability,
    netWorth: activeMonth.netWorth,
    netWorthRate: activeMonth.totalAssets > 0 ? (activeMonth.netWorth / activeMonth.totalAssets) * 100 : 0
  };
}

function renderAnnualYearControl(summary) {
  return `
    <div class="annual-year-row">
      <button class="report-arrow-button" type="button" data-annual-year-shift="-1" aria-label="上一年">‹</button>
      <strong>${summary.year} 年度</strong>
      <button class="report-arrow-button" type="button" data-annual-year-shift="1" aria-label="下一年">›</button>
    </div>
  `;
}

function renderAnnualHome(summary) {
  return `
    ${renderAnnualYearControl(summary)}
    <section class="annual-hero-card">
      <span>年度總淨資產</span>
      <strong class="${amountClass(summary.netWorth)}">${formatCurrency(summary.netWorth)}</strong>
      <div class="annual-hero-metrics">
        <button type="button" data-annual-page="trends">
          <span>年度總資產</span>
          <strong>${formatCurrency(summary.totalAssets)}</strong>
        </button>
        <button type="button" data-annual-page="trends">
          <span>目前總負債</span>
          <strong>${formatCurrency(summary.liability)}</strong>
        </button>
      </div>
      <p>淨值率 ${formatPercent(summary.netWorthRate)} · 平均每月損益 ${formatCurrency(summary.averageMonthlyNet)}</p>
    </section>
    <div class="annual-entry-grid">
      <button class="annual-entry-card" type="button" data-annual-page="trends">
        <span>趨勢圖</span>
        <strong>看 12 個月變化</strong>
        <small>收支、損益、資產與負債</small>
        <span class="annual-entry-arrow" aria-hidden="true">&rsaquo;</span>
      </button>
      <button class="annual-entry-card" type="button" data-annual-page="income">
        <span>收入結構</span>
        <strong>非工資收入 ${formatPercent(summary.nonSalaryRatio)}</strong>
        <small>月均 ${formatCurrency(summary.averageNonSalaryIncome)}</small>
        <span class="annual-entry-arrow" aria-hidden="true">&rsaquo;</span>
      </button>
      <button class="annual-entry-card" type="button" data-annual-page="months">
        <span>月份明細</span>
        <strong>展開 12 個月</strong>
        <small>查看完整六項指標</small>
        <span class="annual-entry-arrow" aria-hidden="true">&rsaquo;</span>
      </button>
    </div>
  `;
}

function renderAnnualPageHeader(title, summary) {
  return `
    <div class="annual-page-header">
      <button class="icon-button" type="button" data-annual-page="home" aria-label="返回年度首頁"><span aria-hidden="true">‹</span></button>
      <div>
        <h2>${escapeHtml(title)}</h2>
        <p>${summary.year} 年度</p>
      </div>
    </div>
    ${renderAnnualYearControl(summary)}
  `;
}

function getChartMax(months, keys) {
  return Math.max(
    1,
    ...months.flatMap((month) => keys.map((key) => Math.abs(Number(month[key]) || 0)))
  );
}

function formatCompactCurrency(value) {
  const amount = Number(value) || 0;
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 10000) return `${sign}$${formatNumber(abs / 10000, abs >= 100000 ? 0 : 1)}萬`;
  return `${sign}$${formatNumber(abs, 0)}`;
}

function renderCashflowBars(months) {
  const maxValue = getChartMax(months, ["totalIncome", "totalExpense"]);
  const maxNet = getChartMax(months, ["net"]);
  return `
    <div class="annual-cashflow-chart">
      <span class="annual-zero-line" aria-hidden="true"></span>
      ${months
        .map((month) => {
          const incomeHeight = month.totalIncome > 0 ? Math.max(4, (month.totalIncome / maxValue) * 100) : 0;
          const expenseHeight = month.totalExpense > 0 ? Math.max(4, (month.totalExpense / maxValue) * 100) : 0;
          const netOffset = Math.max(-44, Math.min(44, (month.net / maxNet) * 44));
          const showNet = month.net !== 0;
          return `
            <button class="${reportState.selectedAnnualMonth === month.monthIndex ? "is-active" : ""}" type="button" data-annual-select-month="${month.monthIndex}">
              ${
                showNet
                  ? `<span class="annual-net-marker ${amountClass(month.net)}" style="--net-offset:${netOffset}px"><i></i><b>${formatCompactCurrency(month.net)}</b></span>`
                  : `<span class="annual-net-marker is-zero" style="--net-offset:0px"><i></i></span>`
              }
              <span class="annual-bar-pair">
                <i class="income-bar" style="height:${incomeHeight}%">${month.totalIncome > 0 ? `<em>${formatCompactCurrency(month.totalIncome)}</em>` : ""}</i>
                <i class="expense-bar" style="height:${expenseHeight}%">${month.totalExpense > 0 ? `<em>${formatCompactCurrency(month.totalExpense)}</em>` : ""}</i>
              </span>
              <small>${month.monthIndex + 1}</small>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderLineChart(months, primaryKey, secondaryKey) {
  const width = 330;
  const height = 190;
  const padding = 30;
  const maxValue = Math.max(1, ...months.flatMap((month) => [Number(month[primaryKey]) || 0, Number(month[secondaryKey]) || 0]));
  const point = (month, key) => {
    const x = padding + (month.monthIndex / 11) * (width - padding * 2);
    const y = height - padding - ((Number(month[key]) || 0) / maxValue) * (height - padding * 2);
    return { x, y };
  };
  const pointsText = (key) => months.map((month) => {
    const { x, y } = point(month, key);
    return `${x},${y}`;
  }).join(" ");
  return `
    <svg class="annual-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="年度資產與負債趨勢">
      <polyline class="asset-line" points="${pointsText(primaryKey)}"></polyline>
      <polyline class="debt-line" points="${pointsText(secondaryKey)}"></polyline>
      ${months
        .map((month) => {
          const asset = point(month, primaryKey);
          const debt = point(month, secondaryKey);
          const assetLabelY = Math.max(12, asset.y - 8);
          const debtLabelY = Math.min(height - 4, debt.y + 16);
          return `
            <circle class="asset-point" cx="${asset.x}" cy="${asset.y}" r="3.2"></circle>
            <text class="asset-label" x="${asset.x}" y="${assetLabelY}">${formatCompactCurrency(month[primaryKey])}</text>
            <circle class="debt-point" cx="${debt.x}" cy="${debt.y}" r="3.2"></circle>
            <text class="debt-label" x="${debt.x}" y="${debtLabelY}">${formatCompactCurrency(month[secondaryKey])}</text>
          `;
        })
        .join("")}
    </svg>
  `;
}

function renderAnnualTrendPage(summary) {
  const selectedMonth = summary.months[reportState.selectedAnnualMonth] || summary.months[0];
  return `
    ${renderAnnualPageHeader("趨勢圖", summary)}
    <div class="annual-chart-mode-row">
      <button class="${reportState.annualChartMode === "cashflow" ? "is-active" : ""}" type="button" data-annual-chart-mode="cashflow">收支與損益</button>
      <button class="${reportState.annualChartMode === "assets" ? "is-active" : ""}" type="button" data-annual-chart-mode="assets">資產與負債</button>
    </div>
    <section class="panel annual-chart-panel">
      ${
        reportState.annualChartMode === "cashflow"
          ? renderCashflowBars(summary.months)
          : renderLineChart(summary.months, "totalAssets", "liability")
      }
      <div class="annual-selected-summary">
        <strong>${selectedMonth.label}</strong>
        ${
          reportState.annualChartMode === "cashflow"
            ? `<span>收入 ${formatCurrency(selectedMonth.totalIncome)}</span><span>支出 ${formatCurrency(selectedMonth.totalExpense)}</span><span class="${amountClass(selectedMonth.net)}">損益 ${formatCurrency(selectedMonth.net)}</span>`
            : `<span>資產 ${formatCurrency(selectedMonth.totalAssets)}</span><span>負債 ${formatCurrency(selectedMonth.liability)}</span><span class="${amountClass(selectedMonth.netWorth)}">淨值 ${formatCurrency(selectedMonth.netWorth)}</span>`
        }
      </div>
    </section>
  `;
}

function renderAnnualIncomePage(summary) {
  const salaryPercent = summary.totalIncome > 0 ? (summary.salaryIncome / summary.totalIncome) * 100 : 0;
  const passivePercent = summary.totalIncome > 0 ? (summary.nonSalaryIncome / summary.totalIncome) * 100 : 0;
  return `
    ${renderAnnualPageHeader("收入結構", summary)}
    <section class="panel annual-income-panel">
      <div class="annual-income-total">
        <span>年度總收入</span>
        <strong>${formatCurrency(summary.totalIncome)}</strong>
      </div>
      <div class="annual-income-bar" aria-label="工資與非工資收入比例">
        <span class="salary-part" style="width:${salaryPercent}%"></span>
        <span class="passive-part" style="width:${passivePercent}%"></span>
      </div>
      <div class="annual-income-grid">
        <div><span>工資收入</span><strong>${formatCurrency(summary.salaryIncome)}</strong></div>
        <div><span>非工資收入</span><strong>${formatCurrency(summary.nonSalaryIncome)}</strong></div>
        <div><span>非工資占比</span><strong>${formatPercent(summary.nonSalaryRatio)}</strong></div>
        <div><span>月均非工資</span><strong>${formatCurrency(summary.averageNonSalaryIncome)}</strong></div>
      </div>
      <p>${summary.nonSalaryIncome > 0 ? `今年平均每月多了 ${formatCurrency(summary.averageNonSalaryIncome)} 非工資收入。` : "開始記錄非工資收入後，這裡會顯示比例。"}</p>
    </section>
  `;
}

function renderAnnualMonthsPage(summary) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  return `
    ${renderAnnualPageHeader("月份明細", summary)}
    <div class="annual-month-list">
      ${summary.months
        .map((month) => {
          const isCurrent = summary.year === currentYear && month.monthIndex === currentMonth;
          const isOpen = reportState.expandedAnnualMonths.includes(month.monthIndex);
          return `
            <article class="annual-month-card ${isCurrent ? "is-current" : ""}">
              <button type="button" data-toggle-annual-month="${month.monthIndex}">
                <span>${month.label}</span>
                <strong class="${amountClass(month.net)}">${month.net >= 0 ? "留下" : "超支"} ${formatCurrency(Math.abs(month.net))}</strong>
                <small>資產 ${formatCurrency(month.totalAssets)} · 負債 ${formatCurrency(month.liability)}</small>
              </button>
              ${
                isOpen
                  ? `
                    <div class="annual-month-details">
                      <div><span>非工資收入</span><strong>${formatCurrency(month.nonSalaryIncome)}</strong></div>
                      <div><span>總收入</span><strong>${formatCurrency(month.totalIncome)}</strong></div>
                      <div><span>總支出</span><strong>${formatCurrency(month.totalExpense)}</strong></div>
                      <div><span>月損益</span><strong class="${amountClass(month.net)}">${formatCurrency(month.net)}</strong></div>
                      <div><span>月總資產</span><strong>${formatCurrency(month.totalAssets)}</strong></div>
                      <div><span>負債</span><strong>${formatCurrency(month.liability)}</strong></div>
                    </div>
                  `
                  : ""
              }
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderAnnualReportPage() {
  const summary = getAnnualReportSummary();
  if (reportState.annualPage === "trends") return renderAnnualTrendPage(summary);
  if (reportState.annualPage === "income") return renderAnnualIncomePage(summary);
  if (reportState.annualPage === "months") return renderAnnualMonthsPage(summary);
  return renderAnnualHome(summary);
}

export function renderMonthlyReportPage() {
  const summary = getMonthlyReportSummary();
  const subpageHtml =
    reportState.view === "calendar"
      ? renderCalendarPage()
      : reportState.view === "chart"
        ? renderChartPage(summary)
        : renderAnnualReportPage();
  setHtml(
    "#monthlyReportPage",
    `
      <div class="monthly-report-page">
        ${renderReportTopbar()}
        <div class="report-subpage">
          ${subpageHtml}
        </div>
      </div>
    `
  );

  bindMonthlyReportEvents();
  requestView("monthly-report", {
    title: reportState.view === "annual" ? "年度資產總覽" : "月帳務報表",
    subtitle: reportState.view === "annual" ? "年度財務儀表板" : "收入與支出分類統計",
    showBack: false
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

function openAnnualPage(page) {
  if (!page) return;
  reportState.annualPage = page;
  renderMonthlyReportPage();
}

function bindMonthlyReportEvents() {
  document.querySelectorAll("[data-report-view]").forEach((button) => {
    button.addEventListener("click", () => {
      reportState.view = button.dataset.reportView;
      if (reportState.view === "annual") reportState.annualPage = "home";
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

  document.querySelectorAll("[data-annual-year-shift]").forEach((button) => {
    button.addEventListener("click", () => {
      reportState.anchorDate = addYears(reportState.anchorDate, Number(button.dataset.annualYearShift) || 0);
      renderMonthlyReportPage();
    });
  });

  document.querySelectorAll("[data-annual-page]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openAnnualPage(button.dataset.annualPage);
    });
  });

  if (document.body.dataset.annualPageNavBound !== "true") {
    document.body.dataset.annualPageNavBound = "true";
    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target.closest("[data-annual-page]");
      const monthlyReportPage = $("#monthlyReportPage");
      if (!target || !monthlyReportPage?.contains(target)) return;
      event.preventDefault();
      openAnnualPage(target.dataset.annualPage);
    });
  }

  document.querySelectorAll("[data-annual-chart-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      reportState.annualChartMode = button.dataset.annualChartMode;
      renderMonthlyReportPage();
    });
  });

  document.querySelectorAll("[data-annual-select-month]").forEach((button) => {
    button.addEventListener("click", () => {
      reportState.selectedAnnualMonth = Number(button.dataset.annualSelectMonth) || 0;
      renderMonthlyReportPage();
    });
  });

  document.querySelectorAll("[data-toggle-annual-month]").forEach((button) => {
    button.addEventListener("click", () => {
      const month = Number(button.dataset.toggleAnnualMonth) || 0;
      reportState.expandedAnnualMonths = reportState.expandedAnnualMonths.includes(month)
        ? reportState.expandedAnnualMonths.filter((item) => item !== month)
        : [...reportState.expandedAnnualMonths, month];
      renderMonthlyReportPage();
    });
  });
}
