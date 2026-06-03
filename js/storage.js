const STORAGE_KEY = "chargeAppData";
const ACTIVE_RECORD_SLOT_KEY = "chargeAppActiveRecordSlot";
const RECORD_SLOT_LABELS_KEY = "chargeAppRecordSlotLabels";
const RECORD_SLOT_PREFIX = "chargeAppRecordSlot:";
const DATA_VERSION = 1;

export const RECORD_SLOTS = [
  { id: "slot1", label: "紀錄檔 1" },
  { id: "slot2", label: "紀錄檔 2" }
];

const BASE_ACCOUNT_DEFINITIONS = [
  {
    id: "account_default_esun_bank",
    name: "玉山銀行",
    type: "bank"
  },
  {
    id: "account_default_fubon_bank",
    name: "富邦銀行",
    type: "bank"
  },
  {
    id: "account_default_linepay",
    name: "Line pay money",
    type: "linepay"
  },
  {
    id: "account_default_cash",
    name: "現金",
    type: "wallet"
  },
  {
    id: "account_default_fubon_stock",
    name: "富邦證卷",
    type: "stock"
  }
];

export let data = createDefaultData();
export let activeRecordSlotId = "slot1";

function normalizeAccountName(name) {
  return String(name || "").trim().toLowerCase();
}

function normalizeRecordSlotId(slotId) {
  return RECORD_SLOTS.some((slot) => slot.id === slotId) ? slotId : RECORD_SLOTS[0].id;
}

function getRecordSlotStorageKey(slotId) {
  return `${RECORD_SLOT_PREFIX}${normalizeRecordSlotId(slotId)}`;
}

function getRecordSlotLabel(slotId) {
  const normalizedSlotId = normalizeRecordSlotId(slotId);
  const labels = readRecordSlotLabels();
  const customLabel = String(labels[normalizedSlotId] || "").trim();
  if (customLabel) return customLabel;
  return RECORD_SLOTS.find((slot) => slot.id === normalizedSlotId)?.label || "紀錄檔";
}

function readRecordSlotLabels() {
  try {
    const stored = localStorage.getItem(RECORD_SLOT_LABELS_KEY);
    const labels = stored ? JSON.parse(stored) : {};
    return labels && typeof labels === "object" ? labels : {};
  } catch {
    return {};
  }
}

function saveRecordSlotLabels(labels) {
  localStorage.setItem(RECORD_SLOT_LABELS_KEY, JSON.stringify(labels));
}

function readStoredData(key) {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    return normalizeData(JSON.parse(stored));
  } catch {
    return null;
  }
}

function readRecordSlotData(slotId) {
  const normalizedSlotId = normalizeRecordSlotId(slotId);
  return readStoredData(getRecordSlotStorageKey(normalizedSlotId)) || (normalizedSlotId === "slot1" ? readStoredData(STORAGE_KEY) : null);
}

export function createDefaultAccounts() {
  const now = new Date().toISOString();
  return BASE_ACCOUNT_DEFINITIONS.map((account) => ({
      ...account,
      initialBalance: 0,
      note: "",
      createdAt: now,
      updatedAt: now
    }));
}

export function addMissingBaseAccounts() {
  const existingIds = new Set(data.accounts.map((account) => account.id));
  const existingNames = new Set(data.accounts.map((account) => normalizeAccountName(account.name)).filter(Boolean));
  const accountsToAdd = createDefaultAccounts().filter((account) => {
    return !existingIds.has(account.id) && !existingNames.has(normalizeAccountName(account.name));
  });

  if (accountsToAdd.length) {
    data.accounts.push(...accountsToAdd);
    saveData();
  }

  return {
    added: accountsToAdd.length,
    skipped: BASE_ACCOUNT_DEFINITIONS.length - accountsToAdd.length,
    accounts: accountsToAdd
  };
}

export function createDefaultData() {
  return {
    version: DATA_VERSION,
    accounts: createDefaultAccounts(),
    transactions: [],
    transactionCategories: [],
    stockTrades: [],
    stockPrices: [],
    cryptoTrades: [],
    cryptoPrices: [],
    expectedIncomes: [],
    settings: {
      currency: "TWD",
      hideAssetAmounts: false
    }
  };
}

