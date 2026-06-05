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

function normalizeLiabilityInitialBalance(value) {
  const amount = Math.abs(Number(value) || 0);
  return amount ? -amount : 0;
}

function getAccountStartingBalance(account) {
  if (account.type === "liability") return normalizeLiabilityInitialBalance(account.initialBalance);
  return Number(account.initialBalance) || 0;
}

function isBankLikeAccountType(type) {
  return type === "bank" || type === "salary";
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

function getLiabilityMonthlyPayment(account) {
  return calculateMonthlyPayment(getLiabilityBorrowedPrincipal(account), account.annualInterestRate, account.repaymentMonths);
}

function getLiabilityBorrowedPrincipal(account) {
  const initialPrincipal = Math.abs(Number(account.initialBalance) || 0);
  const additionalBorrowed = data.transactions
    .filter((transaction) => transaction.accountId === account.id && ["income", "transfer-out"].includes(transaction.type))
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
  return initialPrincipal + additionalBorrowed;
}

function getLiabilityPaidAmount(account) {
  return data.transactions
    .filter((transaction) => transaction.accountId === account.id && ["expense", "transfer-in"].includes(transaction.type))
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
}

export function getLiabilityAccountSummary(accountOrId) {
  const account = typeof accountOrId === "string" ? getAccountById(accountOrId) : accountOrId;
  if (!account || account.type !== "liability") {
    return {
      initialPrincipal: 0,
      borrowedPrincipal: 0,
      borrowedTotal: 0,
      paidAmount: 0,
      outstandingDebt: 0,
      monthlyPayment: 0
    };
  }

  const initialPrincipal = Math.abs(Number(account.initialBalance) || 0);
  const borrowedPrincipal = getLiabilityBorrowedPrincipal(account);
  const monthlyPayment = calculateMonthlyPayment(borrowedPrincipal, account.annualInterestRate, account.repaymentMonths);
  const borrowedTotal = calculateTotalRepayment(borrowedPrincipal, account.annualInterestRate, account.repaymentMonths);
  const paidAmount = getLiabilityPaidAmount(account);
  return {
    initialPrincipal,
    borrowedPrincipal,
    borrowedTotal,
    paidAmount,
    outstandingDebt: Math.max(0, borrowedTotal - paidAmount),
    monthlyPayment
  };
}

export function getLiabilityAccountsSummary() {
  return data.accounts
    .filter((account) => account.type === "liability")
    .map(getLiabilityAccountSummary)
    .reduce(
      (total, summary) => ({
        borrowedPrincipal: total.borrowedPrincipal + summary.borrowedPrincipal,
        initialPrincipal: total.initialPrincipal + summary.initialPrincipal,
        borrowedTotal: total.borrowedTotal + summary.borrowedTotal,
        paidAmount: total.paidAmount + summary.paidAmount,
        outstandingDebt: total.outstandingDebt + summary.outstandingDebt,
        monthlyPayment: total.monthlyPayment + summary.monthlyPayment
      }),
      {
        borrowedPrincipal: 0,
        initialPrincipal: 0,
        borrowedTotal: 0,
        paidAmount: 0,
        outstandingDebt: 0,
        monthlyPayment: 0
      }
    );
}

function updateAccountFormSettingsVisibility() {
  const accountType = $("#accountType")?.value || "bank";
  const isLiability = accountType === "liability";
  const isBankLike = isBankLikeAccountType(accountType);
  const accountId = $("#accountId")?.value || "";
  $("#liabilityAccountSettings")?.classList.toggle("is-hidden", !isLiability);
  $("#bankAccountSettings")?.classList.toggle("is-hidden", !isBankLike);
  const initialBalanceLabel = $("#accountInitialBalanceLabel");
  if (initialBalanceLabel) initialBalanceLabel.textContent = isLiability ? "借款初始金額" : "初始金額";
  const canEditInitialBalance = !accountId || isLiability || isBankLike;
  $("#accountInitialBalanceField")?.classList.toggle("is-hidden", !canEditInitialBalance);
  if ($("#accountInitialBalance")) $("#accountInitialBalance").disabled = !canEditInitialBalance;

  const estimate = $("#liabilityPaymentEstimate");
  if (!estimate) return;

  const principalSource = $("#accountInitialBalance")?.value;
  const monthlyPayment = isLiability
    ? calculateMonthlyPayment(principalSource, $("#accountAnnualInterestRate")?.value, $("#accountRepaymentMonths")?.value)
    : 0;
  estimate.textContent = formatCurrency(monthlyPayment);
}

export function createAccount(input) {
  const now = new Date().toISOString();
  const isLiability = input.type === "liability";
  const isBankLike = isBankLikeAccountType(input.type);
  const account = {
    id: createId("account"),
    name: input.name,
    type: input.type,
    initialBalance: isLiability ? normalizeLiabilityInitialBalance(input.initialBalance) : Number(input.initialBalance) || 0,
    annualInterestRate: isLiability ? Number(input.annualInterestRate) || 0 : 0,
    repaymentMonths: isLiability ? Math.max(0, Math.floor(Number(input.repaymentMonths) || 0)) : 0,
    feeSettingsEnabled: isBankLike ? Boolean(input.feeSettingsEnabled) : false,
    bankTransferFee: isBankLike ? Number(input.bankTransferFee) || 0 : 0,
    walletWithdrawalFee: isBankLike ? Number(input.walletWithdrawalFee) || 0 : 0,
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
  const wasLiability = account.type === "liability";
  account.name = input.name;
  account.type = input.type;
  if (account.type === "liability") {
    account.initialBalance = normalizeLiabilityInitialBalance(input.initialBalance);
  } else if (isBankLikeAccountType(account.type)) {
    account.initialBalance = Number(input.initialBalance) || 0;
  } else if (wasLiability) {
    account.initialBalance = Math.abs(Number(account.initialBalance) || 0);
  }
  account.annualInterestRate = account.type === "liability" ? Number(input.annualInterestRate) || 0 : 0;
  account.repaymentMonths = account.type === "liability" ? Math.max(0, Math.floor(Number(input.repaymentMonths) || 0)) : 0;
  account.feeSettingsEnabled = isBankLikeAccountType(account.type) ? Boolean(input.feeSettingsEnabled) : false;
  account.bankTransferFee = isBankLikeAccountType(account.type) ? Number(input.bankTransferFee) || 0 : 0;
  account.walletWithdrawalFee = isBankLikeAccountType(account.type) ? Number(input.walletWithdrawalFee) || 0 : 0;
  account.note = input.note || "";
  account.updatedAt = new Date().toISOString();
  saveData();
  return account;
}

export function deleteAccount(accountId) {
  data.accounts = data.accounts.filter((account) => account.id !== accountId);
  data.transactions = data.transactions.filter((transaction) => transaction.accountId !== accountId && transaction.relatedAccountId !== accountId);
  data.stockTrades = data.stockTrades.filter((trade) => trade.accountId !== accountId);
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
      if (account.type === "liability") {
        if (["income", "transfer-out"].includes(transaction.type)) return balance - transaction.amount;
        if (["expense", "transfer-in"].includes(transaction.type)) return balance + transaction.amount;
        return balance;
      }
      if (["expense", "transfer-out"].includes(transaction.type)) return balance - transaction.amount;
      return balance + transaction.amount;
    }, getAccountStartingBalance(account));
}

