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

  saveData();
  return transferId;
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

export function renderTransactionList(accountId, month) {
  const transactions = getTransactionsByAccountMonth(accountId, month);
  if (!transactions.length) return `<div class="empty-state">這個月份還沒有收入或支出紀錄</div>`;

  return `
    <div class="list-stack">
      ${transactions
        .map((transaction) => {
          const signedAmount = ["expense", "transfer-out"].includes(transaction.type) ? -transaction.amount : transaction.amount;
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
                  <div class="item-title">${TRANSACTION_TYPES[transaction.type] || transaction.type}</div>
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
  $("#transactionId").value = "";
  $("#transactionAccountId").value = accountId;
  $("#deleteTransactionButton").classList.add("is-hidden");
  $("#transactionType").value = type;
  $("#transactionDate").value = todayString();
  requestView("transaction-form", {
    title: type === "expense" ? "新增支出" : "新增收入",
    subtitle: "紀錄帳戶收支",
    showBack: true
  });
}

export function openEditTransactionForm(transactionId) {
  const transaction = data.transactions.find((item) => item.id === transactionId);
  if (!transaction) return;
  $("#transactionForm").reset();
  updateTransactionCategoryDatalist();
  $("#transactionId").value = transaction.id;
  $("#transactionAccountId").value = transaction.accountId;
  $("#transactionType").value = transaction.type;
  $("#transactionAmount").value = transaction.amount;
  $("#transactionDate").value = transaction.date;
  $("#transactionCategory").value = transaction.category || "";
  $("#transactionNote").value = transaction.note || "";
  $("#deleteTransactionButton").classList.remove("is-hidden");
  requestView("transaction-form", {
    title: "修改紀錄",
    subtitle: "更新帳戶收支",
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
      if (transactionId) updateTransaction(transactionId, input);
      else createTransaction(input);
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
