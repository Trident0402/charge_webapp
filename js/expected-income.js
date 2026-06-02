import { data, saveData } from "./storage.js";
import {
  $,
  createId,
  escapeHtml,
  formatCurrency,
  isInNextMonth,
  requestView,
  requireDate,
  requireNumber,
  requireText,
  setHtml,
  showError,
  sortByDateDesc,
  todayString
} from "./utils.js";

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

export function getNextMonthExpectedIncomeSummary() {
  const nextMonthItems = data.expectedIncomes.filter((income) => isInNextMonth(income.expectedDate));
  const total = nextMonthItems.reduce((sum, income) => sum + income.amount, 0);
  const received = nextMonthItems.filter((income) => income.received).reduce((sum, income) => sum + income.amount, 0);
  return {
    total,
    received,
    pending: total - received,
    count: nextMonthItems.length
  };
}

export function renderExpectedIncomePage() {
  const summary = getNextMonthExpectedIncomeSummary();
  const incomes = sortByDateDesc(data.expectedIncomes);

  setHtml(
    "#expectedIncomePage",
    `
      <div class="panel">
        <h2 id="expectedIncomeTitle">下個月預期入帳</h2>
        <div class="metric-grid">
          <div class="metric"><span>預期總額</span><strong>${formatCurrency(summary.total)}</strong></div>
          <div class="metric"><span>尚未入帳</span><strong>${formatCurrency(summary.pending)}</strong></div>
          <div class="metric"><span>已入帳</span><strong>${formatCurrency(summary.received)}</strong></div>
          <div class="metric"><span>筆數</span><strong>${summary.count}</strong></div>
        </div>
      </div>
      <div class="section-heading"><h2>新增預期入帳</h2></div>
      ${renderForm()}
      <div class="section-heading"><h2>清單</h2></div>
      ${renderList(incomes)}
    `
  );

  bindExpectedIncomeEvents();
  requestView("expected-income", {
    title: "預期入帳",
    subtitle: "管理下個月會進來的錢",
    showBack: true
  });
}

function renderForm() {
  return `
    <form id="expectedIncomeForm" class="panel form-stack">
      <input id="expectedIncomeId" type="hidden" />
      <label>
        名稱
        <input id="expectedIncomeName" type="text" autocomplete="off" required />
      </label>
      <label>
        金額
        <input id="expectedIncomeAmount" type="number" inputmode="decimal" step="1" required />
      </label>
      <label>
        預期日期
        <input id="expectedIncomeDate" type="date" value="${todayString()}" required />
      </label>
      <label>
        <span>是否已入帳</span>
        <input id="expectedIncomeReceived" type="checkbox" />
      </label>
      <label>
        備註
        <textarea id="expectedIncomeNote" rows="3"></textarea>
      </label>
      <button class="primary-button" type="submit">新增</button>
      <button class="danger-button is-hidden" id="deleteExpectedIncomeButton" type="button">刪除這筆預期入帳</button>
    </form>
  `;
}

function renderList(incomes) {
  if (!incomes.length) return `<div class="empty-state">還沒有預期入帳</div>`;

  return `
    <div class="list-stack">
      ${incomes
        .map(
          (income) => `
            <article class="list-card interactive-card" data-edit-income="${income.id}" role="button" tabindex="0">
              <div class="item-row">
                <div>
                  <div class="item-title">${escapeHtml(income.name)}</div>
                  <div class="item-meta">${escapeHtml(income.expectedDate)}${income.note ? ` · ${escapeHtml(income.note)}` : ""}</div>
                </div>
                <div>
                  <strong>${formatCurrency(income.amount)}</strong>
                  <div class="item-meta">${income.received ? "已入帳" : "未入帳"}</div>
                </div>
              </div>
              <div class="button-row" style="margin-top: 12px">
                <button class="secondary-button" type="button" data-toggle-income="${income.id}">${income.received ? "改為未入帳" : "標記已入帳"}</button>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function bindExpectedIncomeEvents() {
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
    const open = () => {
      const income = data.expectedIncomes.find((item) => item.id === button.dataset.editIncome);
      if (!income) return;
      $("#expectedIncomeId").value = income.id;
      $("#expectedIncomeName").value = income.name;
      $("#expectedIncomeAmount").value = income.amount;
      $("#expectedIncomeDate").value = income.expectedDate;
      $("#expectedIncomeReceived").checked = income.received;
      $("#expectedIncomeNote").value = income.note || "";
      $("#expectedIncomeForm button[type='submit']").textContent = "更新";
      $("#deleteExpectedIncomeButton").classList.remove("is-hidden");
    };
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
