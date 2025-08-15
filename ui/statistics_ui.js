// ui/statistics_ui.js
import { initDatabase } from '../js/db.js';
import {
  getDashboardKPIs,
  getSalesDataForChart,
  getProfitMarginData,
  getTopSellingProducts
} from '../js/statistics.js';
import { countBorrowers } from '../js/borrowers.js';

let salesProfitChart = null;
let currentDuration = '7'; // default: last 7 days
let currentAccuracy = 'auto'; // default: let system decide

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initDatabase();
    await setupDashboard();
  } catch (err) {
    console.error("Failed to initialize dashboard:", err);
    
    // Find a safe place to show the error
    const container = document.querySelector('main') || document.body;
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'padding:20px;color:red;text-align:center;';
    errorDiv.innerHTML = '<h2>⚠ Error loading dashboard. Please refresh.</h2>';
    container.appendChild(errorDiv);
  }
});

async function setupDashboard() {
  await renderKPIs();
  await renderAllCharts(); // initial
  setupEventListeners();
  autoFillCustomDates();
}

async function renderKPIs() {
  const kpis = await getDashboardKPIs();
  const container = document.getElementById('kpi-cards');
  const borrowerCount=countBorrowers()
  container.innerHTML = `
    <div class="stat-card">
      <h3>Total Sales</h3>
      <p class="value">${Number(kpis.totalSales).toFixed(2)} DA</p>
      <p class="subtitle">Across ${kpis.totalOrders} orders</p>
    </div>
    <div class="stat-card">
      <h3>Total Profit</h3>
      <p class="value" style="color: #28a745;">${Number(kpis.totalProfit).toFixed(2)} DA</p>
      <p class="subtitle">All-time net profit</p>
    </div>
    <div class="stat-card">
      <h3>Outstanding Debt</h3>
      <p class="value" style="color: #dc3545;">${Number(kpis.totalDebt).toFixed(2)} DA</p>
       <p class="subtitle">From ${borrowerCount} ${borrowerCount === 1 ? 'borrower' : 'borrowers'}</p>
    </div>
  `;
}

async function renderAllCharts() {
  await createSalesChart(currentDuration);
  createProfitMarginChart();
  createTopProductsChart();
}

function getSelectedCustomRange() {
  const s = document.getElementById('customStart').value;
  const e = document.getElementById('customEnd').value;
  return { s: s || null, e: e || null };
}

async function createSalesChart(duration, start = null, end = null) {
  if (duration === 'custom') {
    const range = getSelectedCustomRange();
    if (!range.s || !range.e) {
      alert("Please pick both start and end dates for custom range.");
      return;
    }
    start = range.s;
    end = range.e;
  }

  const { labels, salesData, profitData } = await getSalesDataForChart(duration, start, end, currentAccuracy);

  const ctx = document.getElementById('salesProfitChart').getContext('2d');
  const canvasWidth = ctx.canvas.parentElement.clientWidth || 800;
  const approxTickLimit = Math.max(3, Math.floor(canvasWidth / 80));

  const config = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Sales',
          data: salesData,
          borderColor: '#007bff',
          backgroundColor: 'rgba(0,123,255,0.08)',
          fill: true,
          tension: 0.25,
          pointRadius: 2
        },
        {
          label: 'Profit',
          data: profitData,
          borderColor: '#28a745',
          backgroundColor: 'rgba(40,167,69,0.08)',
          fill: true,
          tension: 0.25,
          pointRadius: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'top' } },
      scales: {
        x: {
          ticks: {
            autoSkip: true,
            maxTicksLimit: approxTickLimit,
            callback: function(value) {
              return this.getLabelForValue(value);
            }
          }
        },
        y: { beginAtZero: true, ticks: { callback: v => formatNumber(v) } }
      }
    }
  };

  if (salesProfitChart) {
    salesProfitChart.data.labels = config.data.labels;
    salesProfitChart.data.datasets = config.data.datasets;
    salesProfitChart.options.scales.x.ticks.maxTicksLimit = config.options.scales.x.ticks.maxTicksLimit;
    salesProfitChart.update();
  } else {
    salesProfitChart = new Chart(ctx, config);
  }
}

async function createProfitMarginChart() {
  const { totalProfit, totalCost } = await getProfitMarginData();
  const ctx = document.getElementById('profitMarginChart').getContext('2d');
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Total Profit', 'Total Cost'],
      datasets: [{ data: [totalProfit, totalCost], backgroundColor: ['#28a745', '#ffc107'], hoverOffset: 4 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });
}

async function createTopProductsChart() {
  const { labels, data } = await getTopSellingProducts();
  const ctx = document.getElementById('topProductsChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Quantity Sold', data, backgroundColor: ['rgba(0,123,255,0.7)','rgba(40,167,69,0.7)','rgba(255,193,7,0.7)','rgba(220,53,69,0.7)','rgba(108,117,125,0.7)'] }]
    },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } }
  });
}

function setupEventListeners() {
  const durationControls = document.getElementById('salesChartDuration');
  durationControls.addEventListener('click', async (e) => {
    if (e.target.tagName === 'BUTTON') {
      const duration = e.target.dataset.duration;
      durationControls.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');

      currentDuration = duration;
      if (duration !== 'custom') {
        document.getElementById('customStart').value = '';
        document.getElementById('customEnd').value = '';
        await createSalesChart(duration);
      }
    }
  });

  document.getElementById('applyCustom').addEventListener('click', async () => {
    const start = document.getElementById('customStart').value;
    const end = document.getElementById('customEnd').value;
    if (!start || !end) {
      alert("Please choose both start and end dates for a custom range.");
      return;
    }
    currentDuration = 'custom';
    durationControls.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    await createSalesChart('custom', start, end);
  });

  document.getElementById('accuracySelect').addEventListener('change', async (e) => {
    currentAccuracy = e.target.value;
    if (currentDuration === 'custom') {
      const { s, e: en } = getSelectedCustomRange();
      if (s && en) await createSalesChart('custom', s, en);
    } else {
      await createSalesChart(currentDuration);
    }
  });

  window.addEventListener('resize', () => {
    if (!salesProfitChart) return;
    setTimeout(() => {
      createSalesChart(currentDuration);
    }, 120);
  });
}

function autoFillCustomDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);
  document.getElementById('customStart').value = start.toISOString().split('T')[0];
  document.getElementById('customEnd').value = end.toISOString().split('T')[0];
}

function formatNumber(num) {
  return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
