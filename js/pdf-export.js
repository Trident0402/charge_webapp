import { prepareCurrentMonthPdfData } from "./pdf-report-data.js";
import { amountClass, escapeHtml, formatCurrency, formatNumber, formatPercent } from "./utils.js";

let activePdfRoot = null;

function formatDateTime(value) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function formatSignedCurrency(value) {
  const amount = Number(value) || 0;
  return `${amount > 0 ? "+" : ""}${formatCurrency(amount)}`;
}

function renderMetric(label, value, className = "") {
  return `
    <div class="pdf-metric">
      <span>${escapeHtml(label)}</span>
      <strong class="${className}">${value}</strong>
    </div>
  `;
}

function renderPage(title, subtitle, body) {
  return `
    <section class="pdf-page">
      <header class="pdf-page-header">
        <div>
          <p>Charge App</p>
          <h1>${escapeHtml(title)}</h1>
        </div>
        <span>${escapeHtml(subtitle)}</span>
      </header>
      <main class="pdf-page-body">
        ${body}
      </main>
      <footer class="pdf-page-footer"></footer>
    </section>
  `;
}

function renderOverviewPage(report) {
  const { summary } = report;
  return renderPage(
    "當月數據總覽",
    report.rangeLabel,
    `
      <section class="pdf-hero">
        <div>
          <span>當月底淨資產</span>
          <strong class="${amountClass(summary.netWorth)}">${formatCurrency(summary.netWorth)}</strong>
        </div>
        <dl>
          <div><dt>紀錄檔</dt><dd>${escapeHtml(report.recordSlot.label)}</dd></div>
          <div><dt>產生時間</dt><dd>${escapeHtml(formatDateTime(report.generatedAt))}</dd></div>
          <div><dt>App 版本</dt><dd>${escapeHtml(report.appVersion)}</dd></div>
        </dl>
      </section>

      <section class="pdf-section">
        <h2>本月摘要</h2>
        <div class="pdf-metric-grid">
          ${renderMetric("本月收入", formatCurrency(summary.totalIncome), "amount-positive")}
          ${renderMetric("本月支出", formatCurrency(summary.totalExpense), "amount-negative")}
          ${renderMetric("日常損益", formatSignedCurrency(summary.dailyNet), amountClass(summary.dailyNet))}
          ${renderMetric("股票已實現", formatSignedCurrency(summary.stockRealized), amountClass(summary.stockRealized))}
          ${renderMetric("虛擬貨幣已實現", formatSignedCurrency(summary.cryptoRealized), amountClass(summary.cryptoRealized))}
          ${renderMetric("總損益", formatSignedCurrency(summary.totalProfit), amountClass(summary.totalProfit))}
        </div>
      </section>

      <section class="pdf-section">
        <h2>資產與預期收支</h2>
        <div class="pdf-metric-grid">
          ${renderMetric("當月底總資產", formatCurrency(summary.totalAssets))}
          ${renderMetric("當月底總負債", formatCurrency(summary.totalLiabilities), "pdf-debt")}
          ${renderMetric("預期收入", formatCurrency(summary.expectedIncomeTotal), "amount-positive")}
          ${renderMetric("預期支出", formatCurrency(summary.expectedExpenseTotal), "amount-negative")}
        </div>
      </section>
    `
  );
}

function renderOverviewSection(report) {
  const { summary } = report;
  return `
    <section class="pdf-hero pdf-compact-hero">
      <div>
        <span>當月底淨資產</span>
        <strong class="${amountClass(summary.netWorth)}">${formatCurrency(summary.netWorth)}</strong>
      </div>
      <dl>
        <div><dt>紀錄檔</dt><dd>${escapeHtml(report.recordSlot.label)}</dd></div>
        <div><dt>產生時間</dt><dd>${escapeHtml(formatDateTime(report.generatedAt))}</dd></div>
        <div><dt>App 版本</dt><dd>${escapeHtml(report.appVersion)}</dd></div>
      </dl>
    </section>

    <section class="pdf-section">
      <h2>本月摘要</h2>
      <div class="pdf-metric-grid pdf-compact-metric-grid">
        ${renderMetric("收入", formatCurrency(summary.totalIncome), "amount-positive")}
        ${renderMetric("支出", formatCurrency(summary.totalExpense), "amount-negative")}
        ${renderMetric("日常損益", formatSignedCurrency(summary.dailyNet), amountClass(summary.dailyNet))}
        ${renderMetric("股票已實現", formatSignedCurrency(summary.stockRealized), amountClass(summary.stockRealized))}
        ${renderMetric("虛擬貨幣已實現", formatSignedCurrency(summary.cryptoRealized), amountClass(summary.cryptoRealized))}
        ${renderMetric("總損益", formatSignedCurrency(summary.totalProfit), amountClass(summary.totalProfit))}
        ${renderMetric("總資產", formatCurrency(summary.totalAssets))}
        ${renderMetric("總負債", formatCurrency(summary.totalLiabilities), "pdf-debt")}
        ${renderMetric("預期收支", `${formatCurrency(summary.expectedIncomeTotal)} / ${formatCurrency(summary.expectedExpenseTotal)}`)}
      </div>
    </section>
  `;
}

