import { data, saveData } from "./storage.js";
import {
  $,
  createId,
  currentMonthString,
  escapeHtml,
  formatCurrency,
  requestView,
  requireDate,
  requireNumber,
  requireText,
  setHtml,
  showError,
  sortByDateDesc,
  todayString
} from "./utils.js";

let expectedListMonth = currentMonthString();
let expectedMode = "income";
let expectedModeTapAt = 0;

const EXPECTED_CONFIG = {
  income: {
    collection: "expectedIncomes",
    idPrefix: "income",
    pageLabel: "預期收入",
    oppositeMode: "expense",
    statusKey: "received",
    totalLabel: "預期收入總額",
    pendingLabel: "尚未收入",
    doneLabel: "已收入",
    formAddTitle: "新增預期收入",
    formEditTitle: "修改預期收入",
    formSubtitle: "管理預計會收入的金額",
    emptyText: "這兩個月份還沒有預期收入",
    deleteText: "刪除這筆預期收入",
    confirmDeleteText: "確定要刪除這筆預期收入？",
    doneText: "已收入",
    pendingText: "未收入",
    toggleDoneText: "標記已收入",
    togglePendingText: "改為未收入",
    completedQuestion: "是否已收入",
    amountClass: "amount-positive"
  },
  expense: {
    collection: "expectedExpenses",
    idPrefix: "expense",
    pageLabel: "預期支出",
    oppositeMode: "income",
    statusKey: "paid",
    totalLabel: "預期支出總額",
    pendingLabel: "尚未支出",
    doneLabel: "已支出",
    formAddTitle: "新增預期支出",
    formEditTitle: "修改預期支出",
    formSubtitle: "管理預計會支出的金額",
    emptyText: "這兩個月份還沒有預期支出",
    deleteText: "刪除這筆預期支出",
    confirmDeleteText: "確定要刪除這筆預期支出？",
    doneText: "已支出",
    pendingText: "未支出",
    toggleDoneText: "標記已支出",
    togglePendingText: "改為未支出",
    completedQuestion: "是否已支出",
    amountClass: "amount-negative"
  }
};

function getExpectedConfig(mode = expectedMode) {
  return EXPECTED_CONFIG[mode] || EXPECTED_CONFIG.income;
}

function getExpectedCollection(mode = expectedMode) {
  const config = getExpectedConfig(mode);
  if (!Array.isArray(data[config.collection])) data[config.collection] = [];
  return data[config.collection];
}