export function getCashAccountTotal() {
  return data.accounts
    .filter((account) => !["stock", "crypto", "liability"].includes(account.type))
    .reduce((total, account) => total + getAccountBalance(account.id), 0);
}

export function getLiabilityAccountTotal() {
  return getLiabilityAccountsSummary().outstandingDebt;
}

export function getAccountDisplayValue(account) {
  if (account.type === "stock") return getStockAccountSummary(account.id).marketValue;
  if (account.type === "crypto") return getCryptoAccountSummary(account.id).marketValue;
  if (account.type === "liability") return -getLiabilityAccountSummary(account).outstandingDebt;
  return getAccountBalance(account.id);
}

export function openAccountForm() {
  $("#accountForm").reset();
  $("#accountId").value = "";
  $("#accountType").value = window.currentHomeMode === "liabilities" ? "liability" : "bank";
  $("#accountInitialBalance").value = "0";
  $("#accountAnnualInterestRate").value = "0";
  $("#accountRepaymentMonths").value = "0";
  $("#bankFeeEnabled").checked = false;
  $("#bankTransferFee").value = "0";
  $("#bankWithdrawalFee").value = "0";
  $("#accountInitialBalance").disabled = false;
  updateAccountFormSettingsVisibility();
  requestView("account-form", {
    title: "新增帳戶",
    subtitle: window.currentHomeMode === "liabilities" ? "建立一個新的負債帳戶" : "建立一個新的資產帳戶",
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
  $("#accountInitialBalance").value = Math.abs(Number(account.initialBalance) || 0);
  $("#accountAnnualInterestRate").value = account.annualInterestRate || 0;
  $("#accountRepaymentMonths").value = account.repaymentMonths || 0;
  $("#bankFeeEnabled").checked = Boolean(account.feeSettingsEnabled);
  $("#bankTransferFee").value = account.bankTransferFee || 0;
  $("#bankWithdrawalFee").value = account.walletWithdrawalFee || 0;
  $("#accountNote").value = account.note || "";
  updateAccountFormSettingsVisibility();
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
  const isLiability = account.type === "liability";
  const liabilitySummary = isLiability ? getLiabilityAccountSummary(account) : null;
  return `
    <div class="summary-card panel account-detail-header ${isLiability ? "is-liability-detail" : ""}">
      <div class="account-detail-title">
        <div>
          <h2>${escapeHtml(account.name)}</h2>
          <p class="item-meta">${escapeHtml(account.note || (isLiability ? "負債帳戶" : "一般帳戶"))}</p>
        </div>
        <span class="account-type-pill">${ACCOUNT_TYPES[account.type] || "帳戶"}</span>
      </div>
      ${renderAccountManageButtons()}
      <div class="metric-grid">
        <div class="metric"><span>${isLiability ? "未還負債" : "目前餘額"}</span><strong>${formatCurrency(isLiability ? liabilitySummary.outstandingDebt : balance)}</strong></div>
        ${
          isLiability
            ? `
              <div class="metric"><span>借款初始金額</span><strong>${formatCurrency(liabilitySummary.initialPrincipal)}</strong></div>
              <div class="metric"><span>借款總額</span><strong>${formatCurrency(liabilitySummary.borrowedTotal)}</strong></div>
              <div class="metric"><span>已還款</span><strong>${formatCurrency(liabilitySummary.paidAmount)}</strong></div>
              <div class="metric"><span>估算月還款</span><strong>${formatCurrency(liabilitySummary.monthlyPayment)}</strong></div>
            `
            : ""
        }
      </div>
      <button class="fab-button" id="accountFabButton" type="button" aria-label="新增帳戶操作">+</button>
      <div class="action-sheet" id="accountActionSheet" aria-hidden="true">
        <button class="action-sheet-backdrop" id="accountActionBackdrop" type="button" aria-label="關閉操作選單"></button>
        <div class="action-sheet-panel">
          <h3>${isLiability ? "新增負債紀錄" : "新增紀錄"}</h3>
          <button class="action-sheet-item" id="addIncomeButton" type="button">${isLiability ? "借款" : "收入"}</button>
          <button class="action-sheet-item" id="addExpenseButton" type="button">${isLiability ? "還款" : "支出"}</button>
          <button class="action-sheet-item" id="addTransferButton" type="button">轉帳</button>
        </div>
      </div>
    </div>
    <div class="record-toolbar">
      <label>
        月份
        <input id="transactionMonthFilter" type="month" value="${selectedMonth}" />
      </label>
      <h2>${isLiability ? "借還款紀錄" : "收支紀錄"}</h2>
    </div>
    ${renderTransactionList(account.id, selectedMonth, { liability: isLiability })}
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
  $("#accountType")?.addEventListener("change", updateAccountFormSettingsVisibility);
  $("#accountInitialBalance")?.addEventListener("input", updateAccountFormSettingsVisibility);
  $("#accountAnnualInterestRate")?.addEventListener("input", updateAccountFormSettingsVisibility);
  $("#accountRepaymentMonths")?.addEventListener("input", updateAccountFormSettingsVisibility);

  $("#accountForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const accountId = $("#accountId").value;
      const input = {
        name: requireText($("#accountName").value, "帳戶名稱"),
        type: requireText($("#accountType").value, "帳戶類型"),
        initialBalance: requireNumber($("#accountInitialBalance").value || 0, "初始金額"),
        annualInterestRate: $("#accountAnnualInterestRate").value,
        repaymentMonths: $("#accountRepaymentMonths").value,
        feeSettingsEnabled: $("#bankFeeEnabled").checked,
        bankTransferFee: $("#bankTransferFee").value,
        walletWithdrawalFee: $("#bankWithdrawalFee").value,
        note: $("#accountNote").value.trim()
      };
      if (accountId) {
        updateAccount(accountId, input);
      } else {
        createAccount({
          ...input
        });
      }
      requestHome();
    } catch (error) {
      showError(error);
    }
  });
}