function renderCategoryTable(title, rows, total) {
  return `
    <section class="pdf-section">
      <h2>${escapeHtml(title)}</h2>
      ${
        rows.length
          ? `
            <table class="pdf-table">
              <thead>
                <tr><th>分類</th><th>金額</th><th>占比</th></tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    (row) => `
                      <tr>
                        <td>${escapeHtml(row.name)}</td>
                        <td>${formatCurrency(row.amount)}</td>
                        <td>${formatPercent(row.percent)}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
              <tfoot>
                <tr><td>合計</td><td>${formatCurrency(total)}</td><td>100%</td></tr>
              </tfoot>
            </table>
          `
          : `<p class="pdf-empty">本月沒有${escapeHtml(title)}資料。</p>`
      }
    </section>
  `;
}

function renderCategoriesPage(report) {
  return renderPage(
    "分類統計",
    report.monthLabel,
    `
      <div class="pdf-two-column">
        ${renderCategoryTable("收入分類", report.incomeCategories, report.summary.totalIncome)}
        ${renderCategoryTable("支出分類", report.expenseCategories, report.summary.totalExpense)}
      </div>
    `
  );
}

function renderDailyPage(report) {
  const activeRows = report.dailyRows.filter((row) => row.income || row.expense || row.stockRealized || row.cryptoRealized);
  return renderPage(
    "每日摘要",
    report.monthLabel,
    `
      ${
        activeRows.length
          ? `
            <table class="pdf-table pdf-daily-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>收入</th>
                  <th>支出</th>
                  <th>日常損益</th>
                  <th>股票損益</th>
                  <th>虛擬貨幣損益</th>
                  <th>總損益</th>
                </tr>
              </thead>
              <tbody>
                ${activeRows
                  .map(
                    (row) => `
                      <tr>
                        <td>${escapeHtml(row.date)}</td>
                        <td>${formatCurrency(row.income)}</td>
                        <td>${formatCurrency(row.expense)}</td>
                        <td class="${amountClass(row.dailyNet)}">${formatSignedCurrency(row.dailyNet)}</td>
                        <td class="${amountClass(row.stockRealized)}">${formatSignedCurrency(row.stockRealized)}</td>
                        <td class="${amountClass(row.cryptoRealized)}">${formatSignedCurrency(row.cryptoRealized)}</td>
                        <td class="${amountClass(row.totalProfit)}">${formatSignedCurrency(row.totalProfit)}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          `
          : `<p class="pdf-empty">本月沒有每日收支或投資損益紀錄。</p>`
      }
    `
  );
}

