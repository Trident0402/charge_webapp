import { data, saveData } from "./storage.js";
import { renderStockAccount, bindStockButtons, getStockAccountSummary } from "./stocks.js";
import { renderTransactionList } from "./transactions.js";
import {
  $,
  ACCOUNT_TYPES,
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

export function getAccountById(accountId) {
  return data.accounts.find((account) => account.id === accountId);
}

export function getAccountBalance(accountId) {
  const account = getAccountById(accountId);
  if (!account) return 0;

  return data.transactions
    .filter((transaction) => transaction.accountId === accountId)
    .reduce((balance, transaction) => {
      if (transaction.type === "expense") return balance - transaction.amount;
      return balance + transaction.amount;
    }, Number(account.initialBalance) || 0);
}

export function getCashAccountTotal() {
  return data.accounts
    .filter((account) => account.type !== "stock")
    .reduce((total, account) => total + getAccountBalance(account.id), 0);
}

export function getAccountDisplayValue(account) {
  if (account.type === "stock") return getStockAccountSummary(account.id).marketValue;
  return getAccountBalance(account.id);
}

export function openAccountForm() {
  $("#accountForm").reset();
  $("#accountInitialBalance").value = "0";
  requestView("account-form", {
    title: "新增帳戶",
    subtitle: "建立一個新的資產資料夾",
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
  } else {
    setHtml("#accountDetail", renderCashAccount(account));
    bindCashButtons(accountId);
  }

  requestView("account-detail", {
    title: account.name,
    subtitle: ACCOUNT_TYPES[account.type] || "帳戶詳情",
    showBack: true
  });
}

function renderCashAccount(account) {
  const balance = getAccountBalance(account.id);
  return `
    <div class="summary-card panel account-detail-header">
      <div class="account-detail-title">
        <div>
          <h2>${escapeHtml(account.name)}</h2>
          <p class="item-meta">${escapeHtml(account.note || "一般帳戶")}</p>
        </div>
        <span class="account-type-pill">${ACCOUNT_TYPES[account.type] || "帳戶"}</span>
      </div>
      <div class="metric-grid">
        <div class="metric"><span>目前餘額</span><strong>${formatCurrency(balance)}</strong></div>
        <div class="metric"><span>初始金額</span><strong>${formatCurrency(account.initialBalance)}</strong></div>
      </div>
      <div class="action-grid">
        <button class="primary-button" id="addIncomeButton" type="button">新增收入</button>
        <button class="secondary-button" id="addExpenseButton" type="button">新增支出</button>
        <button class="secondary-button" id="addAdjustmentButton" type="button">餘額調整</button>
      </div>
    </div>
    <div class="section-heading"><h2>收支紀錄</h2></div>
    ${renderTransactionList(account.id)}
  `;
}

function bindCashButtons(accountId) {
  $("#addIncomeButton")?.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("openTransactionForm", { detail: { accountId, type: "income" } }));
  });
  $("#addExpenseButton")?.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("openTransactionForm", { detail: { accountId, type: "expense" } }));
  });
  $("#addAdjustmentButton")?.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("openTransactionForm", { detail: { accountId, type: "adjustment" } }));
  });
}

export function bindAccountForm() {
  $("#openAccountFormButton")?.addEventListener("click", openAccountForm);

  $("#accountForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      createAccount({
        name: requireText($("#accountName").value, "帳戶名稱"),
        type: requireText($("#accountType").value, "帳戶類型"),
        initialBalance: requireNumber($("#accountInitialBalance").value || 0, "初始金額"),
        note: $("#accountNote").value.trim()
      });
      requestHome();
    } catch (error) {
      showError(error);
    }
  });
}
