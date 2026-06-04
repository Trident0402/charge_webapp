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

function formatUsd(value) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6
  }).format(Number(value) || 0);
}

function normalizeCryptoText(value) {
  return String(value || "").trim().toUpperCase();
}

export function createCryptoTrade(input) {
  const trade = {
    id: createId("crypto_trade"),
    accountId: input.accountId,
    symbol: input.symbol,
    name: input.name,
    type: input.type,
    quantity: Number(input.quantity) || 0,
    priceUsd: Number(input.priceUsd) || 0,
    fxRate: Number(input.fxRate) || 0,
    feeUsd: Number(input.feeUsd) || 0,
    date: input.date,
    createdAt: new Date().toISOString()
  };
  data.cryptoTrades.push(trade);
  saveData();
  return trade;
}

export function updateCryptoTrade(tradeId, input) {
  const trade = data.cryptoTrades.find((item) => item.id === tradeId);
  if (!trade) return null;
  trade.symbol = input.symbol;
  trade.name = input.name;
  trade.type = input.type;
  trade.quantity = Number(input.quantity) || 0;
  trade.priceUsd = Number(input.priceUsd) || 0;
  trade.fxRate = Number(input.fxRate) || 0;
  trade.feeUsd = Number(input.feeUsd) || 0;
  trade.date = input.date;
  saveData();
  return trade;
}

export function deleteCryptoTrade(tradeId) {
  data.cryptoTrades = data.cryptoTrades.filter((trade) => trade.id !== tradeId);
  saveData();
}

export function createCryptoPrice(input) {
  const price = {
    id: createId("crypto_price"),
    accountId: input.accountId,
    symbol: input.symbol,
    priceUsd: Number(input.priceUsd) || 0,
    fxRate: Number(input.fxRate) || 0,
    date: input.date,
    note: input.note || "",
    createdAt: new Date().toISOString()
  };
  data.cryptoPrices.push(price);
  saveData();
  return price;
}

export function updateCryptoPrice(priceId, input) {
  const price = data.cryptoPrices.find((item) => item.id === priceId);
  if (!price) return null;
  price.symbol = input.symbol;
  price.priceUsd = Number(input.priceUsd) || 0;
  price.fxRate = Number(input.fxRate) || 0;
  price.date = input.date;
  price.note = input.note || "";
  saveData();
  return price;
}

export function deleteCryptoPrice(priceId) {
  data.cryptoPrices = data.cryptoPrices.filter((price) => price.id !== priceId);
  saveData();
}

export function getKnownCryptos() {
  const cryptos = [];
  data.cryptoTrades.forEach((trade) => {
    const existing = cryptos.find(
      (crypto) =>
        normalizeCryptoText(crypto.symbol) === normalizeCryptoText(trade.symbol) ||
        normalizeCryptoText(crypto.name) === normalizeCryptoText(trade.name)
    );
    if (existing) {
      existing.symbol = existing.symbol || trade.symbol;
      existing.name = existing.name || trade.name;
    } else {
      cryptos.push({ symbol: trade.symbol, name: trade.name });
    }
  });
  return cryptos.filter((crypto) => crypto.symbol || crypto.name);
}

