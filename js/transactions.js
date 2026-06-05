import { data, saveData } from "./storage.js";
import {
  $,
  TRANSACTION_TYPES,
  amountClass,
  createId,
  escapeHtml,
  formatCurrency,
  requestAccountDetail,
  requestView,
  requireDate,
  requireNumber,
  requireText,
  showError,
  sortByDateDesc,
  todayString
} from "./utils.js";

const BASE_TRANSACTION_CATEGORIES = [
  "薪資",
  "早餐",
  "午餐",
  "晚餐",
  "飲料",
  "房租",
  "電費",
  "電話費",
  "旅遊",
  "生活必需品",
  "健康",
  "串流服務"
];

function normalizeCategory(value) {
  return String(value || "").trim().toLowerCase();
}

function addUniqueCategory(categories, category) {
  const cleanCategory = String(category || "").trim();
  if (!cleanCategory) return;
  if (!categories.some((item) => normalizeCategory(item) === normalizeCategory(cleanCategory))) {
    categories.push(cleanCategory);
  }
}

export function rememberTransactionCategory(category) {
  const cleanCategory = String(category || "").trim();
  if (!cleanCategory) return false;
  const isBaseCategory = BASE_TRANSACTION_CATEGORIES.some((item) => normalizeCategory(item) === normalizeCategory(cleanCategory));
  const alreadySaved = data.transactionCategories.some((item) => normalizeCategory(item) === normalizeCategory(cleanCategory));
  if (isBaseCategory || alreadySaved) return false;
  data.transactionCategories.push(cleanCategory);
  return true;
}

export function getTransactionCategories() {
  const categories = [...BASE_TRANSACTION_CATEGORIES];
  (data.transactionCategories || []).forEach((category) => addUniqueCategory(categories, category));
  data.transactions.forEach((transaction) => {
    if (!["income", "expense"].includes(transaction.type)) return;
    const category = String(transaction.category || "").trim();
    if (!category) return;
    addUniqueCategory(categories, category);
  });
  return categories;
}

function updateTransactionCategoryDatalist() {
  const datalist = $("#transactionCategoryList");
  if (!datalist) return;
  datalist.innerHTML = getTransactionCategories()
    .map((category) => `<option value="${escapeHtml(category)}"></option>`)
    .join("");
}

export function createTransaction(input) {
  rememberTransactionCategory(input.category);
  const transaction = {
    id: createId("txn"),
    accountId: input.accountId,
    type: input.type,
    amount: Number(input.amount) || 0,
    category: input.category || "",
    date: input.date,
    note: input.note || "",
    createdAt: new Date().toISOString()
  };
  data.transactions.push(transaction);
  saveData();
  return transaction;
}

function createExpenseTransferFee(input) {
  const amount = Number(input.transferFeeAmount) || 0;
  if (input.type !== "expense" || !input.includeTransferFee || amount <= 0) return null;

  const feeTransaction = {
    id: createId("txn"),
    accountId: input.accountId,
    type: "expense",
    amount,
    category: "轉帳手續費",
    date: input.date,
    note: "支出自動新增",
    feeForTransactionId: input.sourceTransactionId || "",
    createdAt: new Date().toISOString()
  };
  data.transactions.push(feeTransaction);
  saveData();
  return feeTransaction;
}

export function createTransactionWithOptionalTransferFee(input) {
  const transaction = createTransaction(input);
  createExpenseTransferFee({
    ...input,
    sourceTransactionId: transaction.id
  });
  return transaction;
}

export function updateTransaction(transactionId, input) {
  const transaction = data.transactions.find((item) => item.id === transactionId);
  if (!transaction) return null;
  rememberTransactionCategory(input.category);
  transaction.type = input.type;
  transaction.amount = Number(input.amount) || 0;
  transaction.category = input.category || "";
  transaction.date = input.date;
  transaction.note = input.note || "";
  saveData();
  return transaction;
}

export function deleteTransaction(transactionId) {
  data.transactions = data.transactions.filter((transaction) => transaction.id !== transactionId);
  saveData();
}

