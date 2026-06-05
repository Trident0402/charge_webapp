import { data, getActiveRecordSlot } from "./storage.js";
import { ACCOUNT_TYPES } from "./utils.js";

const UNCATEGORIZED_LABEL = "未分類";
const SALARY_CATEGORY = "薪資";
const STOCK_EXIT_COST_RATE = 0.003 + 0.001425 * 2;

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function toDateInputValue(date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function parseDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthEnd(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function inDateRange(date, start, end) {
  return date && date >= start && date <= end;
}

function normalizeSecurityText(value) {
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

function securityKey(item) {
  return `${normalizeSecurityText(item.symbol)}|${normalizeSecurityText(item.name)}`;
}

function accountById(accountId) {
  return data.accounts.find((account) => account.id === accountId) || null;
}

function isCashflowAccount(accountId) {
  const account = accountById(accountId);
  return account && !["stock", "crypto", "liability"].includes(account.type);
}

function isLiabilityAccount(accountId) {
  return accountById(accountId)?.type === "liability";
}

function sortAscendingByDate(items) {
  return [...items].sort((a, b) => {
    const dateCompare = String(a.date || a.expectedDate || "").localeCompare(String(b.date || b.expectedDate || ""));
    if (dateCompare !== 0) return dateCompare;
    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });
}

function getTransactionsUntil(accountId, endDate) {
  return data.transactions.filter((transaction) => {
    if (transaction.accountId !== accountId) return false;
    const date = parseDate(transaction.date);
    return date && date <= endDate;
  });
}

function getCashBalanceAt(account, endDate) {
  return getTransactionsUntil(account.id, endDate).reduce((balance, transaction) => {
    if (["expense", "transfer-out"].includes(transaction.type)) return balance - Number(transaction.amount || 0);
    return balance + Number(transaction.amount || 0);
  }, Number(account.initialBalance) || 0);
}

function findHolding(holdings, trade) {
  return holdings.find((holding) => {
    const symbols = (holding.symbols || [holding.symbol]).map(normalizeSecurityText);
    const names = (holding.names || [holding.name]).map(normalizeSecurityText);
    return symbols.includes(normalizeSecurityText(trade.symbol)) || names.includes(normalizeSecurityText(trade.name));
  });
}

function rememberAliases(holding, trade) {
  if (trade.symbol && !holding.symbols.map(normalizeSecurityText).includes(normalizeSecurityText(trade.symbol))) {
    holding.symbols.push(trade.symbol);
  }
  if (trade.name && !holding.names.map(normalizeSecurityText).includes(normalizeSecurityText(trade.name))) {
    holding.names.push(trade.name);
  }
}

function getLatestStockPriceAt(holding, endDate) {
  const aliases = [...(holding.symbols || []), ...(holding.names || []), holding.symbol, holding.name]
    .map(normalizeSecurityText)
    .filter(Boolean);
  const prices = data.stockPrices
    .filter((price) => aliases.includes(normalizeSecurityText(price.symbol)))
    .filter((price) => {
      const date = parseDate(price.date);
      return date && date <= endDate;
    })
    .sort((a, b) => {
      const dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
      if (dateCompare !== 0) return dateCompare;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
  return prices[0]?.price ?? null;
}

function getStockHoldingsAt(accountId, endDate) {
  const holdings = [];
  const trades = sortAscendingByDate(
    data.stockTrades.filter((trade) => trade.accountId === accountId && parseDate(trade.date) && parseDate(trade.date) <= endDate)
  );

  trades.forEach((trade) => {
    let holding = findHolding(holdings, trade);
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
    rememberAliases(holding, trade);

    const shares = Number(trade.shares) || 0;
    const price = Number(trade.price) || 0;
    if (trade.type === "buy") {
      holding.totalCost += shares * price + Number(trade.fee || 0) + Number(trade.tax || 0);
      holding.shares += shares;
      holding.name = trade.name || holding.name;
      holding.symbol = holding.symbol || trade.symbol;
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

  return holdings.filter((holding) => holding.shares > 0).map((holding) => {
    const latestPrice = getLatestStockPriceAt(holding, endDate) ?? holding.latestBuyPrice ?? holding.averageCost;
    const marketValue = holding.shares * latestPrice;
    return {
      ...holding,
      latestPrice,
      marketValue,
      unrealizedProfit: marketValue - holding.totalCost - marketValue * STOCK_EXIT_COST_RATE
    };
  });
}

function getStockMarketValueAt(accountId, endDate) {
  return getStockHoldingsAt(accountId, endDate).reduce((total, holding) => total + holding.marketValue, 0);
}

function getLatestCryptoPriceAt(accountId, holding, endDate) {
  const aliases = [...(holding.symbols || []), ...(holding.names || []), holding.symbol, holding.name]
    .map(normalizeSecurityText)
    .filter(Boolean);
  const prices = data.cryptoPrices
    .filter((price) => price.accountId === accountId && aliases.includes(normalizeSecurityText(price.symbol)))
    .filter((price) => {
      const date = parseDate(price.date);
      return date && date <= endDate;
    })
    .sort((a, b) => {
      const dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
      if (dateCompare !== 0) return dateCompare;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
  return prices[0] ? { priceUsd: Number(prices[0].priceUsd) || 0, fxRate: Number(prices[0].fxRate) || 0 } : null;
}

function getCryptoHoldingsAt(accountId, endDate) {
  const holdings = [];
  const trades = sortAscendingByDate(
    data.cryptoTrades.filter((trade) => trade.accountId === accountId && parseDate(trade.date) && parseDate(trade.date) <= endDate)
  );

  trades.forEach((trade) => {
    let holding = findHolding(holdings, trade);
    if (!holding) {
      holding = {
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
    rememberAliases(holding, trade);

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

  return holdings.filter((holding) => holding.quantity > 0).map((holding) => {
    const latestPrice = getLatestCryptoPriceAt(accountId, holding, endDate);
    const latestPriceUsd = latestPrice?.priceUsd ?? holding.latestBuyPriceUsd ?? 0;
    const latestFxRate = latestPrice?.fxRate ?? holding.latestBuyFxRate ?? 1;
    return {
      ...holding,
      latestPriceUsd,
      latestFxRate,
      marketValue: holding.quantity * latestPriceUsd * latestFxRate
    };
  });
}

function getCryptoMarketValueAt(accountId, endDate) {
  return getCryptoHoldingsAt(accountId, endDate).reduce((total, holding) => total + holding.marketValue, 0);
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

function getAccountValueAt(account, endDate) {
  if (account.type === "stock") return getStockMarketValueAt(account.id, endDate);
  if (account.type === "crypto") return getCryptoMarketValueAt(account.id, endDate);
  if (account.type === "liability") return getLiabilityDebtAt(account, endDate);
  return getCashBalanceAt(account, endDate);
}

function getTotalAssetsAt(endDate) {
  return data.accounts
    .filter((account) => account.type !== "liability")
    .reduce((total, account) => total + getAccountValueAt(account, endDate), 0);
}

function getTotalLiabilitiesAt(endDate) {
  return data.accounts
    .filter((account) => account.type === "liability")
    .reduce((total, account) => total + getAccountValueAt(account, endDate), 0);
}

function getRealizedStockEvents() {
  const states = new Map();
  const events = [];

  sortAscendingByDate(data.stockTrades).forEach((trade) => {
    const key = `${trade.accountId}|${securityKey(trade)}`;
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
        events.push({ date: trade.date, amount: proceeds - costBasis });
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

  sortAscendingByDate(data.cryptoTrades).forEach((trade) => {
    const key = `${trade.accountId}|${securityKey(trade)}`;
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
        events.push({ date: trade.date, amount: grossValueTwd - feeTwd });
      }
    } else if (tradeType === "sell") {
      const sellQuantity = Math.min(quantity, state.quantity);
      if (sellQuantity > 0) {
        const costBasis = state.averageCost * sellQuantity;
        const proceeds = sellQuantity * priceUsd * fxRate - feeTwd;
        events.push({ date: trade.date, amount: realizedEffect === "loss" ? -(grossValueTwd + feeTwd) : proceeds - costBasis });
        state.quantity -= sellQuantity;
        state.totalCost = state.averageCost * state.quantity;
        state.averageCost = state.quantity > 0 ? state.totalCost / state.quantity : 0;
      }
    }

    states.set(key, state);
  });

  return events;
}

function groupTransactionsByCategory(transactions, type) {
  const total = transactions
    .filter((transaction) => transaction.type === type)
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const categories = new Map();

  transactions
    .filter((transaction) => transaction.type === type)
    .forEach((transaction) => {
      const category = String(transaction.category || "").trim() || UNCATEGORIZED_LABEL;
      categories.set(category, (categories.get(category) || 0) + Number(transaction.amount || 0));
    });

  return Array.from(categories.entries())
    .map(([name, amount]) => ({
      name,
      amount,
      percent: total > 0 ? (amount / total) * 100 : 0
    }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "zh-Hant"));
}

function getMonthExpectedRows(rows, start, end) {
  return rows.filter((row) => {
    const date = parseDate(row.expectedDate);
    return inDateRange(date, start, end);
  });
}

function buildDailyRows(start, end, monthTransactions, stockEvents, cryptoEvents) {
  const days = [];
  for (let day = 1; day <= end.getDate(); day += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), day);
    days.push({
      date: toDateInputValue(date),
      day,
      income: 0,
      expense: 0,
      dailyNet: 0,
      stockRealized: 0,
      cryptoRealized: 0,
      totalProfit: 0
    });
  }

  const byDate = new Map(days.map((day) => [day.date, day]));
  monthTransactions.forEach((transaction) => {
    const day = byDate.get(transaction.date);
    if (!day) return;
    if (transaction.type === "income") day.income += Number(transaction.amount || 0);
    if (transaction.type === "expense") day.expense += Number(transaction.amount || 0);
  });
  stockEvents.forEach((event) => {
    const day = byDate.get(event.date);
    if (day) day.stockRealized += Number(event.amount || 0);
  });
  cryptoEvents.forEach((event) => {
    const day = byDate.get(event.date);
    if (day) day.cryptoRealized += Number(event.amount || 0);
  });

  return days.map((day) => ({
    ...day,
    dailyNet: day.income - day.expense,
    totalProfit: day.income - day.expense + day.stockRealized + day.cryptoRealized
  }));
}

function buildTransactionRows(transactions) {
  return sortAscendingByDate(transactions).map((transaction) => {
    const account = accountById(transaction.accountId);
    return {
      date: transaction.date,
      accountName: account?.name || "未知帳戶",
      accountType: account ? ACCOUNT_TYPES[account.type] || account.type : "",
      type: transaction.type,
      typeLabel: transaction.type === "income" ? "收入" : "支出",
      category: transaction.category || UNCATEGORIZED_LABEL,
      note: transaction.note || "",
      amount: Number(transaction.amount) || 0
    };
  });
}

function buildAccountMonthlySnapshots(year) {
  const months = Array.from({ length: 12 }, (_, monthIndex) => ({
    monthIndex,
    label: `${monthIndex + 1}月`,
    endDate: monthEnd(new Date(year, monthIndex, 1))
  }));

  return data.accounts.map((account) => ({
    accountId: account.id,
    accountName: account.name,
    accountType: account.type,
    accountTypeLabel: ACCOUNT_TYPES[account.type] || account.type,
    values: months.map((month) => ({
      monthIndex: month.monthIndex,
      label: month.label,
      date: toDateInputValue(month.endDate),
      value: getAccountValueAt(account, month.endDate)
    }))
  }));
}

export function prepareCurrentMonthPdfData(anchorDate = new Date()) {
  const start = monthStart(anchorDate);
  const end = monthEnd(anchorDate);
  const monthTransactions = data.transactions.filter((transaction) => {
    if (!["income", "expense"].includes(transaction.type)) return false;
    if (isLiabilityAccount(transaction.accountId)) return false;
    if (!isCashflowAccount(transaction.accountId)) return false;
    const date = parseDate(transaction.date);
    return inDateRange(date, start, end);
  });
  const incomeTransactions = monthTransactions.filter((transaction) => transaction.type === "income");
  const expenseTransactions = monthTransactions.filter((transaction) => transaction.type === "expense");
  const stockEvents = getRealizedStockEvents().filter((event) => inDateRange(parseDate(event.date), start, end));
  const cryptoEvents = getRealizedCryptoEvents().filter((event) => inDateRange(parseDate(event.date), start, end));
  const expectedIncomes = getMonthExpectedRows(data.expectedIncomes || [], start, end);
  const expectedExpenses = getMonthExpectedRows(data.expectedExpenses || [], start, end);
  const totalIncome = incomeTransactions.reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
  const salaryIncome = incomeTransactions
    .filter((transaction) => String(transaction.category || "").trim() === SALARY_CATEGORY)
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
  const totalExpense = expenseTransactions.reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
  const stockRealized = stockEvents.reduce((total, event) => total + Number(event.amount || 0), 0);
  const cryptoRealized = cryptoEvents.reduce((total, event) => total + Number(event.amount || 0), 0);
  const totalAssets = getTotalAssetsAt(end);
  const totalLiabilities = getTotalLiabilitiesAt(end);

  return {
    generatedAt: new Date().toISOString(),
    appVersion: globalThis.CHARGE_APP_VERSION || "unknown",
    recordSlot: getActiveRecordSlot(),
    year: start.getFullYear(),
    monthIndex: start.getMonth(),
    monthLabel: `${start.getFullYear()}/${padNumber(start.getMonth() + 1)}`,
    rangeLabel: `${toDateInputValue(start)} ~ ${toDateInputValue(end)}`,
    summary: {
      totalIncome,
      salaryIncome,
      nonSalaryIncome: totalIncome - salaryIncome,
      totalExpense,
      dailyNet: totalIncome - totalExpense,
      stockRealized,
      cryptoRealized,
      totalProfit: totalIncome - totalExpense + stockRealized + cryptoRealized,
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
      expectedIncomeTotal: expectedIncomes.reduce((total, item) => total + Number(item.amount || 0), 0),
      expectedExpenseTotal: expectedExpenses.reduce((total, item) => total + Number(item.amount || 0), 0)
    },
    incomeCategories: groupTransactionsByCategory(monthTransactions, "income"),
    expenseCategories: groupTransactionsByCategory(monthTransactions, "expense"),
    dailyRows: buildDailyRows(start, end, monthTransactions, stockEvents, cryptoEvents),
    transactionRows: buildTransactionRows(monthTransactions),
    expectedIncomes: sortAscendingByDate(expectedIncomes),
    expectedExpenses: sortAscendingByDate(expectedExpenses),
    accountMonthlySnapshots: buildAccountMonthlySnapshots(start.getFullYear())
  };
}