function normalizeData(rawData) {
  const defaults = createDefaultData();
  if (!rawData || typeof rawData !== "object") return defaults;

  return {
    version: rawData.version || DATA_VERSION,
    accounts: Array.isArray(rawData.accounts) ? rawData.accounts : [],
    transactions: Array.isArray(rawData.transactions) ? rawData.transactions : [],
    transactionCategories: Array.isArray(rawData.transactionCategories) ? rawData.transactionCategories : [],
    stockTrades: Array.isArray(rawData.stockTrades) ? rawData.stockTrades : [],
    stockPrices: Array.isArray(rawData.stockPrices) ? rawData.stockPrices : [],
    cryptoTrades: Array.isArray(rawData.cryptoTrades) ? rawData.cryptoTrades : [],
    cryptoPrices: Array.isArray(rawData.cryptoPrices) ? rawData.cryptoPrices : [],
    expectedIncomes: Array.isArray(rawData.expectedIncomes) ? rawData.expectedIncomes : [],
    settings: {
      ...defaults.settings,
      ...(rawData.settings || {})
    }
  };
}

export function loadData() {
  try {
    activeRecordSlotId = normalizeRecordSlotId(localStorage.getItem(ACTIVE_RECORD_SLOT_KEY) || "slot1");
    data = readRecordSlotData(activeRecordSlotId) || createDefaultData();
    saveData();
  } catch {
    activeRecordSlotId = "slot1";
    data = createDefaultData();
    saveData();
  }
  return data;
}

export function saveData() {
  const payload = JSON.stringify(data);
  localStorage.setItem(ACTIVE_RECORD_SLOT_KEY, activeRecordSlotId);
  localStorage.setItem(getRecordSlotStorageKey(activeRecordSlotId), payload);
  if (activeRecordSlotId === "slot1") {
    localStorage.setItem(STORAGE_KEY, payload);
  }
}

export function replaceData(nextData) {
  data = normalizeData(nextData);
  saveData();
}

export function importDataToRecordSlot(slotId, nextData) {
  const normalizedSlotId = normalizeRecordSlotId(slotId);
  const normalizedData = normalizeData(nextData);
  const payload = JSON.stringify(normalizedData);
  localStorage.setItem(getRecordSlotStorageKey(normalizedSlotId), payload);
  if (normalizedSlotId === "slot1") {
    localStorage.setItem(STORAGE_KEY, payload);
  }
  if (normalizedSlotId === activeRecordSlotId) {
    data = normalizedData;
    saveData();
  }
  return {
    id: normalizedSlotId,
    label: getRecordSlotLabel(normalizedSlotId)
  };
}

export function clearData() {
  data = createDefaultData();
  saveData();
}

export function getActiveRecordSlot() {
  return {
    id: activeRecordSlotId,
    label: getRecordSlotLabel(activeRecordSlotId)
  };
}

export function getRecordSlotStatuses() {
  return RECORD_SLOTS.map((slot) => {
    const slotData = readRecordSlotData(slot.id);
    return {
      ...slot,
      label: getRecordSlotLabel(slot.id),
      isActive: slot.id === activeRecordSlotId,
      exists: Boolean(slotData),
      accountCount: slotData?.accounts?.length || 0,
      transactionCount: slotData?.transactions?.length || 0,
      stockTradeCount: slotData?.stockTrades?.length || 0,
      cryptoTradeCount: slotData?.cryptoTrades?.length || 0,
      expectedIncomeCount: slotData?.expectedIncomes?.length || 0
    };
  });
}

export function renameRecordSlot(slotId, label) {
  const normalizedSlotId = normalizeRecordSlotId(slotId);
  const trimmedLabel = String(label || "").trim();
  if (!trimmedLabel) throw new Error("請輸入紀錄檔名稱");
  const labels = readRecordSlotLabels();
  labels[normalizedSlotId] = trimmedLabel.slice(0, 24);
  saveRecordSlotLabels(labels);
  return {
    id: normalizedSlotId,
    label: getRecordSlotLabel(normalizedSlotId)
  };
}

export function switchRecordSlot(slotId) {
  saveData();
  activeRecordSlotId = normalizeRecordSlotId(slotId);
  localStorage.setItem(ACTIVE_RECORD_SLOT_KEY, activeRecordSlotId);
  data = readRecordSlotData(activeRecordSlotId) || createDefaultData();
  saveData();
  return getActiveRecordSlot();
}
