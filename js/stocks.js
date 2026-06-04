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

const ESTIMATED_SELL_TAX_RATE = 0.003;
const BROKER_FEE_RATE = 0.001425;
const ESTIMATED_EXIT_COST_RATE = ESTIMATED_SELL_TAX_RATE + BROKER_FEE_RATE * 2;

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

export function updateStockTrade(tradeId, input) {
  const trade = data.stockTrades.find((item) => item.id === tradeId);
  if (!trade) return null;
  trade.symbol = input.symbol;
  trade.name = input.name;
  trade.type = input.type;
  trade.shares = Number(input.shares) || 0;
  trade.price = Number(input.price) || 0;
  trade.fee = Number(input.fee) || 0;
  trade.tax = Number(input.tax) || 0;
  trade.date = input.date;
  saveData();
  return trade;
}

export function deleteStockTrade(tradeId) {
  data.stockTrades = data.stockTrades.filter((trade) => trade.id !== tradeId);
  saveData();
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

export function updateStockPrice(priceId, input) {
  const price = data.stockPrices.find((item) => item.id === priceId);
  if (!price) return null;
  price.symbol = input.symbol;
  price.price = Number(input.price) || 0;
  price.date = input.date;
  price.note = input.note || "";
  saveData();
  return price;
}

export function deleteStockPrice(priceId) {
  data.stockPrices = data.stockPrices.filter((price) => price.id !== priceId);
  saveData();
}

function normalizeStockText(value) {
  return String(value || "").trim().toUpperCase();
}

export function getKnownStocks() {
  const stocks = [];
  data.stockTrades.forEach((trade) => {
    const existing = stocks.find(
      (stock) =>
        normalizeStockText(stock.symbol) === normalizeStockText(trade.symbol) ||
        normalizeStockText(stock.name) === normalizeStockText(trade.name)
    );
    if (existing) {
      existing.symbol = existing.symbol || trade.symbol;
      existing.name = existing.name || trade.name;
    } else {
      stocks.push({ symbol: trade.symbol, name: trade.name });
    }
  });
  return stocks.filter((stock) => stock.symbol || stock.name);
}

export function getLatestStockPrice(accountId, holding) {
  const aliases = [...(holding.symbols || []), ...(holding.names || []), holding.symbol, holding.name].map(normalizeStockText).filter(Boolean);
  const prices = data.stockPrices
    .filter((price) => aliases.includes(normalizeStockText(price.symbol)))
    .sort((a, b) => {
      const dateCompare = String(b.date).localeCompare(String(a.date));
      if (dateCompare !== 0) return dateCompare;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
  return prices[0]?.price ?? null;
}

export function getStockHoldings(accountId) {
  const holdings = [];
  const trades = data.stockTrades
    .filter((trade) => trade.accountId === accountId)
    .sort((a, b) => {
      const dateCompare = String(a.date).localeCompare(String(b.date));
      if (dateCompare !== 0) return dateCompare;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    });

  trades.forEach((trade) => {
    let holding = holdings.find((item) => {
      const symbols = (item.symbols || [item.symbol]).map(normalizeStockText);
      const names = (item.names || [item.name]).map(normalizeStockText);
      return symbols.includes(normalizeStockText(trade.symbol)) || names.includes(normalizeStockText(trade.name));
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

    if (trade.symbol && !holding.symbols.map(normalizeStockText).includes(normalizeStockText(trade.symbol))) {
      holding.symbols.push(trade.symbol);
    }
    if (trade.name && !holding.names.map(normalizeStockText).includes(normalizeStockText(trade.name))) {
      holding.names.push(trade.name);
    }

    if (trade.type === "buy") {
      holding.totalCost += trade.shares * trade.price + trade.fee + trade.tax;
      holding.shares += trade.shares;
      holding.name = trade.name || holding.name;
      holding.symbol = holding.symbol || trade.symbol;
      if (!holding.latestBuyDate || String(trade.date).localeCompare(holding.latestBuyDate) >= 0) {
        holding.latestBuyDate = trade.date;
        holding.latestBuyPrice = trade.price;
      }
    } else {
      const sellShares = Math.min(trade.shares, holding.shares);
      holding.shares -= sellShares;
      holding.totalCost = holding.averageCost * holding.shares;
    }

    holding.averageCost = holding.shares > 0 ? holding.totalCost / holding.shares : 0;
  });

  return holdings
    .filter((holding) => holding.shares > 0)
    .map((holding) => {
      const latestPrice = getLatestStockPrice(accountId, holding) ?? holding.latestBuyPrice ?? holding.averageCost;
      const marketValue = holding.shares * latestPrice;
      const estimatedExitCost = marketValue * ESTIMATED_EXIT_COST_RATE;
      const unrealizedProfit = marketValue - holding.totalCost - estimatedExitCost;
      const returnRate = holding.totalCost > 0 ? (unrealizedProfit / holding.totalCost) * 100 : 0;
      return { ...holding, latestPrice, marketValue, estimatedExitCost, unrealizedProfit, returnRate };
    });
}

export function getStockAccountSummary(accountId) {
  const holdings = getStockHoldings(accountId);
  const totalCost = holdings.reduce((total, holding) => total + holding.totalCost, 0);
  const marketValue = holdings.reduce((total, holding) => total + holding.marketValue, 0);
  const unrealizedProfit = holdings.reduce((total, holding) => total + holding.unrealizedProfit, 0);
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
      <div class="compact-actions">
        <button class="secondary-button" id="editAccountButton" type="button">修改帳戶</button>
        <button class="danger-button" id="deleteAccountButton" type="button">刪除帳戶</button>
      </div>
      <div class="stock-summary-grid">
        <div class="mini-metric"><span>目前市值</span><strong>${formatCurrency(summary.marketValue)}</strong></div>
        <div class="mini-metric"><span>總成本</span><strong>${formatCurrency(summary.totalCost)}</strong></div>
        <div class="mini-metric"><span>未實現損益</span><strong class="${amountClass(summary.unrealizedProfit)}">${formatCurrency(summary.unrealizedProfit)}</strong></div>
        <div class="mini-metric"><span>報酬率</span><strong class="${amountClass(summary.returnRate)}">${formatPercent(summary.returnRate)}</strong></div>
      </div>
      <button class="fab-button" id="stockFabButton" type="button" aria-label="新增股票操作">+</button>
      <div class="action-sheet" id="stockActionSheet" aria-hidden="true">
        <button class="action-sheet-backdrop" id="stockActionBackdrop" type="button" aria-label="關閉操作選單"></button>
        <div class="action-sheet-panel">
          <h3>新增股票紀錄</h3>
          <button class="action-sheet-item" id="addBuyTradeButton" type="button">買入</button>
          <button class="action-sheet-item" id="addSellTradeButton" type="button">賣出</button>
          <button class="action-sheet-item" id="addStockPriceButton" type="button">新增市價</button>
        </div>
      </div>
    </div>
    <div class="section-heading"><h2>持股</h2></div>
    ${renderStockHoldings(summary.holdings)}
    <div class="section-heading"><h2>買賣紀錄</h2></div>
    ${renderStockTradeList(account.id)}
    <div class="section-heading"><h2>共用市價紀錄</h2></div>
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
            <details class="list-card stock-holding-card">
              <summary>
                <div class="holding-summary-top">
                  <strong>${escapeHtml(holding.name)} ${escapeHtml(holding.symbol)}</strong>
                  <span>${formatNumber(holding.shares, 4)} 股</span>
                </div>
                <div class="holding-summary-bottom">
                  <strong class="${amountClass(holding.unrealizedProfit)}">${formatCurrency(holding.unrealizedProfit)}</strong>
                  <strong class="${amountClass(holding.unrealizedProfit)}">${formatPercent(holding.returnRate)}</strong>
                </div>
              </summary>
              <div class="stock-mini-grid holding-expanded-grid">
                <div><span>最新市價</span><strong>${formatCurrency(holding.latestPrice)}</strong></div>
                <div><span>均價</span><strong>${formatCurrency(holding.averageCost)}</strong></div>
                <div><span>總市值</span><strong>${formatCurrency(holding.marketValue)}</strong></div>
                <div><span>總成本</span><strong>${formatCurrency(holding.totalCost)}</strong></div>
              </div>
            </details>
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
            <article class="list-card interactive-card" data-edit-stock-trade="${trade.id}" role="button" tabindex="0">
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

function renderStockPriceList() {
  const prices = sortByDateDesc(data.stockPrices);
  if (!prices.length) return `<div class="empty-state">還沒有共用市價紀錄</div>`;
  return `
    <div class="list-stack">
      ${prices
        .map(
          (price) => `
            <article class="list-card interactive-card" data-edit-stock-price="${price.id}" role="button" tabindex="0">
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
  const sheet = $("#stockActionSheet");
  const openSheet = () => sheet?.classList.add("is-open");
  const closeSheet = () => sheet?.classList.remove("is-open");

  $("#stockFabButton")?.addEventListener("click", openSheet);
  $("#stockActionBackdrop")?.addEventListener("click", closeSheet);
  $("#addBuyTradeButton")?.addEventListener("click", () => {
    closeSheet();
    openStockTradeForm(accountId, "buy");
  });
  $("#addSellTradeButton")?.addEventListener("click", () => {
    closeSheet();
    openStockTradeForm(accountId, "sell");
  });
  $("#addStockPriceButton")?.addEventListener("click", () => {
    closeSheet();
    openStockPriceForm(accountId);
  });
  bindStockRecordActions(accountId);
}

function updateStockDatalists() {
  const knownStocks = getKnownStocks();
  $("#stockSymbolList").innerHTML = knownStocks
    .map((stock) => `<option value="${escapeHtml(stock.symbol)}">${escapeHtml(stock.name || "")}</option>`)
    .join("");
  $("#stockNameList").innerHTML = knownStocks
    .map((stock) => `<option value="${escapeHtml(stock.name)}">${escapeHtml(stock.symbol || "")}</option>`)
    .join("");
}

function fillStockPairFromKnown(source) {
  const knownStocks = getKnownStocks();
  const symbolValue = normalizeStockText($("#stockSymbol").value);
  const nameValue = normalizeStockText($("#stockName").value);
  const match =
    source === "symbol"
      ? knownStocks.find((stock) => normalizeStockText(stock.symbol) === symbolValue)
      : knownStocks.find((stock) => normalizeStockText(stock.name) === nameValue);
  if (!match) return;
  if (source === "symbol" && match.name) $("#stockName").value = match.name;
  if (source === "name" && match.symbol) $("#stockSymbol").value = match.symbol;
}

export function openStockTradeForm(accountId, type = "buy", tradeId = "") {
  $("#stockTradeForm").reset();
  updateStockDatalists();
  $("#stockTradeId").value = tradeId;
  $("#deleteStockTradeButton").classList.toggle("is-hidden", !tradeId);
  $("#stockTradeAccountId").value = accountId;
  $("#stockTradeType").value = type;
  $("#stockTradeDate").value = todayString();
  $("#stockFee").value = "0";
  $("#stockTax").value = "0";

  const trade = tradeId ? data.stockTrades.find((item) => item.id === tradeId) : null;
  if (trade) {
    $("#stockTradeType").value = trade.type;
    $("#stockSymbol").value = trade.symbol;
    $("#stockName").value = trade.name;
    $("#stockShares").value = trade.shares;
    $("#stockPrice").value = trade.price;
    $("#stockFee").value = trade.fee;
    $("#stockTax").value = trade.tax;
    $("#stockTradeDate").value = trade.date;
  }

  requestView("stock-trade-form", {
    title: tradeId ? "修改股票交易" : type === "buy" ? "新增買入" : "新增賣出",
    subtitle: "股票買賣紀錄",
    showBack: true
  });
}

export function openStockPriceForm(accountId, priceId = "") {
  $("#stockPriceForm").reset();
  updateStockDatalists();
  $("#stockPriceId").value = priceId;
  $("#deleteStockPriceButton").classList.toggle("is-hidden", !priceId);
  $("#stockPriceAccountId").value = accountId;
  $("#manualStockPriceDate").value = todayString();

  const price = priceId ? data.stockPrices.find((item) => item.id === priceId) : null;
  if (price) {
    $("#priceStockSymbol").value = price.symbol;
    $("#manualStockPrice").value = price.price;
    $("#manualStockPriceDate").value = price.date;
    $("#stockPriceNote").value = price.note || "";
  }

  requestView("stock-price-form", {
    title: priceId ? "修改每日市價" : "新增每日市價",
    subtitle: "手動紀錄最新價格",
    showBack: true
  });
}

function bindStockRecordActions(accountId) {
  document.querySelectorAll("[data-edit-stock-trade]").forEach((card) => {
    const open = () => openStockTradeForm(accountId, "buy", card.dataset.editStockTrade);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") open();
    });
  });
  document.querySelectorAll("[data-edit-stock-price]").forEach((card) => {
    const open = () => openStockPriceForm(accountId, card.dataset.editStockPrice);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") open();
    });
  });
}

export function bindStockForms() {
  $("#stockSymbol")?.addEventListener("change", () => fillStockPairFromKnown("symbol"));
  $("#stockName")?.addEventListener("change", () => fillStockPairFromKnown("name"));

  $("#stockTradeForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const accountId = requireText($("#stockTradeAccountId").value, "帳戶");
      const tradeId = $("#stockTradeId").value;
      const input = {
        accountId,
        type: $("#stockTradeType").value,
        symbol: requireText($("#stockSymbol").value, "股票代號"),
        name: requireText($("#stockName").value, "股票名稱"),
        shares: requireNumber($("#stockShares").value, "股數", { positive: true }),
        price: requireNumber($("#stockPrice").value, "價格", { positive: true }),
        fee: requireNumber($("#stockFee").value || 0, "手續費"),
        tax: requireNumber($("#stockTax").value || 0, "稅費"),
        date: requireDate($("#stockTradeDate").value)
      };
      if (tradeId) updateStockTrade(tradeId, input);
      else createStockTrade(input);
      requestAccountDetail(accountId);
    } catch (error) {
      showError(error);
    }
  });

  $("#deleteStockTradeButton")?.addEventListener("click", () => {
    const tradeId = $("#stockTradeId").value;
    const accountId = $("#stockTradeAccountId").value;
    if (!tradeId) return;
    if (!confirm("確定要刪除這筆股票交易？")) return;
    deleteStockTrade(tradeId);
    requestAccountDetail(accountId);
  });

  $("#stockPriceForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const accountId = requireText($("#stockPriceAccountId").value, "帳戶");
      const priceId = $("#stockPriceId").value;
      const input = {
        accountId,
        symbol: requireText($("#priceStockSymbol").value, "股票代號"),
        price: requireNumber($("#manualStockPrice").value, "市價", { positive: true }),
        date: requireDate($("#manualStockPriceDate").value),
        note: $("#stockPriceNote").value.trim()
      };
      if (priceId) updateStockPrice(priceId, input);
      else createStockPrice(input);
      requestAccountDetail(accountId);
    } catch (error) {
      showError(error);
    }
  });

  $("#deleteStockPriceButton")?.addEventListener("click", () => {
    const priceId = $("#stockPriceId").value;
    const accountId = $("#stockPriceAccountId").value;
    if (!priceId) return;
    if (!confirm("確定要刪除這筆市價紀錄？")) return;
    deleteStockPrice(priceId);
    requestAccountDetail(accountId);
  });
}
