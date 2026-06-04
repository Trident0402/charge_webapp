import {
  getAccountDisplayValue,
  getCashAccountTotal,
  getLiabilityAccountSummary,
  getLiabilityAccountsSummary,
  getLiabilityAccountTotal,
  renderAccountDetail,
  bindAccountForm
} from "./accounts.js";
import { renderExpectedIncomePage, getExpectedIncomeSummary } from "./expected-income.js";
import { renderMonthlyReportPage } from "./monthly-report.js";
import { renderSettingsPage } from "./settings.js";
import { getAllCryptoMarketValue, bindCryptoForms } from "./crypto.js";
import { getAllStockMarketValue } from "./stocks.js";
import { bindStockForms } from "./stocks.js";
import { bindTransactionForms, openTransactionForm, openTransferForm } from "./transactions.js";
import { data, loadData, saveData } from "./storage.js";
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
let activeAccountType = "overview";
let homeMode = "assets";

const ACCOUNT_OVERVIEW_TYPE = "overview";
const ACCOUNT_TYPE_ORDER = ["bank", "linepay", "wallet", "stock", "crypto", "liability", "other"];
const HOME_LONG_PRESS_MS = 3000;

function showView(view, options = {}) {
  $$(".view").forEach((element) => element.classList.remove("is-active"));
  $(`#view-${view}`)?.classList.add("is-active");

  currentView = view;
  $("#appTitle").textContent = options.title || "資產總覽";
  $("#appSubtitle").textContent = options.subtitle || "離線資產管理";
  $("#backButton").classList.toggle("is-hidden", !options.showBack);

  $$(".bottom-nav button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.nav === view);
  });
}