function addMonths(monthValue, amount) {
  const [year, month] = String(monthValue || currentMonthString()).split("-").map(Number);
  const date = new Date(year, month - 1 + amount, 1);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}`;
}

function getVisibleExpectedItems(mode = expectedMode) {
  const currentMonth = expectedListMonth || currentMonthString();
  const nextMonth = addMonths(currentMonth, 1);
  return sortByDateDesc(
    getExpectedCollection(mode).filter((item) => {
      const month = String(item.expectedDate || "").slice(0, 7);
      return month === currentMonth || month === nextMonth;
    })
  );
}

export function getVisibleExpectedIncomes() {
  return getVisibleExpectedItems("income");
}

function createExpectedItem(mode, input) {
  const config = getExpectedConfig(mode);
  const item = {
    id: createId(config.idPrefix),
    name: input.name,
    amount: Number(input.amount) || 0,
    expectedDate: input.expectedDate,
    [config.statusKey]: Boolean(input.completed),
    note: input.note || "",
    createdAt: new Date().toISOString()
  };
  getExpectedCollection(mode).push(item);
  saveData();
  return item;
}

export function createExpectedIncome(input) {
  return createExpectedItem("income", { ...input, completed: input.received });
}

export function createExpectedExpense(input) {
  return createExpectedItem("expense", { ...input, completed: input.paid });
}

function updateExpectedItem(mode, itemId, input) {
  const config = getExpectedConfig(mode);
  const item = getExpectedCollection(mode).find((entry) => entry.id === itemId);
  if (!item) return null;
  item.name = input.name;
  item.amount = Number(input.amount) || 0;
  item.expectedDate = input.expectedDate;
  item[config.statusKey] = Boolean(input.completed);
  item.note = input.note || "";
  saveData();
  return item;
}

export function updateExpectedIncome(incomeId, input) {
  return updateExpectedItem("income", incomeId, { ...input, completed: input.received });
}

export function updateExpectedExpense(expenseId, input) {
  return updateExpectedItem("expense", expenseId, { ...input, completed: input.paid });
}

function getExpectedSummary(mode) {
  const config = getExpectedConfig(mode);
  const items = getExpectedCollection(mode);
  const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const completed = items.filter((item) => item[config.statusKey]).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return {
    total,
    completed,
    pending: total - completed,
    count: items.length
  };
}

export function getExpectedIncomeSummary() {
  const summary = getExpectedSummary("income");
  return {
    total: summary.total,
    received: summary.completed,
    pending: summary.pending,
    count: summary.count
  };
}

export function getExpectedExpenseSummary() {
  const summary = getExpectedSummary("expense");
  return {
    total: summary.total,
    paid: summary.completed,
    pending: summary.pending,
    count: summary.count
  };
}

export function renderExpectedIncomePage() {
  const config = getExpectedConfig();
  const summary = getExpectedSummary(expectedMode);
  const items = getVisibleExpectedItems(expectedMode);
  document.body.dataset.expectedIncomeMode = "list";

  setHtml(
    "#expectedIncomePage",
    `
      <div class="panel expected-summary-card" id="expectedSummaryCard" data-expected-mode="${expectedMode}">
        <div class="expected-summary-title">
          <h2 id="expectedIncomeTitle">預期收支</h2>
          <span>${config.pageLabel}</span>
        </div>
        <div class="metric-grid">
          <div class="metric"><span>${config.totalLabel}</span><strong class="${config.amountClass}">${formatCurrency(summary.total)}</strong></div>
          <div class="metric"><span>${config.pendingLabel}</span><strong>${formatCurrency(summary.pending)}</strong></div>
          <div class="metric"><span>${config.doneLabel}</span><strong>${formatCurrency(summary.completed)}</strong></div>
          <div class="metric"><span>筆數</span><strong>${summary.count}</strong></div>
        </div>
        <button class="fab-button expected-income-fab" id="addExpectedIncomeButton" type="button" aria-label="${config.formAddTitle}">+</button>
      </div>
      <div class="record-toolbar">
        <label>
          清單月份
          <input id="expectedIncomeMonthFilter" type="month" value="${expectedListMonth}" />
        </label>
        <h2>${config.pageLabel}</h2>
      </div>
      ${renderList(items, config)}
    `
  );

  bindExpectedIncomeEvents();
  requestView("expected-income", {
    title: "預期收支",
    subtitle: config.pageLabel,
    showBack: false
  });
}

function renderExpectedIncomeFormPage(itemId = "") {
  const config = getExpectedConfig();
  const item = itemId ? getExpectedCollection(expectedMode).find((entry) => entry.id === itemId) : null;
  document.body.dataset.expectedIncomeMode = "form";
  setHtml(
    "#expectedIncomePage",
    `
      <div class="panel">
        <h2>${item ? config.formEditTitle : config.formAddTitle}</h2>
        ${renderForm(item, config)}
      </div>
    `
  );
  bindExpectedIncomeEvents();
  requestView("expected-income", {
    title: item ? config.formEditTitle : config.formAddTitle,
    subtitle: config.formSubtitle,
    showBack: false
  });
}

function renderForm(item = null, config = getExpectedConfig()) {
  return `
    <form id="expectedIncomeForm" class="form-stack">
      <input id="expectedIncomeId" type="hidden" value="${item ? escapeHtml(item.id) : ""}" />
      <label>
        名稱
        <input id="expectedIncomeName" type="text" autocomplete="off" value="${item ? escapeHtml(item.name) : ""}" required />
      </label>
      <label>
        金額
        <input id="expectedIncomeAmount" type="number" inputmode="decimal" step="1" value="${item ? item.amount : ""}" required />
      </label>
      <label>
        預期日期
        <input id="expectedIncomeDate" type="date" value="${item ? escapeHtml(item.expectedDate) : todayString()}" required />
      </label>
      <label class="compact-check-label">
        <input id="expectedIncomeReceived" type="checkbox" ${item?.[config.statusKey] ? "checked" : ""} />
        <span>${config.completedQuestion}</span>
      </label>
      <label>
        備註
        <textarea id="expectedIncomeNote" rows="3">${item ? escapeHtml(item.note || "") : ""}</textarea>
      </label>
      <div class="button-row">
        <button class="secondary-button" id="cancelExpectedIncomeButton" type="button">取消</button>
        <button class="primary-button" type="submit">${item ? "更新" : "新增"}</button>
      </div>
      <button class="danger-button ${item ? "" : "is-hidden"}" id="deleteExpectedIncomeButton" type="button">${config.deleteText}</button>
    </form>
  `;
}

function renderList(items, config = getExpectedConfig()) {
  if (!items.length) return `<div class="empty-state">${config.emptyText}</div>`;

  return `
    <div class="list-stack">
      ${items
        .map((item) => {
          const completed = Boolean(item[config.statusKey]);
          return `
            <article class="list-card interactive-card expected-income-card" data-edit-expected="${item.id}" role="button" tabindex="0">
              <div class="item-row">
                <div>
                  <div class="item-title">${escapeHtml(item.name)}</div>
                  <div class="item-meta">${escapeHtml(item.expectedDate)}</div>
                </div>
                <div>
                  <strong class="${config.amountClass}">${formatCurrency(item.amount)}</strong>
                  <div class="item-meta">${completed ? config.doneText : config.pendingText}</div>
                </div>
              </div>
              ${item.note ? `<p class="expected-income-note">${escapeHtml(item.note)}</p>` : ""}
              <div class="record-actions expected-income-actions">
                <button class="secondary-button compact-toggle-button" type="button" data-toggle-expected="${item.id}">${completed ? config.togglePendingText : config.toggleDoneText}</button>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function switchExpectedMode() {
  expectedMode = getExpectedConfig().oppositeMode;
  renderExpectedIncomePage();
}

function bindExpectedModeSwitch() {
  const summaryCard = $("#expectedSummaryCard");
  if (!summaryCard) return;
  summaryCard.addEventListener("click", (event) => {
    if (event.target.closest("button,input,label,select,textarea")) return;
    const now = Date.now();
    if (now - expectedModeTapAt <= 420) {
      expectedModeTapAt = 0;
      switchExpectedMode();
      return;
    }
    expectedModeTapAt = now;
  });
}

function bindExpectedIncomeEvents() {
  bindExpectedModeSwitch();

  $("#expectedIncomeMonthFilter")?.addEventListener("change", (event) => {
    expectedListMonth = event.target.value || currentMonthString();
    renderExpectedIncomePage();
  });

  $("#addExpectedIncomeButton")?.addEventListener("click", () => {
    renderExpectedIncomeFormPage();
  });

  $("#cancelExpectedIncomeButton")?.addEventListener("click", () => {
    renderExpectedIncomePage();
  });

  $("#expectedIncomeForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const itemId = $("#expectedIncomeId").value;
      const input = {
        name: requireText($("#expectedIncomeName").value, "名稱"),
        amount: requireNumber($("#expectedIncomeAmount").value, "金額", { positive: true }),
        expectedDate: requireDate($("#expectedIncomeDate").value, "預期日期"),
        completed: $("#expectedIncomeReceived").checked,
        note: $("#expectedIncomeNote").value.trim()
      };
      if (itemId) updateExpectedItem(expectedMode, itemId, input);
      else createExpectedItem(expectedMode, input);
      expectedListMonth = String(input.expectedDate).slice(0, 7) || currentMonthString();
      renderExpectedIncomePage();
    } catch (error) {
      showError(error);
    }
  });

  document.querySelectorAll("[data-toggle-expected]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const config = getExpectedConfig();
      const item = getExpectedCollection(expectedMode).find((entry) => entry.id === button.dataset.toggleExpected);
      if (item) item[config.statusKey] = !item[config.statusKey];
      saveData();
      renderExpectedIncomePage();
    });
  });

  document.querySelectorAll("[data-edit-expected]").forEach((button) => {
    const open = () => renderExpectedIncomeFormPage(button.dataset.editExpected);
    button.addEventListener("click", open);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") open();
    });
  });

  $("#deleteExpectedIncomeButton")?.addEventListener("click", () => {
    const itemId = $("#expectedIncomeId").value;
    if (!itemId) return;
    if (!confirm(getExpectedConfig().confirmDeleteText)) return;
    const config = getExpectedConfig();
    data[config.collection] = getExpectedCollection(expectedMode).filter((item) => item.id !== itemId);
    saveData();
    renderExpectedIncomePage();
  });
}
