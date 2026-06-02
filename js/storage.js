const STORAGE_KEY = "chargeAppData";
const DATA_VERSION = 1;

export let data = createDefaultData();

export function createDefaultData() {
  return {
    version: DATA_VERSION,
    accounts: [],
    transactions: [],
    stockTrades: [],
    stockPrices: [],
    expectedIncomes: [],
    settings: {
      currency: "TWD"
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
    stockTrades: Array.isArray(rawData.stockTrades) ? rawData.stockTrades : [],
    stockPrices: Array.isArray(rawData.stockPrices) ? rawData.stockPrices : [],
    expectedIncomes: Array.isArray(rawData.expectedIncomes) ? rawData.expectedIncomes : [],
    settings: {
      ...defaults.settings,
      ...(rawData.settings || {})
    }
  };
}

export function loadData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    data = normalizeData(stored ? JSON.parse(stored) : null);
  } catch {
    data = createDefaultData();
  }
  return data;
}

export function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function replaceData(nextData) {
  data = normalizeData(nextData);
  saveData();
}

export function clearData() {
  data = createDefaultData();
  saveData();
}
