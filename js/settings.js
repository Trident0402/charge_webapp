import {
  addMissingBaseAccounts,
  clearData,
  data,
  getActiveRecordSlot,
  getRecordSlotStatuses,
  importDataToRecordSlot,
  renameRecordSlot,
  switchRecordSlot
} from "./storage.js";
import { exportCurrentMonthPdf } from "./pdf-export.js";
import { $, escapeHtml, requestHome, requestView, setHtml, showError } from "./utils.js";

const APP_VERSION = globalThis.CHARGE_APP_VERSION || "unknown";

export function renderSettingsPage() {
  setHtml(
    "#settingsPage",
    `
      <div class="panel">
        <h2 id="settingsTitle">設定與備份</h2>
        <div class="settings-actions">
          <button class="secondary-button" id="addBaseAccountsButton" type="button">新增基礎帳戶</button>
          <button class="secondary-button" id="exportMonthlyPdfButton" type="button">匯出當月 PDF</button>
          <button class="primary-button" id="exportBackupButton" type="button">匯出 JSON 備份</button>
          <label>
            匯入目標紀錄檔
            <select id="importRecordSlotId">
              ${renderImportRecordSlotOptions()}
            </select>
          </label>
          <label>
            匯入 JSON 備份
            <input class="file-input" id="importBackupInput" type="file" accept="application/json,.json" />
          </label>
          <button class="danger-button" id="clearDataButton" type="button">清除全部資料</button>
        </div>
      </div>
      ${renderRecordSlotPanel()}
      <div class="section-heading"><h2>資料狀態</h2></div>
      <div class="panel">
        <div class="metric-grid">
          <div class="metric"><span>App 版本</span><strong>${escapeHtml(APP_VERSION)}</strong></div>
          <div class="metric"><span>資料版本</span><strong>${data.version}</strong></div>
          <div class="metric"><span>貨幣</span><strong>${data.settings.currency}</strong></div>
          <div class="metric"><span>帳戶數</span><strong>${data.accounts.length}</strong></div>
          <div class="metric"><span>股票市價</span><strong>${data.stockPrices.length}</strong></div>
          <div class="metric"><span>幣價紀錄</span><strong>${data.cryptoPrices.length}</strong></div>
        </div>
      </div>
    `
  );

  bindSettingsEvents();
  requestView("settings", {
    title: "設定",
    subtitle: "備份與資料管理",
    showBack: false
  });
}

function renderRecordSlotPanel() {
  const activeSlot = getActiveRecordSlot();
  const slots = getRecordSlotStatuses();
  return `
    <div class="section-heading"><h2>紀錄檔切換</h2></div>
    <div class="panel record-slot-panel">
      <div class="record-slot-current">
        <span>目前使用</span>
        <strong>${escapeHtml(activeSlot.label)}</strong>
      </div>
      <div class="record-slot-list">
        ${slots
          .map(
            (slot) => `
              <article class="record-slot-card ${slot.isActive ? "is-active" : ""}">
                <div class="record-slot-header">
                  <div class="item-title">${escapeHtml(slot.label)}</div>
                  <button class="record-slot-rename-button" type="button" data-rename-record-slot="${slot.id}">重新命名</button>
                </div>
                <div>
                  <div class="item-meta">
                    ${slot.exists ? `帳戶 ${slot.accountCount} · 收支 ${slot.transactionCount} · 股票 ${slot.stockTradeCount} · 虛擬貨幣 ${slot.cryptoTradeCount}` : "尚未建立，切換後會建立基礎資料"}
                  </div>
                </div>
                <div class="record-slot-actions">
                  ${
                    slot.isActive
                      ? `<span class="received-badge">目前使用</span>`
                      : `<button class="secondary-button" type="button" data-switch-record-slot="${slot.id}">切換</button>`
                  }
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderImportRecordSlotOptions() {
  return getRecordSlotStatuses()
    .map((slot) => `<option value="${slot.id}" ${slot.isActive ? "selected" : ""}>${escapeHtml(slot.label)}</option>`)
    .join("");
}

function bindSettingsEvents() {
  $("#addBaseAccountsButton")?.addEventListener("click", () => {
    const result = addMissingBaseAccounts();
    alert(result.added ? `已新增 ${result.added} 個基礎帳戶，略過 ${result.skipped} 個已存在帳戶。` : "五個基礎帳戶都已存在，不需新增。");
    renderSettingsPage();
  });

  $("#exportBackupButton")?.addEventListener("click", exportBackup);
  $("#exportMonthlyPdfButton")?.addEventListener("click", () => {
    exportCurrentMonthPdf().catch(showError);
  });

  document.querySelectorAll("[data-rename-record-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = getRecordSlotStatuses().find((slot) => slot.id === button.dataset.renameRecordSlot);
      if (!target) return;
      const nextName = prompt(`請輸入「${target.label}」的新名稱`, target.label);
      if (nextName === null) return;
      try {
        const renamedSlot = renameRecordSlot(target.id, nextName);
        alert(`已重新命名為「${renamedSlot.label}」。`);
        renderSettingsPage();
      } catch (error) {
        showError(error);
      }
    });
  });

  document.querySelectorAll("[data-switch-record-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = getRecordSlotStatuses().find((slot) => slot.id === button.dataset.switchRecordSlot);
      if (!target) return;
      const message = target.exists
        ? `要切換到「${target.label}」嗎？目前紀錄檔會先保存，再載入「${target.label}」。`
        : `「${target.label}」尚未建立。要切換並建立一份新的基礎資料嗎？目前紀錄檔會先保存。`;
      if (!confirm(message)) return;
      const activeSlot = switchRecordSlot(target.id);
      alert(`已切換到「${activeSlot.label}」。`);
      renderSettingsPage();
    });
  });

  $("#importBackupInput")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const activeSlot = getActiveRecordSlot();
    const targetSlot = getRecordSlotStatuses().find((slot) => slot.id === $("#importRecordSlotId")?.value) || activeSlot;
    if (
      !confirm(
        `目前正在使用「${activeSlot.label}」。\n\n匯入會覆蓋「${targetSlot.label}」資料。\n\n「${targetSlot.label}」原本的資料會消失，確定繼續？`
      )
    ) {
      event.target.value = "";
      return;
    }
    try {
      const importedData = await readJsonFile(file);
      if (!Array.isArray(importedData.accounts) || !Array.isArray(importedData.transactions)) {
        throw new Error("備份檔格式不正確");
      }
      const importedSlot = importDataToRecordSlot(targetSlot.id, importedData);
      alert(`已匯入並覆蓋「${importedSlot.label}」。`);
      if (importedSlot.id === activeSlot.id) requestHome();
      else renderSettingsPage();
    } catch (error) {
      showError(error);
    } finally {
      event.target.value = "";
    }
  });

  $("#clearDataButton")?.addEventListener("click", () => {
    const activeSlot = getActiveRecordSlot();
    if (!confirm(`確定要清除目前使用的「${activeSlot.label}」全部資料？這個動作無法復原。`)) return;
    clearData();
    requestHome();
  });
}

function exportBackup() {
  const date = new Date().toISOString().slice(0, 10);
  const activeSlot = getActiveRecordSlot();
  const safeSlotLabel = activeSlot.label.replace(/[\\/:*?"<>|]/g, "-").trim() || "紀錄檔";
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `charge-app-${safeSlotLabel}-${date}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error("讀取檔案失敗"));
    reader.readAsText(file);
  });
}
