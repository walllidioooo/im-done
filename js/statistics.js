// js/statistics.js
import { getDb } from './db.js';

/**
 * Basic KPIs
 */
export async function getDashboardKPIs() {
  const db = getDb();
  const totalSales = db.exec("SELECT IFNULL(SUM(quantity * price_sell), 0) FROM products_snapshots")[0].values[0][0];
  const totalProfit = db.exec("SELECT IFNULL(SUM(quantity * (price_sell - price_buy)), 0) FROM products_snapshots")[0].values[0][0];
  const totalOrders = db.exec("SELECT COUNT(*) FROM orders")[0].values[0][0];
  const totalDebt = db.exec("SELECT IFNULL(SUM(amount), 0) FROM borrowers")[0].values[0][0];
  return { totalSales, totalProfit, totalOrders, totalDebt };
}

/**
 * Fetch daily raw data between a start and end date (inclusive).
 * If startDate/endDate are null and duration is a number, it uses date('now', '-N days')
 *
 * We return a map of 'YYYY-MM-DD' => {sales, profit}
 */
export async function fetchDailyRawSales(startDate = null, endDate = null, duration = null) {
  const db = getDb();
  let whereClause = '';
  if (startDate && endDate) {
    whereClause = `WHERE date(created_at) BETWEEN date('${startDate}') AND date('${endDate}')`;
  } else if (duration && duration !== 'all') {
    whereClause = `WHERE date(created_at) >= date('now', '-${duration} days')`;
  } // else no where -> all time

  const query = `
    SELECT strftime('%Y-%m-%d', created_at) as day,
           SUM(quantity * price_sell) as daily_sales,
           SUM(quantity * (price_sell - price_buy)) as daily_profit
    FROM products_snapshots
    ${whereClause}
    GROUP BY day
    ORDER BY day ASC;
  `;

  const result = db.exec(query);
  const map = {};
  if (result.length > 0) {
    result[0].values.forEach(([day, sales, profit]) => {
      map[day] = { sales: sales ?? 0, profit: profit ?? 0 };
    });
  }
  return map;
}

/**
 * Main function used by UI: returns labels and aggregated arrays according to requested accuracy.
 * duration: '7' | '30' | 'all' | 'custom' | '90' | '365' etc.
 * If duration === 'custom', startDate and endDate required.
 * accuracy: 'auto' | 'daily' | '3-day' | 'weekly' | 'monthly'
 */
