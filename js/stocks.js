import { data, saveData } from "./storage.js";
import {
  $,
  STOCK_TRADE_TYPES,
  amountClass,
  createId,
  escapeHtml,
  formatCurrency,
  formatNumber,
  formatPercent,
  requestAccountDetail,
  requestView,
  requireDate,
  requireNumber,
  requireText,
  showError,
  sortByDateDesc,
  todayString
} from "./utils.js";

export function createStockTrade(input) {
  const trade = {
    id: createId("trade"),
    accountId: input.accountId,
    symbol: input.symbol,
    name: input.name,
    type: input.type,
    shares: Number(input.shares) || 0,
    price: Number(input.price) || 0,
    fee: Number(input.fee) || 0,
    tax: Number(input.tax) || 0,
    date: input.date,
    createdAt: new Date().toISOString()
  };
  data.stockTrades.push(trade);
  saveData();
  return trade;
}

export function createStockPrice(input) {
  const price = {
    id: createId("price"),
    accountId: input.accountId,
    symbol: input.symbol,
    price: Number(input.price) || 0,
    date: input.date,
    note: input.note || "",
    createdAt: new Date().toISOString()
  };
  data.stockPrices.push(price);
  saveData();
  return price;
}

export function getLatestStockPrice(accountId, symbol) {
  const prices = data.stockPrices
    .filter((price) => price.accountId === accountId && price.symbol === symbol)
    .sort((a, b) => {
      const dateCompare = String(b.date).localeCompare(String(a.date));
      if (dateCompare !== 0) return dateCompare;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
  return prices[0]?.price ?? null;
}

export function getStockHoldings(accountId) {
  const holdings = new Map();
  const trades = data.stockTrades
    .filter((trade) => trade.accountId === accountId)
    .sort((a, b) => {
      const dateCompare = String(a.date).localeCompare(String(b.date));
      if (dateCompare !== 0) return dateCompare;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    });

  trades.forEach((trade) => {
    const holding = holdings.get(trade.symbol) || {
      symbol: trade.symbol,
      name: trade.name,
      shares: 0,
      totalCost: 0,
      averageCost: 0
    };

    if (trade.type === "buy") {
      holding.totalCost += trade.shares * trade.price + trade.fee + trade.tax;
      holding.shares += trade.shares;
      holding.name = trade.name || holding.name;
    } else {
      const sellShares = Math.min(trade.shares, holding.shares);
      holding.shares -= sellShares;
      holding.totalCost = holding.averageCost * holding.shares;
    }

    holding.averageCost = holding.shares > 0 ? holding.totalCost / holding.shares : 0;
    holdings.set(trade.symbol, holding);
  });

  return Array.from(holdings.values())
    .filter((holding) => holding.shares > 0)
    .map((holding) => {
      const latestPrice = getLatestStockPrice(accountId, holding.symbol) ?? holding.averageCost;
      const marketValue = holding.shares * latestPrice;
      const unrealizedProfit = marketValue - holding.totalCost;
      const returnRate = holding.totalCost > 0 ? (unrealizedProfit / holding.totalCost) * 100 : 0;
      return { ...holding, latestPrice, marketValue, unrealizedProfit, returnRate };
    });
}

export function getStockAccountSummary(accountId) {
  const holdings = getStockHoldings(accountId);
  const totalCost = holdings.reduce((total, holding) => total + holding.totalCost, 0);
  const marketValue = holdings.reduce((total, holding) => total + holding.marketValue, 0);
  const unrealizedProfit = marketValue - totalCost;
  const returnRate = totalCost > 0 ? (unrealizedProfit / totalCost) * 100 : 0;
  return { holdings, totalCost, marketValue, unrealizedProfit, returnRate };
}

export function getAllStockMarketValue() {
  return data.accounts
    .filter((account) => account.type === "stock")
    .reduce((total, account) => total + getStockAccountSummary(account.id).marketValue, 0);
}

export function renderStockAccount(account) {
  const summary = getStockAccountSummary(account.id);
  return `
    <div class="summary-card panel account-detail-header">
      <div class="account-detail-title">
        <div>
          <h2>${escapeHtml(account.name)}</h2>
          <p class="item-meta">股票帳戶</p>
        </div>
        <span class="account-type-pill">股票</span>
      </div>
      <div class="metric-grid">
        <div class="metric"><span>目前市值</span><strong>${formatCurrency(summary.marketValue)}</strong></div>
        <div class="metric"><span>總成本</span><strong>${formatCurrency(summary.totalCost)}</strong></div>
        <div class="metric"><span>未實現損益</span><strong class="${amountClass(summary.unrealizedProfit)}">${formatCurrency(summary.unrealizedProfit)}</strong></div>
        <div class="metric"><span>報酬率</span><strong class="${amountClass(summary.returnRate)}">${formatPercent(summary.returnRate)}</strong></div>
      </div>
      <div class="action-grid">
        <button class="primary-button" id="addBuyTradeButton" type="button">買入</button>
        <button class="secondary-button" id="addSellTradeButton" type="button">賣出</button>
        <button class="secondary-button" id="addStockPriceButton" type="button">新增市價</button>
      </div>
    </div>
    <div class="section-heading"><h2>持股</h2></div>
    ${renderStockHoldings(summary.holdings)}
    <div class="section-heading"><h2>買賣紀錄</h2></div>
    ${renderStockTradeList(account.id)}
    <div class="section-heading"><h2>市價紀錄</h2></div>
    ${renderStockPriceList(account.id)}
  `;
}

function renderStockHoldings(holdings) {
  if (!holdings.length) return `<div class="empty-state">還沒有股票持股</div>`;
  return `
    <div class="list-stack">
      ${holdings
        .map(
          (holding) => `
            <article class="list-card stock-holding">
              <div class="item-row">
                <div>
                  <div class="item-title">${escapeHtml(holding.name)}</div>
                  <div class="stock-symbol">${escapeHtml(holding.symbol)}</div>
                </div>
                <strong class="${amountClass(holding.unrealizedProfit)}">${formatPercent(holding.returnRate)}</strong>
              </div>
              <div class="stock-mini-grid">
                <div><span>股數</span><strong>${formatNumber(holding.shares, 4)}</strong></div>
                <div><span>均價</span><strong>${formatCurrency(holding.averageCost)}</strong></div>
                <div><span>最新市價</span><strong>${formatCurrency(holding.latestPrice)}</strong></div>
                <div><span>市值</span><strong>${formatCurrency(holding.marketValue)}</strong></div>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderStockTradeList(accountId) {
  const trades = sortByDateDesc(data.stockTrades.filter((trade) => trade.accountId === accountId));
  if (!trades.length) return `<div class="empty-state">還沒有買賣紀錄</div>`;
  return `
    <div class="list-stack">
      ${trades
        .map(
          (trade) => `
            <article class="list-card">
              <div class="item-row">
                <div>
                  <div class="item-title">${STOCK_TRADE_TYPES[trade.type]} ${escapeHtml(trade.name)}</div>
                  <div class="item-meta">${escapeHtml(trade.date)} · ${escapeHtml(trade.symbol)} · ${formatNumber(trade.shares, 4)} 股</div>
                </div>
                <strong>${formatCurrency(trade.price)}</strong>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderStockPriceList(accountId) {
  const prices = sortByDateDesc(data.stockPrices.filter((price) => price.accountId === accountId));
  if (!prices.length) return `<div class="empty-state">還沒有每日市價紀錄</div>`;
  return `
    <div class="list-stack">
      ${prices
        .map(
          (price) => `
            <article class="list-card">
              <div class="item-row">
                <div>
                  <div class="item-title">${escapeHtml(price.symbol)}</div>
                  <div class="item-meta">${escapeHtml(price.date)}${price.note ? ` · ${escapeHtml(price.note)}` : ""}</div>
                </div>
                <strong>${formatCurrency(price.price)}</strong>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

export function bindStockButtons(accountId) {
  $("#addBuyTradeButton")?.addEventListener("click", () => openStockTradeForm(accountId, "buy"));
  $("#addSellTradeButton")?.addEventListener("click", () => openStockTradeForm(accountId, "sell"));
  $("#addStockPriceButton")?.addEventListener("click", () => openStockPriceForm(accountId));
}

export function openStockTradeForm(accountId, type = "buy") {
  $("#stockTradeForm").reset();
  $("#stockTradeAccountId").value = accountId;
  $("#stockTradeType").value = type;
  $("#stockTradeDate").value = todayString();
  $("#stockFee").value = "0";
  $("#stockTax").value = "0";
  requestView("stock-trade-form", {
    title: type === "buy" ? "新增買入" : "新增賣出",
    subtitle: "股票買賣紀錄",
    showBack: true
  });
}

export function openStockPriceForm(accountId) {
  $("#stockPriceForm").reset();
  $("#stockPriceAccountId").value = accountId;
  $("#manualStockPriceDate").value = todayString();
  requestView("stock-price-form", {
    title: "新增每日市價",
    subtitle: "手動紀錄最新價格",
    showBack: true
  });
}

export function bindStockForms() {
  $("#stockTradeForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const accountId = requireText($("#stockTradeAccountId").value, "帳戶");
      createStockTrade({
        accountId,
        type: $("#stockTradeType").value,
        symbol: requireText($("#stockSymbol").value, "股票代號"),
        name: requireText($("#stockName").value, "股票名稱"),
        shares: requireNumber($("#stockShares").value, "股數", { positive: true }),
        price: requireNumber($("#stockPrice").value, "價格", { positive: true }),
        fee: requireNumber($("#stockFee").value || 0, "手續費"),
        tax: requireNumber($("#stockTax").value || 0, "稅費"),
        date: requireDate($("#stockTradeDate").value)
      });
      requestAccountDetail(accountId);
    } catch (error) {
      showError(error);
    }
  });

  $("#stockPriceForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const accountId = requireText($("#stockPriceAccountId").value, "帳戶");
      createStockPrice({
        accountId,
        symbol: requireText($("#priceStockSymbol").value, "股票代號"),
        price: requireNumber($("#manualStockPrice").value, "市價", { positive: true }),
        date: requireDate($("#manualStockPriceDate").value),
        note: $("#stockPriceNote").value.trim()
      });
      requestAccountDetail(accountId);
    } catch (error) {
      showError(error);
    }
  });
}