export function createTransfer(input) {
  const transferId = createId("transfer");
  const now = new Date().toISOString();
  const reason = input.reason || "";
  const fromAccount = data.accounts.find((account) => account.id === input.fromAccountId);
  const toAccount = data.accounts.find((account) => account.id === input.toAccountId);
  const fee = getAutoTransferFee(fromAccount, toAccount);

  data.transactions.push(
    {
      id: createId("txn"),
      accountId: input.fromAccountId,
      type: "transfer-out",
      amount: Number(input.amount) || 0,
      category: "轉帳",
      date: input.date,
      note: reason,
      transferId,
      relatedAccountId: input.toAccountId,
      createdAt: now
    },
    {
      id: createId("txn"),
      accountId: input.toAccountId,
      type: "transfer-in",
      amount: Number(input.amount) || 0,
      category: "轉帳",
      date: input.date,
      note: reason,
      transferId,
      relatedAccountId: input.fromAccountId,
      createdAt: now
    }
  );

  if (fee.amount > 0) {
    data.transactions.push({
      id: createId("txn"),
      accountId: input.fromAccountId,
      type: "expense",
      amount: fee.amount,
      category: fee.category,
      date: input.date,
      note: fee.note,
      feeForTransferId: transferId,
      relatedAccountId: input.toAccountId,
      createdAt: now
    });
  }

  saveData();
  return transferId;
}

function getAutoTransferFee(fromAccount, toAccount) {
  const isBankLike = (account) => account?.type === "bank" || account?.type === "salary";
  if (!isBankLike(fromAccount) || !fromAccount.feeSettingsEnabled) {
    return { amount: 0, category: "", note: "" };
  }
  if (isBankLike(toAccount)) {
    return {
      amount: Number(fromAccount.bankTransferFee) || 0,
      category: "轉帳手續費",
      note: "轉帳自動新增"
    };
  }
  if (toAccount?.type === "wallet") {
    return {
      amount: Number(fromAccount.walletWithdrawalFee) || 0,
      category: "提領手續費",
      note: "轉帳自動新增"
    };
  }
  return { amount: 0, category: "", note: "" };
}

export function updateTransfer(transferId, input) {
  const related = data.transactions.filter((transaction) => transaction.transferId === transferId);
  if (!related.length) return null;

  const transferOut = related.find((transaction) => transaction.type === "transfer-out");
  const transferIn = related.find((transaction) => transaction.type === "transfer-in");
  const fromAccountId = input.fromAccountId || transferOut?.accountId;
  const toAccountId = input.toAccountId || transferIn?.accountId;

  if (!transferOut || !transferIn || !fromAccountId || !toAccountId) return null;

  transferOut.accountId = fromAccountId;
  transferOut.relatedAccountId = toAccountId;
  transferOut.amount = Number(input.amount) || 0;
  transferOut.date = input.date;
  transferOut.note = input.reason || "";
  transferOut.category = "轉帳";

  transferIn.accountId = toAccountId;
  transferIn.relatedAccountId = fromAccountId;
  transferIn.amount = Number(input.amount) || 0;
  transferIn.date = input.date;
  transferIn.note = input.reason || "";
  transferIn.category = "轉帳";

  saveData();
  return transferId;
}

export function deleteTransfer(transferId) {
  data.transactions = data.transactions.filter((transaction) => transaction.transferId !== transferId);
  saveData();
}

export function getTransactionsByAccount(accountId) {
  return sortByDateDesc(data.transactions.filter((transaction) => transaction.accountId === accountId));
}

export function getTransactionsByAccountMonth(accountId, month) {
  return getTransactionsByAccount(accountId).filter((transaction) => {
    if (!month) return true;
    return String(transaction.date || "").startsWith(month);
  });
}

function isLiabilityAccount(accountId) {
  return data.accounts.find((account) => account.id === accountId)?.type === "liability";
}

function getTransactionTypeLabel(type, liability = false) {
  if (liability && type === "income") return "借款";
  if (liability && type === "expense") return "還款";
  return TRANSACTION_TYPES[type] || type;
}

function setTransactionTypeLabels(liability = false) {
  const incomeOption = $('#transactionType option[value="income"]');
  const expenseOption = $('#transactionType option[value="expense"]');
  if (incomeOption) incomeOption.textContent = liability ? "借款" : "收入";
  if (expenseOption) expenseOption.textContent = liability ? "還款" : "支出";
}

function getAccountTransferFee(accountId) {
  const account = data.accounts.find((item) => item.id === accountId);
  return Number(account?.bankTransferFee) || 0;
}

function updateTransactionFeeSettingsVisibility() {
  const transactionId = $("#transactionId")?.value || "";
  const type = $("#transactionType")?.value;
  const showSettings = !transactionId && type === "expense";
  const includeFee = Boolean($("#includeTransferFee")?.checked);
  $("#transactionFeeSettings")?.classList.toggle("is-hidden", !showSettings);
  $("#transactionFeeAmountField")?.classList.toggle("is-hidden", !showSettings || !includeFee);
}

