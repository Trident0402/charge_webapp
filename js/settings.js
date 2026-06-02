import { addMissingBaseAccounts, clearData, data, replaceData } from "./storage.js";
import { $, requestHome, requestView, setHtml, showError } from "./utils.js";

export function renderSettingsPage() {
  setHtml(
    "#settingsPage",
    `
      <div class="panel">
        <h2 id="settingsTitle">設定與備份</h2>
        <div class="settings-actions">
          <button class="secondary-button" id="addBaseAccountsButton" type="button">新增基礎帳戶</button>
          <button class="primary-button" id="exportBackupButton" type="button">匯出 JSON 備份</button>
          <label>
            匯入 JSON 備份
            <input class="file-input" id="importBackupInput" type="file" accept="application/json,.json" />
          </label>
          <button class="danger-button" id="clearDataButton" type="button">清除全部資料</button>
        </div>
      </div>
      <div class="section-heading"><h2>資料狀態</h2></div>
      <div class="panel">
        <div class="metric-grid">
          <div class="metric"><span>資料版本</span><strong>${data.version}</strong></div>
          <div class="metric"><span>貨幣</span><strong>${data.settings.currency}</strong></div>
          <div class="metric"><span>帳戶數</span><strong>${data.accounts.length}</strong></div>
          <div class="metric"><span>股票市價</span><strong>${data.stockPrices.length}</strong></div>
        </div>
      </div>
    `
  );

  bindSettingsEvents();
  requestView("settings", {
    title: "設定",
    subtitle: "備份與資料管理",
    showBack: true
  });
}

function bindSettingsEvents() {
  $("#addBaseAccountsButton")?.addEventListener("click", () => {
    const result = addMissingBaseAccounts();
    alert(result.added ? `已新增 ${result.added} 個基礎帳戶，略過 ${result.skipped} 個已存在帳戶。` : "五個基礎帳戶都已存在，不需新增。");
    renderSettingsPage();
  });

  $("#exportBackupButton")?.addEventListener("click", exportBackup);

  $("#importBackupInput")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!confirm("匯入會覆蓋目前資料，確定繼續？")) return;
    try {
      const importedData = await readJsonFile(file);
      if (!Array.isArray(importedData.accounts) || !Array.isArray(importedData.transactions)) {
        throw new Error("備份檔格式不正確");
      }
      replaceData(importedData);
      alert("匯入完成");
      requestHome();
    } catch (error) {
      showError(error);
    }
  });

  $("#clearDataButton")?.addEventListener("click", () => {
    if (!confirm("確定要清除全部資料？這個動作無法復原。")) return;
    clearData();
    requestHome();
  });
}

function exportBackup() {
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `charge-app-backup-${date}.json`;
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
