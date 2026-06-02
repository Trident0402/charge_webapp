const STORAGE_KEY = "chargeAppData";
const DATA_VERSION = 1;

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

function normalizeAccountName(name) {
  return String(name || "").trim().toLowerCase();
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