function getSignedTransactionAmount(transaction, liability = false) {
  if (liability) {
    if (["income", "transfer-out"].includes(transaction.type)) return -transaction.amount;
    if (["expense", "transfer-in"].includes(transaction.type)) return transaction.amount;
    return transaction.amount;
  }
  return ["expense", "transfer-out"].includes(transaction.type) ? -transaction.amount : transaction.amount;
}

export function renderTransactionList(accountId, month, options = {}) {
  const transactions = getTransactionsByAccountMonth(accountId, month);
  const liability = Boolean(options.liability);
  if (!transactions.length) {
    return `<div class="empty-state">${liability ? "這個月份還沒有借款或還款紀錄" : "這個月份還沒有收入或支出紀錄"}</div>`;
  }

  return `
    <div class="list-stack">
      ${transactions
        .map((transaction) => {
          const signedAmount = getSignedTransactionAmount(transaction, liability);
          const relatedAccount = transaction.relatedAccountId
            ? data.accounts.find((account) => account.id === transaction.relatedAccountId)
            : null;
          const relatedText = relatedAccount ? ` · ${transaction.type === "transfer-out" ? "到" : "從"} ${escapeHtml(relatedAccount.name)}` : "";
          const editAttribute = transaction.transferId
            ? `data-edit-transfer="${transaction.transferId}"`
            : `data-edit-transaction="${transaction.id}"`;
          return `
            <article class="list-card interactive-card" ${editAttribute} role="button" tabindex="0">
              <div class="item-row">
                <div>
                  <div class="item-title">${getTransactionTypeLabel(transaction.type, liability)}</div>
                  <div class="item-meta">
                    ${escapeHtml(transaction.date)}
                    ${relatedText}
                    ${transaction.note ? ` · ${escapeHtml(transaction.note)}` : ""}
                  </div>
                  ${transaction.category ? `<span class="category-tag">${escapeHtml(transaction.category)}</span>` : ""}
                </div>
                <div class="transaction-amount ${amountClass(signedAmount)}">${formatCurrency(signedAmount)}</div>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

export function openTransactionForm(accountId, type = "income") {
  $("#transactionForm").reset();
  updateTransactionCategoryDatalist();
  const liability = isLiabilityAccount(accountId);
  setTransactionTypeLabels(liability);
  $("#transactionId").value = "";
  $("#transactionAccountId").value = accountId;
  $("#deleteTransactionButton").classList.add("is-hidden");
  $("#transactionType").value = type;
  $("#transactionDate").value = todayString();
  $("#includeTransferFee").checked = false;
  $("#transactionTransferFee").value = getAccountTransferFee(accountId);
  updateTransactionFeeSettingsVisibility();
  requestView("transaction-form", {
    title: liability ? (type === "expense" ? "新增還款" : "新增借款") : type === "expense" ? "新增支出" : "新增收入",
    subtitle: liability ? "紀錄負債借還款" : "紀錄帳戶收支",
    showBack: true
  });
}

export function openEditTransactionForm(transactionId) {
  const transaction = data.transactions.find((item) => item.id === transactionId);
  if (!transaction) return;
  $("#transactionForm").reset();
  updateTransactionCategoryDatalist();
  const liability = isLiabilityAccount(transaction.accountId);
  setTransactionTypeLabels(liability);
  $("#transactionId").value = transaction.id;
  $("#transactionAccountId").value = transaction.accountId;
  $("#transactionType").value = transaction.type;
  $("#transactionAmount").value = transaction.amount;
  $("#transactionDate").value = transaction.date;
  $("#transactionCategory").value = transaction.category || "";
  $("#transactionNote").value = transaction.note || "";
  $("#deleteTransactionButton").classList.remove("is-hidden");
  $("#includeTransferFee").checked = false;
  $("#transactionTransferFee").value = getAccountTransferFee(transaction.accountId);
  updateTransactionFeeSettingsVisibility();
  requestView("transaction-form", {
    title: liability ? "修改負債紀錄" : "修改紀錄",
    subtitle: liability ? "更新負債借還款" : "更新帳戶收支",
    showBack: true
  });
}

export function openTransferForm(accountId, transferId = "") {
  $("#transferForm").reset();
  $("#transferId").value = transferId;
  $("#deleteTransferButton").classList.toggle("is-hidden", !transferId);
  $("#transferFromAccountId").value = accountId;
  $("#transferDate").value = todayString();

  const transferOut = transferId ? data.transactions.find((transaction) => transaction.transferId === transferId && transaction.type === "transfer-out") : null;
  const transferIn = transferId ? data.transactions.find((transaction) => transaction.transferId === transferId && transaction.type === "transfer-in") : null;
  const fromAccountId = transferOut?.accountId || accountId;
  const selectedToAccountId = transferIn?.accountId || "";

  $("#transferFromAccountId").value = fromAccountId;
  if (transferOut) {
    $("#transferAmount").value = transferOut.amount;
    $("#transferDate").value = transferOut.date;
    $("#transferReason").value = transferOut.note || "";
  }

  const targetAccounts = data.accounts.filter((account) => account.id !== fromAccountId && !["stock", "crypto"].includes(account.type));
  $("#transferToAccountId").innerHTML = targetAccounts
    .map((account) => `<option value="${account.id}" ${account.id === selectedToAccountId ? "selected" : ""}>${escapeHtml(account.name)}</option>`)
    .join("");

  if (!targetAccounts.length) {
    $("#transferToAccountId").innerHTML = `<option value="">沒有可轉入的一般帳戶</option>`;
  }

  requestView("transfer-form", {
    title: transferId ? "修改轉帳" : "帳戶轉帳",
    subtitle: "在一般帳戶之間移動金額",
    showBack: true
  });
}

export function bindTransactionListActions(accountId) {
  document.querySelectorAll("[data-edit-transaction]").forEach((card) => {
    const open = () => openEditTransactionForm(card.dataset.editTransaction);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") open();
    });
  });

  document.querySelectorAll("[data-edit-transfer]").forEach((card) => {
    const open = () => openTransferForm(accountId, card.dataset.editTransfer);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") open();
    });
  });
}

