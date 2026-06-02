# 離線資產管理 Web App Implementation Plan

## 1. 目標

建立一個 iPhone 和 Android 都可以使用的離線 Web App，用來管理：

- 各銀行帳戶
- Line Pay Money
- 錢包
- 股票帳戶
- 下個月預期入帳金額

第一版只使用：

- HTML
- CSS
- JavaScript
- localStorage
- PWA manifest
- Service Worker

不使用：

- 後端
- React / Vue / Angular
- Node 打包工具
- 雲端同步
- 登入系統

## 2. 簡化架構原則

檔案不要拆太細。同一個主題放在同一個檔案裡，資料夾最多只保留一層。

例如：

- 帳戶相關：放 `js/accounts.js`
- 收入支出相關：放 `js/transactions.js`
- 股票相關：放 `js/stocks.js`
- 預期入帳相關：放 `js/expected-income.js`
- 設定與備份：放 `js/settings.js`

不要再拆成：

```text
features/accounts/accounts.logic.js
features/accounts/accounts.render.js
features/accounts/accounts.form.js
```

這樣對目前的小型 App 太複雜。

## 3. 目前檔案結構

```text
charge_app/
  index.html
  manifest.json
  service-worker.js
  dev-server.mjs
  implementation plan.md

  assets/
    icon.svg

  css/
    style.css

  js/
    app.js
    storage.js
    accounts.js
    transactions.js
    stocks.js
    expected-income.js
    settings.js
    utils.js
```

## 4. 檔案責任

### index.html

負責：

- App HTML 結構
- 各頁面 section
- 表單欄位
- 引入 CSS 與 JS

### css/style.css

負責所有樣式：

- 全域樣式
- App layout
- 首頁
- 帳戶卡片
- 表單
- 股票列表
- 預期入帳
- 設定頁
- 手機版 RWD

第一版只保留一個 CSS 檔，避免樣式分散。

### js/app.js

負責 App 主流程：

- 初始化資料
- 首頁渲染
- 頁面切換
- 底部導覽
- 返回按鈕
- 註冊 Service Worker
- 串接其他功能檔案

### js/storage.js

負責資料儲存：

- 建立預設資料
- 從 localStorage 讀取資料
- 儲存資料到 localStorage
- 匯入時覆蓋資料
- 清除資料

### js/accounts.js

負責帳戶：

- 新增帳戶
- 查找帳戶
- 計算一般帳戶餘額
- 計算現金類帳戶總額
- 渲染帳戶詳情
- 帳戶表單事件

帳戶類型：

- 銀行帳戶
- Line Pay Money
- 錢包
- 股票帳戶
- 其他

### js/transactions.js

負責一般帳戶收入與支出：

- 新增收入
- 新增支出
- 新增餘額調整
- 顯示交易紀錄
- 處理收支表單

### js/stocks.js

負責股票帳戶：

- 新增買入紀錄
- 新增賣出紀錄
- 新增每日市價
- 計算持股數
- 計算平均成本
- 計算總成本
- 取得最新市價
- 計算目前市值
- 計算未實現損益
- 計算報酬率
- 顯示股票帳戶詳情

### js/expected-income.js

負責下個月預期入帳：

- 新增預期入帳
- 標記已入帳 / 未入帳
- 刪除預期入帳
- 統計下個月預期總額
- 顯示預期入帳頁

### js/settings.js

負責設定與備份：

- 匯出 JSON
- 匯入 JSON
- 清除全部資料
- 顯示資料狀態

### js/utils.js

放共用工具：

- 帳戶類型文字
- 格式化金額
- 格式化百分比
- 日期工具
- HTML escape
- 表單驗證
- DOM helper
- 事件 helper

## 5. 資料結構

localStorage key：

```js
chargeAppData
```

資料格式：

```js
{
  version: 1,
  accounts: [],
  transactions: [],
  stockTrades: [],
  stockPrices: [],
  expectedIncomes: [],
  settings: {
    currency: "TWD"
  }
}
```

## 6. 主要資料模型

### Account

```js
{
  id: "account_001",
  name: "台新銀行",
  type: "bank",
  initialBalance: 10000,
  note: "",
  createdAt: "2026-06-02T00:00:00.000Z",
  updatedAt: "2026-06-02T00:00:00.000Z"
}
```

### Transaction

```js
{
  id: "txn_001",
  accountId: "account_001",
  type: "income",
  amount: 3000,
  category: "薪資",
  date: "2026-06-02",
  note: "",
  createdAt: "2026-06-02T00:00:00.000Z"
}
```

### StockTrade

```js
{
  id: "trade_001",
  accountId: "account_stock_001",
  symbol: "2330",
  name: "台積電",
  type: "buy",
  shares: 10,
  price: 800,
  fee: 20,
  tax: 0,
  date: "2026-06-02",
  createdAt: "2026-06-02T00:00:00.000Z"
}
```

### StockPrice

```js
{
  id: "price_001",
  accountId: "account_stock_001",
  symbol: "2330",
  price: 820,
  date: "2026-06-02",
  note: "",
  createdAt: "2026-06-02T00:00:00.000Z"
}
```

### ExpectedIncome

```js
{
  id: "income_001",
  name: "薪水",
  amount: 50000,
  expectedDate: "2026-07-05",
  received: false,
  note: "",
  createdAt: "2026-06-02T00:00:00.000Z"
}
```

## 7. 計算邏輯

### 一般帳戶餘額

```text
餘額 = 初始金額 + 收入總額 - 支出總額 + 調整總額
```

### 股票持股數

```text
持股數 = 買入股數總和 - 賣出股數總和
```

### 股票平均成本

```text
平均成本 = 目前總成本 / 目前持股數
```

### 股票市值

```text
股票市值 = 持股數 * 最新手動市價
```

如果沒有市價紀錄：

```text
最新市價 = 平均成本
```

### 股票未實現損益

```text
未實現損益 = 股票市值 - 總成本
```

### 股票報酬率

```text
報酬率 = 未實現損益 / 總成本 * 100
```

### 總資產

```text
總資產 = 一般帳戶餘額總和 + 股票帳戶市值總和
```

## 8. PWA 離線支援

`service-worker.js` 快取這些檔案：

```js
[
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/icon.svg",
  "./css/style.css",
  "./js/app.js",
  "./js/storage.js",
  "./js/accounts.js",
  "./js/transactions.js",
  "./js/stocks.js",
  "./js/expected-income.js",
  "./js/settings.js",
  "./js/utils.js"
]
```

之後如果新增檔案，要同步加入快取清單。

## 9. GitHub Pages 部署

需要上傳：

```text
index.html
manifest.json
service-worker.js
assets/
css/
js/
```

可選擇上傳：

```text
implementation plan.md
dev-server.mjs
```

不需要上傳沒有被 App 使用的圖片。

## 10. 本機預覽

在專案資料夾執行：

```powershell
cd C:\Users\Ben9\Desktop\charge_app
node dev-server.mjs
```

然後開：

```text
http://127.0.0.1:8000
```

## 11. 第一版暫時不做

為了保持簡單，第一版先不做：

- 自動抓股票價格
- 雲端同步
- 登入系統
- 多幣別
- 圖表分析
- 帳戶間轉帳
- 股利紀錄
- 複雜分類管理