export async function getSalesDataForChart(duration = '7', startDate = null, endDate = null, accuracy = 'auto') {
  // Compute effective start/end dates for fetching daily data
  let start, end;
  if (duration === 'custom' && startDate && endDate) {
    start = startDate;
    end = endDate;
  } else if (duration === 'all') {
    // determine min and max dates present in DB
    const db = getDb();
    const res = db.exec("SELECT MIN(date(created_at)), MAX(date(created_at)) FROM products_snapshots;");
    const vals = res[0].values[0];
    if (!vals[0] || !vals[1]) {
      // no data
      const today = formatDate(new Date());
      return { labels: [today], salesData: [0], profitData: [0], bucketSize: 'daily' };
    }
    start = vals[0];
    end = vals[1];
  } else {
    // numeric duration like '7', '30', etc.
    const days = Number(duration);
    const e = new Date();
    const s = new Date();
    s.setDate(e.getDate() - (days - 1));
    start = formatDate(s);
    end = formatDate(e);
  }

  // Fetch raw daily data from DB
  const rawMap = await fetchDailyRawSales(start, end, (duration !== 'custom' && duration !== 'all') ? duration : null);

  // Build full list of dates
  const allDates = generateDateRange(start, end);

  // Fill per-day arrays
  const perDay = allDates.map(d => {
    const r = rawMap[d];
    return { day: d, sales: r ? r.sales : 0, profit: r ? r.profit : 0 };
  });

  // Decide accuracy when 'auto'
  if (accuracy === 'auto') {
    const totalDays = allDates.length;
    if (totalDays <= 45) accuracy = 'daily';
    else if (totalDays <= 180) accuracy = '3-day';
    else if (totalDays <= 1000) accuracy = 'weekly';
    else accuracy = 'monthly';
  }

  // Aggregate according to accuracy
  let labels = [], salesData = [], profitData = [];
  if (accuracy === 'daily') {
    labels = perDay.map(x => x.day);
    salesData = perDay.map(x => x.sales);
    profitData = perDay.map(x => x.profit);
  } else if (accuracy === '3-day') {
    // group into consecutive 3-day windows starting from start
    for (let i = 0; i < perDay.length; i += 3) {
      const chunk = perDay.slice(i, i + 3);
      const startLabel = chunk[0].day;
      const endLabel = chunk[chunk.length - 1].day;
      labels.push(chunk.length === 1 ? startLabel : `${startLabel} → ${endLabel}`);
      salesData.push(chunk.reduce((s, it) => s + it.sales, 0));
      profitData.push(chunk.reduce((s, it) => s + it.profit, 0));
    }
  } else if (accuracy === 'weekly') {
    // Group by ISO week (YYYY-WW) - use Monday as start
    const buckets = new Map();
    perDay.forEach(({ day, sales, profit }) => {
      const d = new Date(day + 'T00:00:00');
      // shift to Monday
      const dayOfWeek = (d.getDay() + 6) % 7; // 0 = Monday
      const monday = new Date(d);
      monday.setDate(d.getDate() - dayOfWeek);
      const key = formatDate(monday); // use monday date as bucket key
      if (!buckets.has(key)) buckets.set(key, { start: key, sales: 0, profit: 0, count: 0 });
      const b = buckets.get(key);
      b.sales += sales;
      b.profit += profit;
      b.count += 1;
    });
    // order keys ascending
    Array.from(buckets.keys()).sort().forEach(k => {
      const b = buckets.get(k);
      const labelStart = k;
      const labelEnd = formatDate(addDays(new Date(k), 6));
      labels.push(`${labelStart} → ${labelEnd}`);
      salesData.push(b.sales);
      profitData.push(b.profit);
    });
  } else if (accuracy === 'monthly') {
    const buckets = new Map();
    perDay.forEach(({ day, sales, profit }) => {
      const d = new Date(day + 'T00:00:00');
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
      if (!buckets.has(key)) buckets.set(key, { yearMonth: key, sales: 0, profit: 0 });
      const b = buckets.get(key);
      b.sales += sales;
      b.profit += profit;
    });
    Array.from(buckets.keys()).sort().forEach(k => {
      const [y, m] = k.split('-');
      const monthLabel = `${y}-${m}`;
      labels.push(monthLabel);
      const b = buckets.get(k);
      salesData.push(b.sales);
      profitData.push(b.profit);
    });
  } else {
    // fallback to daily
    labels = perDay.map(x => x.day);
    salesData = perDay.map(x => x.sales);
    profitData = perDay.map(x => x.profit);
  }

  return { labels, salesData, profitData, accuracy };
}


/**
 * Profit margin summary
 */
export async function getProfitMarginData() {
  const db = getDb();
  const result = db.exec(`
    SELECT IFNULL(SUM(quantity * (price_sell - price_buy)), 0) as total_profit,
           IFNULL(SUM(quantity * price_buy), 0) as total_cost
    FROM products_snapshots;
  `);
  const [totalProfit, totalCost] = result[0].values[0];
  return { totalProfit, totalCost };
}

/**
 * Top selling products
 */
export async function getTopSellingProducts() {
  const db = getDb();
  const query = `
    SELECT name, SUM(quantity) as total_sold
    FROM products_snapshots
    GROUP BY product_id, name
    ORDER BY total_sold DESC
    LIMIT 5;
  `;
  const result = db.exec(query);
  const labels = [], data = [];
  if (result.length > 0) {
    result[0].values.forEach(([name, total_sold]) => {
      labels.push(name);
      data.push(total_sold);
    });
  }
  return { labels, data };
}


/* ----------------- Helpers ----------------- */
function generateDateRange(start, end) {
  const arr = [];
  let cur = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  while (cur <= last) {
    arr.push(formatDate(cur));
    cur = addDays(cur, 1);
  }
  return arr;
}
function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
function formatDate(d) {
  if (!(d instanceof Date)) d = new Date(d);
  return d.toISOString().split('T')[0];
}