export function bindTransactionForms() {
  $("#transactionType")?.addEventListener("change", updateTransactionFeeSettingsVisibility);
  $("#includeTransferFee")?.addEventListener("change", updateTransactionFeeSettingsVisibility);

  $("#transactionForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const accountId = requireText($("#transactionAccountId").value, "帳戶");
      const transactionId = $("#transactionId").value;
      const input = {
        accountId,
        type: $("#transactionType").value,
        amount: requireNumber($("#transactionAmount").value, "金額", { positive: true }),
        date: requireDate($("#transactionDate").value),
        category: $("#transactionCategory").value.trim(),
        note: $("#transactionNote").value.trim()
      };
      if (transactionId) {
        updateTransaction(transactionId, input);
      } else {
        createTransactionWithOptionalTransferFee({
          ...input,
          includeTransferFee: $("#includeTransferFee").checked,
          transferFeeAmount: $("#transactionTransferFee").value
        });
      }
      requestAccountDetail(accountId);
    } catch (error) {
      showError(error);
    }
  });

  $("#deleteTransactionButton")?.addEventListener("click", () => {
    const transactionId = $("#transactionId").value;
    const accountId = $("#transactionAccountId").value;
    if (!transactionId) return;
    if (!confirm("確定要刪除這筆紀錄？")) return;
    deleteTransaction(transactionId);
    requestAccountDetail(accountId);
  });

  $("#transferForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const fromAccountId = requireText($("#transferFromAccountId").value, "轉出帳戶");
      const toAccountId = requireText($("#transferToAccountId").value, "轉入帳戶");
      if (fromAccountId === toAccountId) throw new Error("轉入帳戶不能和目前帳戶相同");

      const transferId = $("#transferId").value;
      const input = {
        fromAccountId,
        toAccountId,
        amount: requireNumber($("#transferAmount").value, "金額", { positive: true }),
        date: requireDate($("#transferDate").value),
        reason: $("#transferReason").value.trim()
      };
      if (transferId) updateTransfer(transferId, input);
      else createTransfer(input);
      requestAccountDetail(fromAccountId);
    } catch (error) {
      showError(error);
    }
  });

  $("#deleteTransferButton")?.addEventListener("click", () => {
    const transferId = $("#transferId").value;
    const fromAccountId = $("#transferFromAccountId").value;
    if (!transferId) return;
    if (!confirm("確定要刪除這筆轉帳？兩邊帳戶的轉入/轉出都會刪除。")) return;
    deleteTransfer(transferId);
    requestAccountDetail(fromAccountId);
  });
}
