export const ACCOUNT_TYPES = {
  bank: "銀行帳戶",
  linepay: "行動支付",
  wallet: "錢包",
  stock: "股票帳戶",
  crypto: "虛擬貨幣帳戶",
  other: "其他"
};

export const ACCOUNT_ICONS = {
  bank: "./assets/bank.png",
  linepay: "./assets/line.png",
  wallet: "./assets/cash.png",
  stock: "./assets/stock.png",
  crypto: "./assets/icon.svg",
  other: "./assets/icon.svg"
};

export const TRANSACTION_TYPES = {
  income: "收入",
  expense: "支出",
  adjustment: "調整",
  "transfer-in": "轉入",
  "transfer-out": "轉出"
};

export const STOCK_TRADE_TYPES = {
  buy: "買入",
  sell: "賣出"
};

export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function setHtml(selector, html) {
  const element = $(selector);
  if (element) element.innerHTML = html;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function createId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export function currentMonthString() {
  return new Date().toISOString().slice(0, 7);
}

export function sortByDateDesc(items) {
  return [...items].sort((a, b) => {
    const aDate = a.date || a.expectedDate || "";
    const bDate = b.date || b.expectedDate || "";
    const dateCompare = String(bDate).localeCompare(String(aDate));
    if (dateCompare !== 0) return dateCompare;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
}

export function formatCurrency(value, currency = "TWD") {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

export function formatNumber(value, digits = 2) {
  return new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: digits
  }).format(Number(value) || 0);
}

export function formatPercent(value) {
  return `${formatNumber(value, 2)}%`;
}

export function amountClass(value) {
  return Number(value) >= 0 ? "amount-positive" : "amount-negative";
}

export function requireText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`請輸入${label}`);
  return text;
}

export function requireNumber(value, label, options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`請輸入有效的${label}`);
  if (options.positive && number <= 0) throw new Error(`${label}必須大於 0`);
  return number;
}

export function requireDate(value, label = "日期") {
  const text = String(value || "").trim();
  if (!text) throw new Error(`請選擇${label}`);
  return text;
}

export function showError(error) {
  alert(error instanceof Error ? error.message : String(error));
}

export function requestView(view, options = {}) {
  document.dispatchEvent(new CustomEvent("showView", { detail: { view, options } }));
}

export function requestHome() {
  document.dispatchEvent(new CustomEvent("renderHome"));
}

export function requestAccountDetail(accountId) {
  document.dispatchEvent(new CustomEvent("openAccountDetail", { detail: { accountId } }));
}
