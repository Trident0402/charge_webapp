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

export function createTransaction(input) {
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

export function getTransactionsByAccount(accountId) {
  return sortByDateDesc(data.transactions.filter((transaction) => transaction.accountId === accountId));
}

export function renderTransactionList(accountId) {
  const transactions = getTransactionsByAccount(accountId);
  if (!transactions.length) return `<div class="empty-state">還沒有收入或支出紀錄</div>`;

  return `
    <div class="list-stack">
      ${transactions
        .map((transaction) => {
          const signedAmount = transaction.type === "expense" ? -transaction.amount : transaction.amount;
          return `
            <article class="list-card">
              <div class="item-row">
                <div>
                  <div class="item-title">${TRANSACTION_TYPES[transaction.type] || transaction.type}</div>
                  <div class="item-meta">
                    ${escapeHtml(transaction.date)}
                    ${transaction.category ? ` · ${escapeHtml(transaction.category)}` : ""}
                    ${transaction.note ? ` · ${escapeHtml(transaction.note)}` : ""}
                  </div>
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
  $("#transactionAccountId").value = accountId;
  $("#transactionType").value = type;
  $("#transactionDate").value = todayString();
  requestView("transaction-form", {
    title: type === "expense" ? "新增支出" : "新增收入",
    subtitle: "紀錄帳戶收支",
    showBack: true
  });
}

export function bindTransactionForm() {
  $("#transactionForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const accountId = requireText($("#transactionAccountId").value, "帳戶");
      createTransaction({
        accountId,
        type: $("#transactionType").value,
        amount: requireNumber($("#transactionAmount").value, "金額", { positive: true }),
        date: requireDate($("#transactionDate").value),
        category: $("#transactionCategory").value.trim(),
        note: $("#transactionNote").value.trim()
      });
      requestAccountDetail(accountId);
    } catch (error) {
      showError(error);
    }
  });
}