export function getLatestCryptoPrice(accountId, holding) {
  const aliases = [...(holding.symbols || []), ...(holding.names || []), holding.symbol, holding.name].map(normalizeCryptoText).filter(Boolean);
  const prices = data.cryptoPrices
    .filter((price) => price.accountId === accountId && aliases.includes(normalizeCryptoText(price.symbol)))
    .sort((a, b) => {
      const dateCompare = String(b.date).localeCompare(String(a.date));
      if (dateCompare !== 0) return dateCompare;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
  return prices[0] ? { priceUsd: prices[0].priceUsd, fxRate: prices[0].fxRate } : null;
}

export function getCryptoHoldings(accountId) {
  const holdings = [];
  const trades = data.cryptoTrades
    .filter((trade) => trade.accountId === accountId)
    .sort((a, b) => {
      const dateCompare = String(a.date).localeCompare(String(b.date));
      if (dateCompare !== 0) return dateCompare;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    });

  trades.forEach((trade) => {
    let holding = holdings.find((item) => {
      const symbols = (item.symbols || [item.symbol]).map(normalizeCryptoText);
      const names = (item.names || [item.name]).map(normalizeCryptoText);
      return symbols.includes(normalizeCryptoText(trade.symbol)) || names.includes(normalizeCryptoText(trade.name));
    });

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

    if (trade.symbol && !holding.symbols.map(normalizeCryptoText).includes(normalizeCryptoText(trade.symbol))) {
      holding.symbols.push(trade.symbol);
    }
    if (trade.name && !holding.names.map(normalizeCryptoText).includes(normalizeCryptoText(trade.name))) {
      holding.names.push(trade.name);
    }

    if (trade.type === "buy") {
      holding.totalCost += trade.quantity * trade.priceUsd * trade.fxRate + trade.feeUsd * trade.fxRate;
      holding.quantity += trade.quantity;
      holding.name = trade.name || holding.name;
      holding.symbol = holding.symbol || trade.symbol;
      if (!holding.latestBuyDate || String(trade.date).localeCompare(holding.latestBuyDate) >= 0) {
        holding.latestBuyDate = trade.date;
        holding.latestBuyPriceUsd = trade.priceUsd;
        holding.latestBuyFxRate = trade.fxRate;
      }
    } else if (trade.type === "profit") {
      const receivedValueTwd = trade.priceUsd * trade.fxRate;
      holding.totalCost += receivedValueTwd;
      holding.quantity += trade.quantity;
      holding.name = trade.name || holding.name;
      holding.symbol = holding.symbol || trade.symbol;
      if (!holding.latestBuyDate || String(trade.date).localeCompare(holding.latestBuyDate) >= 0) {
        holding.latestBuyDate = trade.date;
        holding.latestBuyPriceUsd = trade.quantity > 0 ? trade.priceUsd / trade.quantity : trade.priceUsd;
        holding.latestBuyFxRate = trade.fxRate;
      }
    } else if (trade.type === "sell") {
      const sellQuantity = Math.min(trade.quantity, holding.quantity);
      holding.quantity -= sellQuantity;
      holding.totalCost = holding.averageCost * holding.quantity;
    }

    holding.averageCost = holding.quantity > 0 ? holding.totalCost / holding.quantity : 0;
  });

  return holdings
    .filter((holding) => holding.quantity > 0)
    .map((holding) => {
      const latestPrice = getLatestCryptoPrice(accountId, holding);
      const latestPriceUsd = latestPrice?.priceUsd ?? holding.latestBuyPriceUsd ?? 0;
      const latestFxRate = latestPrice?.fxRate ?? holding.latestBuyFxRate ?? 1;
      const marketValue = holding.quantity * latestPriceUsd * latestFxRate;
      const unrealizedProfit = marketValue - holding.totalCost;
      const returnRate = holding.totalCost > 0 ? (unrealizedProfit / holding.totalCost) * 100 : 0;
      return { ...holding, latestPriceUsd, latestFxRate, marketValue, unrealizedProfit, returnRate };
    });
}

export function getCryptoAccountSummary(accountId) {
  const holdings = getCryptoHoldings(accountId);
  const totalCost = holdings.reduce((total, holding) => total + holding.totalCost, 0);
  const marketValue = holdings.reduce((total, holding) => total + holding.marketValue, 0);
  const unrealizedProfit = holdings.reduce((total, holding) => total + holding.unrealizedProfit, 0);
  const returnRate = totalCost > 0 ? (unrealizedProfit / totalCost) * 100 : 0;
  return { holdings, totalCost, marketValue, unrealizedProfit, returnRate };
}

export function getAllCryptoMarketValue() {
  return data.accounts
    .filter((account) => account.type === "crypto")
    .reduce((total, account) => total + getCryptoAccountSummary(account.id).marketValue, 0);
}

export function renderCryptoAccount(account) {
  const summary = getCryptoAccountSummary(account.id);
  return `
    <div class="summary-card panel account-detail-header">
      <div class="account-detail-title">
        <div>
          <h2>${escapeHtml(account.name)}</h2>
          <p class="item-meta">虛擬貨幣帳戶</p>
        </div>
        <span class="account-type-pill">Crypto</span>
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
      <button class="fab-button" id="cryptoFabButton" type="button" aria-label="新增虛擬貨幣操作">+</button>
      <div class="action-sheet" id="cryptoActionSheet" aria-hidden="true">
        <button class="action-sheet-backdrop" id="cryptoActionBackdrop" type="button" aria-label="關閉操作選單"></button>
        <div class="action-sheet-panel">
          <h3>新增虛擬貨幣紀錄</h3>
          <button class="action-sheet-item" id="addCryptoBuyButton" type="button">買入</button>
          <button class="action-sheet-item" id="addCryptoSellButton" type="button">賣出</button>
          <button class="action-sheet-item" id="addCryptoProfitButton" type="button">純利潤</button>
          <button class="action-sheet-item" id="addCryptoPriceButton" type="button">新增市價</button>
        </div>
      </div>
    </div>
    <div class="section-heading"><h2>持倉</h2></div>
    ${renderCryptoHoldings(summary.holdings)}
    <div class="section-heading"><h2>買賣紀錄</h2></div>
    ${renderCryptoTradeList(account.id)}
    <div class="section-heading"><h2>市價紀錄</h2></div>
    ${renderCryptoPriceList(account.id)}
  `;
}

function renderCryptoHoldings(holdings) {
  if (!holdings.length) return `<div class="empty-state">還沒有虛擬貨幣持倉</div>`;
  return `
    <div class="list-stack">
      ${holdings
        .map(
          (holding) => `
            <details class="list-card stock-holding-card">
              <summary>
                <div class="holding-summary-top">
                  <strong>${escapeHtml(holding.name)} ${escapeHtml(holding.symbol)}</strong>
                  <span>${formatNumber(holding.quantity, 8)}</span>
                </div>
                <div class="holding-summary-bottom">
                  <strong class="${amountClass(holding.unrealizedProfit)}">${formatCurrency(holding.unrealizedProfit)}</strong>
                  <strong class="${amountClass(holding.unrealizedProfit)}">${formatPercent(holding.returnRate)}</strong>
                </div>
              </summary>
              <div class="stock-mini-grid holding-expanded-grid">
                <div><span>美元市價</span><strong>${formatUsd(holding.latestPriceUsd)}</strong></div>
                <div><span>美元匯率</span><strong>${formatNumber(holding.latestFxRate, 4)}</strong></div>
                <div><span>台幣市值</span><strong>${formatCurrency(holding.marketValue)}</strong></div>
                <div><span>總成本</span><strong>${formatCurrency(holding.totalCost)}</strong></div>
                <div><span>台幣均價</span><strong>${formatCurrency(holding.averageCost)}</strong></div>
              </div>
            </details>
          `
        )
        .join("")}
    </div>
  `;
}

function renderCryptoTradeList(accountId) {
  const trades = sortByDateDesc(data.cryptoTrades.filter((trade) => trade.accountId === accountId));
  if (!trades.length) return `<div class="empty-state">還沒有買賣紀錄</div>`;
  return `
    <div class="list-stack">
      ${trades
        .map(
          (trade) => `
            <article class="list-card interactive-card" data-edit-crypto-trade="${trade.id}" role="button" tabindex="0">
              <div class="item-row">
                <div>
                  <div class="item-title">${STOCK_TRADE_TYPES[trade.type]} ${escapeHtml(trade.name)}</div>
                  <div class="item-meta">${escapeHtml(trade.date)} · ${escapeHtml(trade.symbol)} · ${formatNumber(trade.quantity, 8)} · 匯率 ${formatNumber(trade.fxRate, 4)}</div>
                </div>
                <strong>${formatUsd(trade.type === "profit" ? trade.priceUsd - trade.feeUsd : trade.priceUsd)}</strong>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderCryptoPriceList(accountId) {
  const prices = sortByDateDesc(data.cryptoPrices.filter((price) => price.accountId === accountId));
  if (!prices.length) return `<div class="empty-state">還沒有市價紀錄</div>`;
  return `
    <div class="list-stack">
      ${prices
        .map(
          (price) => `
            <article class="list-card interactive-card" data-edit-crypto-price="${price.id}" role="button" tabindex="0">
              <div class="item-row">
                <div>
                  <div class="item-title">${escapeHtml(price.symbol)}</div>
                  <div class="item-meta">${escapeHtml(price.date)} · 匯率 ${formatNumber(price.fxRate, 4)}${price.note ? ` · ${escapeHtml(price.note)}` : ""}</div>
                </div>
                <strong>${formatUsd(price.priceUsd)}</strong>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

export function bindCryptoButtons(accountId) {
  const sheet = $("#cryptoActionSheet");
  const openSheet = () => sheet?.classList.add("is-open");
  const closeSheet = () => sheet?.classList.remove("is-open");

  $("#cryptoFabButton")?.addEventListener("click", openSheet);
  $("#cryptoActionBackdrop")?.addEventListener("click", closeSheet);
  $("#addCryptoBuyButton")?.addEventListener("click", () => {
    closeSheet();
    openCryptoTradeForm(accountId, "buy");
  });
  $("#addCryptoSellButton")?.addEventListener("click", () => {
    closeSheet();
    openCryptoTradeForm(accountId, "sell");
  });
  $("#addCryptoProfitButton")?.addEventListener("click", () => {
    closeSheet();
    openCryptoTradeForm(accountId, "profit");
  });
  $("#addCryptoPriceButton")?.addEventListener("click", () => {
    closeSheet();
    openCryptoPriceForm(accountId);
  });
  bindCryptoRecordActions(accountId);
}

function updateCryptoDatalists() {
  const knownCryptos = getKnownCryptos();
  $("#cryptoSymbolList").innerHTML = knownCryptos
    .map((crypto) => `<option value="${escapeHtml(crypto.symbol)}">${escapeHtml(crypto.name || "")}</option>`)
    .join("");
  $("#cryptoNameList").innerHTML = knownCryptos
    .map((crypto) => `<option value="${escapeHtml(crypto.name)}">${escapeHtml(crypto.symbol || "")}</option>`)
    .join("");
}

function fillCryptoPairFromKnown(source) {
  const knownCryptos = getKnownCryptos();
  const symbolValue = normalizeCryptoText($("#cryptoSymbol").value);
  const nameValue = normalizeCryptoText($("#cryptoName").value);
  const match =
    source === "symbol"
      ? knownCryptos.find((crypto) => normalizeCryptoText(crypto.symbol) === symbolValue)
      : knownCryptos.find((crypto) => normalizeCryptoText(crypto.name) === nameValue);
  if (!match) return;
  if (source === "symbol" && match.name) $("#cryptoName").value = match.name;
  if (source === "name" && match.symbol) $("#cryptoSymbol").value = match.symbol;
}

export function openCryptoTradeForm(accountId, type = "buy", tradeId = "") {
  $("#cryptoTradeForm").reset();
  updateCryptoDatalists();
  $("#cryptoTradeId").value = tradeId;
  $("#deleteCryptoTradeButton").classList.toggle("is-hidden", !tradeId);
  $("#cryptoTradeAccountId").value = accountId;
  $("#cryptoTradeType").value = type;
  $("#cryptoTradeDate").value = todayString();
  $("#cryptoFeeUsd").value = "0";

  const trade = tradeId ? data.cryptoTrades.find((item) => item.id === tradeId) : null;
  if (trade) {
    $("#cryptoTradeType").value = trade.type;
    $("#cryptoSymbol").value = trade.symbol;
    $("#cryptoName").value = trade.name;
    $("#cryptoQuantity").value = trade.quantity;
    $("#cryptoPriceUsd").value = trade.priceUsd;
    $("#cryptoFxRate").value = trade.fxRate;
    $("#cryptoFeeUsd").value = trade.feeUsd;
    $("#cryptoTradeDate").value = trade.date;
  }

  requestView("crypto-trade-form", {
    title: tradeId ? "修改虛擬貨幣交易" : type === "buy" ? "新增買入" : type === "sell" ? "新增賣出" : "新增純利潤",
    subtitle: type === "profit" ? "記錄收益並加入幣種庫存" : "以美元計價，換算台幣成本",
    showBack: true
  });
}

export function openCryptoPriceForm(accountId, priceId = "") {
  $("#cryptoPriceForm").reset();
  updateCryptoDatalists();
  $("#cryptoPriceId").value = priceId;
  $("#deleteCryptoPriceButton").classList.toggle("is-hidden", !priceId);
  $("#cryptoPriceAccountId").value = accountId;
  $("#manualCryptoPriceDate").value = todayString();

  const price = priceId ? data.cryptoPrices.find((item) => item.id === priceId) : null;
  if (price) {
    $("#priceCryptoSymbol").value = price.symbol;
    $("#manualCryptoPriceUsd").value = price.priceUsd;
    $("#manualCryptoFxRate").value = price.fxRate;
    $("#manualCryptoPriceDate").value = price.date;
    $("#cryptoPriceNote").value = price.note || "";
  }

  requestView("crypto-price-form", {
    title: priceId ? "修改虛擬貨幣市價" : "新增虛擬貨幣市價",
    subtitle: "手動記錄美元價格與台幣匯率",
    showBack: true
  });
}

function bindCryptoRecordActions(accountId) {
  document.querySelectorAll("[data-edit-crypto-trade]").forEach((card) => {
    const open = () => openCryptoTradeForm(accountId, "buy", card.dataset.editCryptoTrade);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") open();
    });
  });
  document.querySelectorAll("[data-edit-crypto-price]").forEach((card) => {
    const open = () => openCryptoPriceForm(accountId, card.dataset.editCryptoPrice);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") open();
    });
  });
}