function renderDailySection(report) {
  const activeRows = report.dailyRows.filter((row) => row.income || row.expense || row.stockRealized || row.cryptoRealized);
  return `
    <section class="pdf-section">
      <h2>每日摘要</h2>
      ${
        activeRows.length
          ? `
            <table class="pdf-table pdf-daily-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>收入</th>
                  <th>支出</th>
                  <th>日常</th>
                  <th>股票</th>
                  <th>虛擬</th>
                  <th>總損益</th>
                </tr>
              </thead>
              <tbody>
                ${activeRows
                  .map(
                    (row) => `
                      <tr>
                        <td>${escapeHtml(row.date.slice(5))}</td>
                        <td>${formatCurrency(row.income)}</td>
                        <td>${formatCurrency(row.expense)}</td>
                        <td class="${amountClass(row.dailyNet)}">${formatSignedCurrency(row.dailyNet)}</td>
                        <td class="${amountClass(row.stockRealized)}">${formatSignedCurrency(row.stockRealized)}</td>
                        <td class="${amountClass(row.cryptoRealized)}">${formatSignedCurrency(row.cryptoRealized)}</td>
                        <td class="${amountClass(row.totalProfit)}">${formatSignedCurrency(row.totalProfit)}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          `
          : `<p class="pdf-empty">本月沒有每日收支或投資損益紀錄。</p>`
      }
    </section>
  `;
}

function renderAccountSnapshotsPage(report) {
  const monthHeaders = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);
  return renderPage(
    "各帳戶年度月末累計金額",
    `${report.year} 年度`,
    `
      <p class="pdf-note">每格為該月份最後一天的累計金額。股票與虛擬貨幣以月底市值計算；負債帳戶以月底剩餘借款總額計算。</p>
      <table class="pdf-table pdf-account-table">
        <thead>
          <tr>
            <th>帳戶</th>
            <th>類別</th>
            ${monthHeaders.map((month) => `<th>${month}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${report.accountMonthlySnapshots
            .map(
              (account) => `
                <tr>
                  <td>${escapeHtml(account.accountName)}</td>
                  <td>${escapeHtml(account.accountTypeLabel)}</td>
                  ${account.values.map((item) => `<td>${formatCurrency(item.value)}</td>`).join("")}
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    `
  );
}

function renderAccountSnapshotsSection(report) {
  const monthHeaders = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);
  return `
    <section class="pdf-section">
      <h2>各帳戶年度月末累計金額</h2>
      <p class="pdf-note">每格為該月份最後一天的累計金額；股票與虛擬貨幣以月底市值計算，負債以剩餘借款總額計算。</p>
      <table class="pdf-table pdf-account-table">
        <thead>
          <tr>
            <th>帳戶</th>
            <th>類別</th>
            ${monthHeaders.map((month) => `<th>${month}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${report.accountMonthlySnapshots
            .map(
              (account) => `
                <tr>
                  <td>${escapeHtml(account.accountName)}</td>
                  <td>${escapeHtml(account.accountTypeLabel)}</td>
                  ${account.values.map((item) => `<td>${formatCurrency(item.value)}</td>`).join("")}
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </section>
  `;
}

function renderTransactionsPage(report) {
  return renderPage(
    "當月交易明細",
    report.monthLabel,
    `
      ${
        report.transactionRows.length
          ? `
            <table class="pdf-table pdf-transaction-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>帳戶</th>
                  <th>類型</th>
                  <th>分類</th>
                  <th>備註</th>
                  <th>金額</th>
                </tr>
              </thead>
              <tbody>
                ${report.transactionRows
                  .map(
                    (row) => `
                      <tr>
                        <td>${escapeHtml(row.date)}</td>
                        <td>${escapeHtml(row.accountName)}</td>
                        <td>${escapeHtml(row.typeLabel)}</td>
                        <td>${escapeHtml(row.category)}</td>
                        <td>${escapeHtml(row.note)}</td>
                        <td class="${row.type === "expense" ? "amount-negative" : "amount-positive"}">${formatCurrency(row.amount)}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          `
          : `<p class="pdf-empty">本月沒有收入或支出交易明細。</p>`
      }
    `
  );
}

function renderTransactionsSection(report) {
  return `
    <section class="pdf-section">
      <h2>當月交易明細</h2>
      ${
        report.transactionRows.length
          ? `
            <table class="pdf-table pdf-transaction-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>帳戶</th>
                  <th>類型</th>
                  <th>分類</th>
                  <th>備註</th>
                  <th>金額</th>
                </tr>
              </thead>
              <tbody>
                ${report.transactionRows
                  .map(
                    (row) => `
                      <tr>
                        <td>${escapeHtml(row.date.slice(5))}</td>
                        <td>${escapeHtml(row.accountName)}</td>
                        <td>${escapeHtml(row.typeLabel)}</td>
                        <td>${escapeHtml(row.category)}</td>
                        <td>${escapeHtml(row.note)}</td>
                        <td class="${row.type === "expense" ? "amount-negative" : "amount-positive"}">${formatCurrency(row.amount)}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          `
          : `<p class="pdf-empty">本月沒有收入或支出交易明細。</p>`
      }
    </section>
  `;
}

function expectedRowTitle(row) {
  return row.title || row.name || row.source || row.note || "未命名";
}

function renderExpectedList(title, rows, total, doneLabel) {
  return `
    <section class="pdf-section">
      <h2>${escapeHtml(title)}</h2>
      <div class="pdf-expected-total">${formatCurrency(total)}</div>
      ${
        rows.length
          ? `
            <table class="pdf-table">
              <thead>
                <tr><th>日期</th><th>項目</th><th>備註</th><th>狀態</th><th>金額</th></tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    (row) => `
                      <tr>
                        <td>${escapeHtml(row.expectedDate || "")}</td>
                        <td>${escapeHtml(expectedRowTitle(row))}</td>
                        <td>${escapeHtml(row.note || "")}</td>
                        <td>${row.received || row.paid ? escapeHtml(doneLabel) : "未完成"}</td>
                        <td>${formatCurrency(row.amount)}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          `
          : `<p class="pdf-empty">本月沒有${escapeHtml(title)}資料。</p>`
      }
    </section>
  `;
}

function renderExpectedPage(report) {
  return renderPage(
    "預期收支清單",
    report.monthLabel,
    `
      <div class="pdf-two-column">
        ${renderExpectedList("預期收入", report.expectedIncomes, report.summary.expectedIncomeTotal, "已入帳")}
        ${renderExpectedList("預期支出", report.expectedExpenses, report.summary.expectedExpenseTotal, "已支出")}
      </div>
    `
  );
}

function renderExpectedSection(report) {
  return `
    <section class="pdf-section">
      <h2>預期收支清單</h2>
      <div class="pdf-two-column pdf-nested-columns">
        ${renderExpectedList("預期收入", report.expectedIncomes, report.summary.expectedIncomeTotal, "已入帳")}
        ${renderExpectedList("預期支出", report.expectedExpenses, report.summary.expectedExpenseTotal, "已支出")}
      </div>
    </section>
  `;
}

function renderPdfDocument(report) {
  return [
    renderPage(
      "當月 PDF 報表",
      report.rangeLabel,
      `
        <div class="pdf-compact-page">
          ${renderOverviewSection(report)}
          <div class="pdf-two-column pdf-tight-columns">
            ${renderCategoryTable("收入分類", report.incomeCategories, report.summary.totalIncome)}
            ${renderCategoryTable("支出分類", report.expenseCategories, report.summary.totalExpense)}
          </div>
          ${renderDailySection(report)}
        </div>
      `
    ),
    renderPage(
      "年度帳戶與明細",
      `${report.year} 年度 · ${report.monthLabel}`,
      `
        <div class="pdf-compact-page">
          ${renderAccountSnapshotsSection(report)}
          <div class="pdf-two-column pdf-tight-columns pdf-detail-columns">
            ${renderTransactionsSection(report)}
            ${renderExpectedSection(report)}
          </div>
        </div>
      `
    )
  ].join("");
}

function updatePageNumbers(root) {
  const pages = Array.from(root.querySelectorAll(".pdf-page"));
  pages.forEach((page, index) => {
    const footer = page.querySelector(".pdf-page-footer");
    if (footer) footer.textContent = `第 ${formatNumber(index + 1, 0)} / ${formatNumber(pages.length, 0)} 頁`;
  });
}

function cleanupPdfRoot() {
  activePdfRoot?.remove();
  activePdfRoot = null;
  window.removeEventListener("afterprint", cleanupPdfRoot);
}

export async function exportCurrentMonthPdf() {
  cleanupPdfRoot();
  const report = prepareCurrentMonthPdfData();
  const root = document.createElement("div");
  root.id = "pdfExportRoot";
  root.innerHTML = renderPdfDocument(report);
  document.body.appendChild(root);
  updatePageNumbers(root);
  activePdfRoot = root;

  alert("當月 PDF 報表已準備好。接下來請在列印視窗選擇「儲存為 PDF」或分享 PDF。");
  window.addEventListener("afterprint", cleanupPdfRoot, { once: true });
  window.setTimeout(() => {
    window.print();
    window.setTimeout(cleanupPdfRoot, 60000);
  }, 80);
}
