import { getAccountDisplayValue, getCashAccountTotal, renderAccountDetail, bindAccountForm } from "./accounts.js";
import { renderExpectedIncomePage, getNextMonthExpectedIncomeSummary } from "./expected-income.js";
import { renderSettingsPage } from "./settings.js";
import { getAllStockMarketValue } from "./stocks.js";
import { bindStockForms } from "./stocks.js";
import { bindTransactionForm, openTransactionForm } from "./transactions.js";
import { data, loadData } from "./storage.js";
import {
  $,
  $$,
  ACCOUNT_ICONS,
  ACCOUNT_TYPES,
  escapeHtml,
  formatCurrency,
  requestHome,
  setHtml
} from "./utils.js";

window.currentAccountId = null;
let currentView = "home";

function showView(view, options = {}) {
  $$(".view").forEach((element) => element.classList.remove("is-active"));
  $(`#view-${view}`)?.classList.add("is-active");

  currentView = view;
  $("#appTitle").textContent = options.title || "資產資料夾";
  $("#appSubtitle").textContent = options.subtitle || "離線個人資產管理";
  $("#backButton").classList.toggle("is-hidden", !options.showBack);

  $$(".bottom-nav button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.nav === view);
  });
}

function renderHome() {
  window.currentAccountId = null;
  const cashTotal = getCashAccountTotal();
  const stockTotal = getAllStockMarketValue();
  const expected = getNextMonthExpectedIncomeSummary();

  setHtml(
    "#homeSummary",
    `
      <div class="home-hero">
        <div>
          <span>總資產</span>
          <strong>${formatCurrency(cashTotal + stockTotal)}</strong>
        </div>
        <div class="metric-grid">
          <div class="metric"><span>現金類</span><strong>${formatCurrency(cashTotal)}</strong></div>
          <div class="metric"><span>股票市值</span><strong>${formatCurrency(stockTotal)}</strong></div>
          <div class="metric"><span>下月預期</span><strong>${formatCurrency(expected.total)}</strong></div>
          <div class="metric"><span>尚未入帳</span><strong>${formatCurrency(expected.pending)}</strong></div>
        </div>
      </div>
    `
  );

  setHtml("#accountFolderList", renderAccountFolders());
  bindAccountFolderClicks();
  showView("home", {
    title: "資產資料夾",
    subtitle: "離線個人資產管理",
    showBack: false
  });
}

function renderAccountFolders() {
  if (!data.accounts.length) return `<div class="empty-state">還沒有帳戶，先新增一個資料夾吧</div>`;

  return data.accounts
    .map(
      (account) => `
        <button class="account-folder" type="button" data-account-id="${account.id}">
          <span class="account-folder-icon" aria-hidden="true">${ACCOUNT_ICONS[account.type] || ACCOUNT_ICONS.other}</span>
          <div>
            <h3>${escapeHtml(account.name)}</h3>
            <p>${ACCOUNT_TYPES[account.type] || "帳戶"}</p>
          </div>
          <strong>${formatCurrency(getAccountDisplayValue(account))}</strong>
        </button>
      `
    )
    .join("");
}

function bindAccountFolderClicks() {
  $$("[data-account-id]").forEach((button) => {
    button.addEventListener("click", () => renderAccountDetail(button.dataset.accountId));
  });
}

function bindGlobalEvents() {
  document.addEventListener("showView", (event) => {
    showView(event.detail.view, event.detail.options);
  });

  document.addEventListener("renderHome", renderHome);

  document.addEventListener("openAccountDetail", (event) => {
    renderAccountDetail(event.detail.accountId);
  });

  document.addEventListener("openTransactionForm", (event) => {
    openTransactionForm(event.detail.accountId, event.detail.type);
  });

  $("#backButton")?.addEventListener("click", () => {
    if (window.currentAccountId && currentView !== "account-detail") {
      renderAccountDetail(window.currentAccountId);
      return;
    }
    requestHome();
  });

  $$("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.nav === "home") renderHome();
      if (button.dataset.nav === "expected-income") renderExpectedIncomePage();
      if (button.dataset.nav === "settings") renderSettingsPage();
    });
  });

  $$("[data-back-account]").forEach((button) => {
    button.addEventListener("click", () => {
      if (window.currentAccountId) renderAccountDetail(window.currentAccountId);
      else renderHome();
    });
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./service-worker.js").catch((error) => {
    console.warn("Service worker registration failed", error);
  });
}

function init() {
  loadData();
  bindGlobalEvents();
  bindAccountForm();
  bindTransactionForm();
  bindStockForms();
  renderHome();
  registerServiceWorker();
}

init();