function renderHome() {
  window.currentAccountId = null;
  window.currentHomeMode = homeMode;
  const cashTotal = getCashAccountTotal();
  const stockTotal = getAllStockMarketValue();
  const cryptoTotal = getAllCryptoMarketValue();
  const liabilityTotal = getLiabilityAccountTotal();
  const liabilityAccounts = data.accounts.filter((account) => account.type === "liability");
  const liabilitySummary = getLiabilityAccountsSummary();
  const expected = getExpectedIncomeSummary();
  const hideAmounts = Boolean(data.settings.hideAssetAmounts);
  const money = (value) => (hideAmounts ? "***" : formatCurrency(value));
  const isLiabilityMode = homeMode === "liabilities";
  const homeTitle = isLiabilityMode ? "總負債" : "總資產";
  const sectionTitle = isLiabilityMode ? "負債帳戶" : "資產帳戶";
  const mainTotal = isLiabilityMode ? liabilityTotal : cashTotal + stockTotal + cryptoTotal;
  const metrics = isLiabilityMode
    ? [
        { label: "未還負債", value: liabilityTotal },
        { label: "借款總額", value: liabilitySummary.borrowedTotal },
        { label: "已還款", value: liabilitySummary.paidAmount },
        { label: "負債帳戶", value: `${liabilityAccounts.length} 個`, raw: true }
      ]
    : [
        { label: "現金類", value: cashTotal },
        { label: "股票市值", value: stockTotal },
        { label: "虛擬貨幣", value: cryptoTotal },
        { label: "預期入帳總額", value: expected.total }
      ];

  setHtml(
    "#homeSummary",
    `
      <div class="home-summary-card ${isLiabilityMode ? "is-liability" : ""}">
        <div class="home-total-row">
          <div>
            <span>${homeTitle}</span>
            <strong>${money(mainTotal)}</strong>
          </div>
          <button class="visibility-button" id="toggleAssetVisibilityButton" type="button" aria-label="${hideAmounts ? "顯示資產金額" : "隱藏資產金額"}">
            <span class="eye-icon ${hideAmounts ? "is-closed" : ""}" aria-hidden="true"></span>
          </button>
        </div>
        <div class="home-metric-grid">
          ${metrics
            .map(
              (metric) => `
                <div class="mini-metric">
                  <span>${metric.label}</span>
                  <strong>${metric.raw ? metric.value : money(metric.value)}</strong>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    `
  );

  $("#toggleAssetVisibilityButton")?.addEventListener("click", () => {
    data.settings.hideAssetAmounts = !data.settings.hideAssetAmounts;
    saveData();
    renderHome();
  });
  bindHomeSummaryLongPress();

  $("#accountSectionTitle").textContent = sectionTitle;
  $("#openAccountFormButton").textContent = isLiabilityMode ? "新增負債帳戶" : "新增帳戶";
  $("#view-home")?.classList.toggle("is-liability-mode", isLiabilityMode);
  setHtml("#accountFolderList", renderAccountFolders());
  bindAccountTypeTabs();
  bindAccountFolderClicks();
  showView("home", {
    title: isLiabilityMode ? "負債總覽" : "資產總覽",
    subtitle: isLiabilityMode ? "長按切回資產總覽" : "長按查看總負債",
    showBack: false
  });
}

function renderAccountFolders() {
  const scopedAccounts = getHomeModeAccounts();
  if (!scopedAccounts.length) {
    return homeMode === "liabilities"
      ? `<div class="empty-state">還沒有負債帳戶，先新增一個負債帳戶吧</div>`
      : `<div class="empty-state">還沒有帳戶，先新增一個資產帳戶吧</div>`;
  }

  const accountTypes = getExistingAccountTypes();
  if (activeAccountType !== ACCOUNT_OVERVIEW_TYPE && !accountTypes.includes(activeAccountType)) {
    activeAccountType = ACCOUNT_OVERVIEW_TYPE;
  }
  const visibleAccounts =
    activeAccountType === ACCOUNT_OVERVIEW_TYPE ? scopedAccounts : scopedAccounts.filter((account) => account.type === activeAccountType);

  return `
    ${renderAccountTypeTabs([ACCOUNT_OVERVIEW_TYPE, ...accountTypes])}
    <div class="account-card-grid">
      ${visibleAccounts.map(renderAccountCard).join("")}
    </div>
  `;
}

function getHomeModeAccounts() {
  return data.accounts.filter((account) => {
    const isLiability = account.type === "liability";
    return homeMode === "liabilities" ? isLiability : !isLiability;
  });
}

function getExistingAccountTypes() {
  const types = new Set(getHomeModeAccounts().map((account) => account.type || "other"));
  return ACCOUNT_TYPE_ORDER.filter((type) => types.has(type)).concat(
    Array.from(types)
      .filter((type) => !ACCOUNT_TYPE_ORDER.includes(type))
      .sort()
  );
}

function renderAccountTypeTabs(accountTypes) {
  const label = homeMode === "liabilities" ? "負債帳戶類別" : "資產帳戶類別";
  return `
    <div class="account-type-tabs" aria-label="${label}">
      ${accountTypes
        .map(
          (type) => `
            <button class="${type === activeAccountType ? "is-active" : ""}" type="button" data-account-type-tab="${escapeHtml(type)}">
              ${escapeHtml(type === ACCOUNT_OVERVIEW_TYPE ? "總覽" : ACCOUNT_TYPES[type] || "其他")}
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function bindHomeSummaryLongPress() {
  const summaryCard = $("#homeSummary .home-summary-card");
  if (!summaryCard) return;
  let timerId = 0;

  const clearTimer = () => {
    if (!timerId) return;
    window.clearTimeout(timerId);
    timerId = 0;
  };

  const startTimer = (event) => {
    if (event.target.closest("button")) return;
    clearTimer();
    timerId = window.setTimeout(() => {
      homeMode = homeMode === "assets" ? "liabilities" : "assets";
      activeAccountType = ACCOUNT_OVERVIEW_TYPE;
      renderHome();
    }, HOME_LONG_PRESS_MS);
  };

  summaryCard.addEventListener("pointerdown", startTimer);
  summaryCard.addEventListener("pointerup", clearTimer);
  summaryCard.addEventListener("pointerleave", clearTimer);
  summaryCard.addEventListener("pointercancel", clearTimer);
  summaryCard.addEventListener("contextmenu", (event) => event.preventDefault());
}

function renderAccountCard(account) {
  const iconSrc = ACCOUNT_ICONS[account.type] || ACCOUNT_ICONS.other;
  const isLiability = account.type === "liability";
  const liabilitySummary = isLiability ? getLiabilityAccountSummary(account) : null;
  return `
    <button class="account-card" type="button" data-account-id="${account.id}">
      <span class="account-card-icon" aria-hidden="true">
        <img src="${iconSrc}" alt="" />
      </span>
      <div>
        <h3>${escapeHtml(account.name)}</h3>
        <p>${ACCOUNT_TYPES[account.type] || "帳戶"}</p>
      </div>
      ${
        isLiability
          ? `
            <div class="account-card-debt">
              <span>借款總額 <strong>${formatCurrency(liabilitySummary.borrowedTotal)}</strong></span>
              <span>已還款 <strong>${formatCurrency(liabilitySummary.paidAmount)}</strong></span>
            </div>
          `
          : `<strong class="account-card-amount">${formatCurrency(getAccountDisplayValue(account))}</strong>`
      }
    </button>
  `;
}

function bindAccountTypeTabs() {
  $$("[data-account-type-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeAccountType = button.dataset.accountTypeTab;
      setHtml("#accountFolderList", renderAccountFolders());
      bindAccountTypeTabs();
      bindAccountFolderClicks();
    });
  });
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

  document.addEventListener("openTransferForm", (event) => {
    openTransferForm(event.detail.accountId);
  });

  $("#backButton")?.addEventListener("click", () => {
    if (currentView === "expected-income" && document.body.dataset.expectedIncomeMode === "form") {
      renderExpectedIncomePage();
      return;
    }
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
      if (button.dataset.nav === "monthly-report") renderMonthlyReportPage();
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
  bindTransactionForms();
  bindStockForms();
  bindCryptoForms();
  renderHome();
  registerServiceWorker();
}

init();
