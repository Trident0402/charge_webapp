import { data, saveData } from "./storage.js";
import { renderCryptoAccount, bindCryptoButtons, getCryptoAccountSummary } from "./crypto.js";
import { renderStockAccount, bindStockButtons, getStockAccountSummary } from "./stocks.js";
import { bindTransactionListActions, renderTransactionList } from "./transactions.js";
import {
  $,
  ACCOUNT_TYPES,
  currentMonthString,
  createId,
  escapeHtml,
  formatCurrency,
  requestHome,
  requestView,
  requireNumber,
  requireText,
  setHtml,
  showError
} from "./utils.js";

const accountMonthFilters = new Map();

export function createAccount(input) {
  const now = new Date().toISOString();
  const account = {
    id: createId("account"),
    name: input.name,
    type: input.type,
    initialBalance: Number(input.initialBalance) || 0,
    note: input.note || "",
    createdAt: now,
    updatedAt: now
  };
  data.accounts.push(account);
  saveData();
  return account;
}

export function updateAccount(accountId, input) {
  const account = getAccountById(accountId);
  if (!account) return null;
  account.name = input.name;
  account.type = input.type;
  account.note = input.note || "";
  account.updatedAt = new Date().toISOString();
  saveData();
  return account;
}

export function deleteAccount(accountId) {
  data.accounts = data.accounts.filter((account) => account.id !== accountId);
  data.transactions = data.transactions.filter((transaction) => transaction.accountId !== accountId && transaction.relatedAccountId !== accountId);
  data.stockTrades = data.stockTrades.filter((trade) => trade.accountId !== accountId);
  data.stockPrices = data.stockPrices.filter((price) => price.accountId !== accountId);
  data.cryptoTrades = data.cryptoTrades.filter((trade) => trade.accountId !== accountId);
  data.cryptoPrices = data.cryptoPrices.filter((price) => price.accountId !== accountId);
  saveData();
}

export function getAccountById(accountId) {
  return data.accounts.find((account) => account.id === accountId);
}

export function getAccountBalance(accountId) {
  const account = getAccountById(accountId);
  if (!account) return 0;

  return data.transactions
    .filter((transaction) => transaction.accountId === accountId)
    .reduce((balance, transaction) => {
      if (["expense", "transfer-out"].includes(transaction.type)) return balance - transaction.amount;
      return balance + transaction.amount;
    }, Number(account.initialBalance) || 0);
}

export function getCashAccountTotal() {
  return data.accounts
    .filter((account) => !["stock", "crypto"].includes(account.type))
    .reduce((total, account) => total + getAccountBalance(account.id), 0);
}

export function getAccountDisplayValue(account) {
  if (account.type === "stock") return getStockAccountSummary(account.id).marketValue;
  if (account.type === "crypto") return getCryptoAccountSummary(account.id).marketValue;
  return getAccountBalance(account.id);
}

export function openAccountForm() {
  $("#accountForm").reset();
  $("#accountId").value = "";
  $("#accountInitialBalance").value = "0";
  $("#accountInitialBalance").disabled = false;
  $("#accountInitialBalanceField").classList.remove("is-hidden");
  requestView("account-form", {
    title: "新增帳戶",
    subtitle: "建立一個新的資產帳戶",
    showBack: true
  });
}

export function openEditAccountForm(accountId) {
  const account = getAccountById(accountId);
  if (!account) return;
  $("#accountForm").reset();
  $("#accountId").value = account.id;
  $("#accountName").value = account.name;
  $("#accountType").value = account.type;
  $("#accountNote").value = account.note || "";
  $("#accountInitialBalance").disabled = true;
  $("#accountInitialBalanceField").classList.add("is-hidden");
  requestView("account-form", {
    title: "修改帳戶",
    subtitle: "更新帳戶資料",
    showBack: true
  });
}

export function renderAccountDetail(accountId) {
  const account = getAccountById(accountId);
  if (!account) {
    requestHome();
    return;
  }

  window.currentAccountId = accountId;

  if (account.type === "stock") {
    setHtml("#accountDetail", renderStockAccount(account));
    bindStockButtons(accountId);
  } else if (account.type === "crypto") {
    setHtml("#accountDetail", renderCryptoAccount(account));
    bindCryptoButtons(accountId);
  } else {
    setHtml("#accountDetail", renderCashAccount(account));
    bindCashButtons(accountId);
    bindTransactionListActions(accountId);
  }
  bindAccountHeaderButtons(accountId);

  requestView("account-detail", {
    title: account.name,
    subtitle: ACCOUNT_TYPES[account.type] || "帳戶詳情",
    showBack: true
  });
}