export function bindCryptoForms() {
  $("#cryptoSymbol")?.addEventListener("change", () => fillCryptoPairFromKnown("symbol"));
  $("#cryptoName")?.addEventListener("change", () => fillCryptoPairFromKnown("name"));

  $("#cryptoTradeForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const accountId = requireText($("#cryptoTradeAccountId").value, "帳戶");
      const tradeId = $("#cryptoTradeId").value;
      const input = {
        accountId,
        type: $("#cryptoTradeType").value,
        symbol: requireText($("#cryptoSymbol").value, "幣種代號"),
        name: requireText($("#cryptoName").value, "幣種名稱"),
        quantity: requireNumber($("#cryptoQuantity").value, "數量", { positive: true }),
        priceUsd: requireNumber($("#cryptoPriceUsd").value, $("#cryptoTradeType").value === "profit" ? "美元金額" : "美元單價", { positive: true }),
        fxRate: requireNumber($("#cryptoFxRate").value, "台幣美金匯率", { positive: true }),
        feeUsd: requireNumber($("#cryptoFeeUsd").value || 0, "美元手續費"),
        date: requireDate($("#cryptoTradeDate").value)
      };
      if (tradeId) updateCryptoTrade(tradeId, input);
      else createCryptoTrade(input);
      requestAccountDetail(accountId);
    } catch (error) {
      showError(error);
    }
  });

  $("#deleteCryptoTradeButton")?.addEventListener("click", () => {
    const tradeId = $("#cryptoTradeId").value;
    const accountId = $("#cryptoTradeAccountId").value;
    if (!tradeId) return;
    if (!confirm("確定要刪除這筆虛擬貨幣交易？")) return;
    deleteCryptoTrade(tradeId);
    requestAccountDetail(accountId);
  });

  $("#cryptoPriceForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const accountId = requireText($("#cryptoPriceAccountId").value, "帳戶");
      const priceId = $("#cryptoPriceId").value;
      const input = {
        accountId,
        symbol: requireText($("#priceCryptoSymbol").value, "幣種代號"),
        priceUsd: requireNumber($("#manualCryptoPriceUsd").value, "美元市價", { positive: true }),
        fxRate: requireNumber($("#manualCryptoFxRate").value, "台幣美金匯率", { positive: true }),
        date: requireDate($("#manualCryptoPriceDate").value),
        note: $("#cryptoPriceNote").value.trim()
      };
      if (priceId) updateCryptoPrice(priceId, input);
      else createCryptoPrice(input);
      requestAccountDetail(accountId);
    } catch (error) {
      showError(error);
    }
  });

  $("#deleteCryptoPriceButton")?.addEventListener("click", () => {
    const priceId = $("#cryptoPriceId").value;
    const accountId = $("#cryptoPriceAccountId").value;
    if (!priceId) return;
    if (!confirm("確定要刪除這筆虛擬貨幣市價紀錄？")) return;
    deleteCryptoPrice(priceId);
    requestAccountDetail(accountId);
  });
}
