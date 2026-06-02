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

let expectedIncomeListMonth = currentMonthString();

function addMonths(monthValue, amount) {
  const [year, month] = String(monthValue || currentMonthString()).split("-").map(Number);
  const date = new Date(year, month - 1 + amount, 1);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}`;
}

export function getVisibleExpectedIncomes() {
  const currentMonth = expectedIncomeListMonth || currentMonthString();
  const nextMonth = addMonths(currentMonth, 1);
  return sortByDateDesc(
    data.expectedIncomes.filter((income) => {
      const month = String(income.expectedDate || "").slice(0, 7);
      return month === currentMonth || month === nextMonth;
    })
  );
}

export function createExpectedIncome(input) {
  const expectedIncome = {
    id: createId("income"),
    name: input.name,
    amount: Number(input.amount) || 0,
    expectedDate: input.expectedDate,
    received: Boolean(input.received),
    note: input.note || "",
    createdAt: new Date().toISOString()
  };
  data.expectedIncomes.push(expectedIncome);
  saveData();
  return expectedIncome;
}

export function updateExpectedIncome(incomeId, input) {
  const income = data.expectedIncomes.find((item) => item.id === incomeId);
  if (!income) return null;
  income.name = input.name;
  income.amount = Number(input.amount) || 0;
  income.expectedDate = input.expectedDate;
  income.received = Boolean(input.received);
  income.note = input.note || "";
  saveData();
  return income;
}

export function getExpectedIncomeSummary() {
  const total = data.expectedIncomes.reduce((sum, income) => sum + income.amount, 0);
  const received = data.expectedIncomes.filter((income) => income.received).reduce((sum, income) => sum + income.amount, 0);
  return {
    total,
    received,
    pending: total - received,
    count: data.expectedIncomes.length
  };
}

export function renderExpectedIncomePage() {
  const summary = getExpectedIncomeSummary();
  const incomes = getVisibleExpectedIncomes();
  document.body.dataset.expectedIncomeMode = "list";

  setHtml(
    "#expectedIncomePage",
    `
      <div class="panel">
        <h2 id="expectedIncomeTitle">預期入帳</h2>
        <div class="metric-grid">
          <div class="metric"><span>預期總額</span><strong>${formatCurrency(summary.total)}</strong></div>
          <div class="metric"><span>尚未入帳</span><strong>${formatCurrency(summary.pending)}</strong></div>
          <div class="metric"><span>已入帳</span><strong>${formatCurrency(summary.received)}</strong></div>
          <div class="metric"><span>筆數</span><strong>${summary.count}</strong></div>
        </div>
        <button class="fab-button expected-income-fab" id="addExpectedIncomeButton" type="button" aria-label="新增預期入帳">+</button>
      </div>
      <div class="record-toolbar">
        <label>
          清單月份
          <input id="expectedIncomeMonthFilter" type="month" value="${expectedIncomeListMonth}" />
        </label>
        <h2>清單</h2>
      </div>
      ${renderList(incomes)}
    `
  );

  bindExpectedIncomeEvents();
  requestView("expected-income", {
    title: "預期入帳",
    subtitle: "管理預計會進來的錢",
    showBack: true
  });
}

function renderExpectedIncomeFormPage(incomeId = "") {
  const income = incomeId ? data.expectedIncomes.find((item) => item.id === incomeId) : null;
  document.body.dataset.expectedIncomeMode = "form";
  setHtml(
    "#expectedIncomePage",
    `
      <div class="panel">
        <h2>${income ? "修改預期入帳" : "新增預期入帳"}</h2>
        ${renderForm(income)}
      </div>
    `
  );
  bindExpectedIncomeEvents();
  requestView("expected-income", {
    title: income ? "修改預期入帳" : "新增預期入帳",
    subtitle: "管理預計會入帳的金額",
    showBack: true
  });
}

function renderForm(income = null) {
  return `
    <form id="expectedIncomeForm" class="form-stack">
      <input id="expectedIncomeId" type="hidden" value="${income ? escapeHtml(income.id) : ""}" />
      <label>
        名稱
        <input id="expectedIncomeName" type="text" autocomplete="off" value="${income ? escapeHtml(income.name) : ""}" required />
      </label>
      <label>
        金額
        <input id="expectedIncomeAmount" type="number" inputmode="decimal" step="1" value="${income ? income.amount : ""}" required />
      </label>
      <label>
        預期日期
        <input id="expectedIncomeDate" type="date" value="${income ? escapeHtml(income.expectedDate) : todayString()}" required />
      </label>
      <label>
        <span>是否已入帳</span>
        <input id="expectedIncomeReceived" type="checkbox" ${income?.received ? "checked" : ""} />
      </label>
      <label>
        備註
        <textarea id="expectedIncomeNote" rows="3">${income ? escapeHtml(income.note || "") : ""}</textarea>
      </label>
      <div class="button-row">
        <button class="secondary-button" id="cancelExpectedIncomeButton" type="button">取消</button>
        <button class="primary-button" type="submit">${income ? "更新" : "新增"}</button>
      </div>
      <button class="danger-button ${income ? "" : "is-hidden"}" id="deleteExpectedIncomeButton" type="button">刪除這筆預期入帳</button>
    </form>
  `;
}

function renderList(incomes) {
  if (!incomes.length) return `<div class="empty-state">這兩個月份還沒有預期入帳</div>`;

  return `
    <div class="list-stack">
      ${incomes
        .map(
          (income) => `
            <article class="list-card interactive-card expected-income-card" data-edit-income="${income.id}" role="button" tabindex="0">
              <div class="item-row">
                <div>
                  <div class="item-title">${escapeHtml(income.name)}</div>
                  <div class="item-meta">${escapeHtml(income.expectedDate)}</div>
                </div>
                <div>
                  <strong>${formatCurrency(income.amount)}</strong>
                  <div class="item-meta">${income.received ? "已入帳" : "未入帳"}</div>
                </div>
              </div>
              ${income.note ? `<p class="expected-income-note">${escapeHtml(income.note)}</p>` : ""}
              <div class="record-actions expected-income-actions">
                <button class="secondary-button compact-toggle-button" type="button" data-toggle-income="${income.id}">${income.received ? "改為未入帳" : "標記已入帳"}</button>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function bindExpectedIncomeEvents() {
  $("#expectedIncomeMonthFilter")?.addEventListener("change", (event) => {
    expectedIncomeListMonth = event.target.value || currentMonthString();
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
      const incomeId = $("#expectedIncomeId").value;
      const input = {
        name: requireText($("#expectedIncomeName").value, "名稱"),
        amount: requireNumber($("#expectedIncomeAmount").value, "金額", { positive: true }),
        expectedDate: requireDate($("#expectedIncomeDate").value, "預期日期"),
        received: $("#expectedIncomeReceived").checked,
        note: $("#expectedIncomeNote").value.trim()
      };
      if (incomeId) updateExpectedIncome(incomeId, input);
      else createExpectedIncome(input);
      expectedIncomeListMonth = String(input.expectedDate).slice(0, 7) || currentMonthString();
      renderExpectedIncomePage();
    } catch (error) {
      showError(error);
    }
  });

  document.querySelectorAll("[data-toggle-income]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const income = data.expectedIncomes.find((item) => item.id === button.dataset.toggleIncome);
      if (income) income.received = !income.received;
      saveData();
      renderExpectedIncomePage();
    });
  });

  document.querySelectorAll("[data-edit-income]").forEach((button) => {
    const open = () => renderExpectedIncomeFormPage(button.dataset.editIncome);
    button.addEventListener("click", open);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") open();
    });
  });

  $("#deleteExpectedIncomeButton")?.addEventListener("click", () => {
    const incomeId = $("#expectedIncomeId").value;
    if (!incomeId) return;
    if (!confirm("確定要刪除這筆預期入帳？")) return;
    data.expectedIncomes = data.expectedIncomes.filter((income) => income.id !== incomeId);
    saveData();
    renderExpectedIncomePage();
  });
}