function renderAccountManageButtons() {
  return `
    <div class="compact-actions">
      <button class="secondary-button" id="editAccountButton" type="button">修改帳戶</button>
      <button class="danger-button" id="deleteAccountButton" type="button">刪除帳戶</button>
    </div>
  `;
}

function renderCashAccount(account) {
  const balance = getAccountBalance(account.id);
  const selectedMonth = accountMonthFilters.get(account.id) || currentMonthString();
  return `
    <div class="summary-card panel account-detail-header">
      <div class="account-detail-title">
        <div>
          <h2>${escapeHtml(account.name)}</h2>
          <p class="item-meta">${escapeHtml(account.note || "一般帳戶")}</p>
        </div>
        <span class="account-type-pill">${ACCOUNT_TYPES[account.type] || "帳戶"}</span>
      </div>
      ${renderAccountManageButtons()}
      <div class="metric-grid">
        <div class="metric"><span>目前餘額</span><strong>${formatCurrency(balance)}</strong></div>
      </div>
      <button class="fab-button" id="accountFabButton" type="button" aria-label="新增帳戶操作">+</button>
      <div class="action-sheet" id="accountActionSheet" aria-hidden="true">
        <button class="action-sheet-backdrop" id="accountActionBackdrop" type="button" aria-label="關閉操作選單"></button>
        <div class="action-sheet-panel">
          <h3>新增紀錄</h3>
          <button class="action-sheet-item" id="addIncomeButton" type="button">收入</button>
          <button class="action-sheet-item" id="addExpenseButton" type="button">支出</button>
          <button class="action-sheet-item" id="addTransferButton" type="button">轉帳</button>
        </div>
      </div>
    </div>
    <div class="record-toolbar">
      <label>
        月份
        <input id="transactionMonthFilter" type="month" value="${selectedMonth}" />
      </label>
      <h2>收支紀錄</h2>
    </div>
    ${renderTransactionList(account.id, selectedMonth)}
  `;
}

function bindCashButtons(accountId) {
  const sheet = $("#accountActionSheet");
  const openSheet = () => sheet?.classList.add("is-open");
  const closeSheet = () => sheet?.classList.remove("is-open");

  $("#accountFabButton")?.addEventListener("click", openSheet);
  $("#accountActionBackdrop")?.addEventListener("click", closeSheet);
  $("#transactionMonthFilter")?.addEventListener("change", (event) => {
    accountMonthFilters.set(accountId, event.target.value || currentMonthString());
    renderAccountDetail(accountId);
  });
  $("#addIncomeButton")?.addEventListener("click", () => {
    closeSheet();
    document.dispatchEvent(new CustomEvent("openTransactionForm", { detail: { accountId, type: "income" } }));
  });
  $("#addExpenseButton")?.addEventListener("click", () => {
    closeSheet();
    document.dispatchEvent(new CustomEvent("openTransactionForm", { detail: { accountId, type: "expense" } }));
  });
  $("#addTransferButton")?.addEventListener("click", () => {
    closeSheet();
    document.dispatchEvent(new CustomEvent("openTransferForm", { detail: { accountId } }));
  });
}

function bindAccountHeaderButtons(accountId) {
  $("#editAccountButton")?.addEventListener("click", () => openEditAccountForm(accountId));
  $("#deleteAccountButton")?.addEventListener("click", () => {
    if (!confirm("確定要刪除這個帳戶與所有相關紀錄？")) return;
    deleteAccount(accountId);
    requestHome();
  });
}

export { renderAccountManageButtons };

export function bindAccountForm() {
  $("#openAccountFormButton")?.addEventListener("click", openAccountForm);

  $("#accountForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const accountId = $("#accountId").value;
      const input = {
        name: requireText($("#accountName").value, "帳戶名稱"),
        type: requireText($("#accountType").value, "帳戶類型"),
        note: $("#accountNote").value.trim()
      };
      if (accountId) {
        updateAccount(accountId, input);
      } else {
        createAccount({
          ...input,
          initialBalance: requireNumber($("#accountInitialBalance").value || 0, "初始金額")
        });
      }
      requestHome();
    } catch (error) {
      showError(error);
    }
  });
}
