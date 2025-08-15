// js/borrowers.js
import { getDb, saveDb } from './db.js';

export async function addBorrower({ name, date, amount }) {
  const db = getDb();
  db.run(
    `INSERT INTO borrowers (name, date, amount) VALUES (?, ?, ?)`,
    [name, date, amount]
  );
  const id = db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0];
  await saveDb();
  return id;
}

export function countBorrowers(search = '') {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT COUNT(*) AS count
    FROM borrowers
    WHERE name LIKE ?
  `);
  stmt.bind([`%${search}%`]);
  let count = 0;
  if (stmt.step()) {
    count = stmt.getAsObject().count;
  }
  stmt.free();
  return count;
}

export async function getBorrowers(search = '', sortBy = 'date', ascending = false, limit = 10, offset = 0) {
  const db = getDb();
  const direction = ascending ? 'ASC' : 'DESC';
  const sortColumn = sortBy === 'amount' ? 'amount' : 'date';
  const stmt = db.prepare(`
    SELECT * FROM borrowers
    WHERE name LIKE ?
    ORDER BY ${sortColumn} ${direction}
    LIMIT ? OFFSET ?
  `);
  stmt.bind([`%${search}%`, limit, offset]);
  const result = [];
  while (stmt.step()) {
    result.push(stmt.getAsObject());
  }
  stmt.free();
  return result;
}

/**
 * Creates a historical, immutable snapshot of an order and links it to a borrower.
 * This is the primary function for creating a borrower's debt record.
 * @param {number} order_id - The ID of the original order.
 * @param {number} borrower_id - The ID of the borrower.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function linkOrderToBorrower(order_id, borrower_id) {
  const db = getDb();
  db.exec("BEGIN TRANSACTION;");

  try {
    // Prevent duplicate linking
    const checkStmt = db.prepare(`SELECT 1 FROM orders_snapshots WHERE original_order_id = ? LIMIT 1`);
    checkStmt.bind([order_id]);
    if (checkStmt.step()) {
      checkStmt.free();
      db.exec("ROLLBACK;");
      return { success: false, error: "This order has already been linked to a borrower." };
    }
    checkStmt.free();

    // Get order creation date
    let order_date = null;
    const dateStmt = db.prepare(`SELECT created_at FROM orders WHERE id = ?`);
    dateStmt.bind([order_id]);
    if (dateStmt.step()) {
        order_date = dateStmt.getAsObject().created_at;
    }
    dateStmt.free();
    if (!order_date) {
        throw new Error(`Order with ID ${order_id} not found.`);
    }

    // *** FIX: Corrected query to calculate total price.
    // It now sums directly from 'products_snapshots' where the original order data is.
    const priceStmt = db.prepare(`
      SELECT SUM(quantity * price_sell) AS total
      FROM products_snapshots
      WHERE order_id = ?
    `);
    priceStmt.bind([order_id]);
    let total_price = 0;
    if (priceStmt.step()) {
        total_price = priceStmt.getAsObject().total || 0;
    }
    priceStmt.free();

    // Create the main order snapshot record
    const orderSnapshotStmt = db.prepare(`
      INSERT INTO orders_snapshots (original_order_id, borrower_id, date, total_price)
      VALUES (?, ?, ?, ?)
    `);
    orderSnapshotStmt.run([order_id, borrower_id, order_date, total_price]);
    orderSnapshotStmt.free();
    
    const snapshotId = db.exec(`SELECT last_insert_rowid()`)[0].values[0][0];

    // *** FIX: Corrected query to fetch products for copying.
    // It now selects directly from 'products_snapshots' instead of the unused 'products_orders' table.
    const productsToCopyStmt = db.prepare(`
      SELECT name, quantity, price_sell
      FROM products_snapshots
      WHERE order_id = ?
    `);
    productsToCopyStmt.bind([order_id]);

    const productInsertStmt = db.prepare(`
        INSERT INTO orders_snapshots_products (order_snapshot_id, name, price_sell, quantity)
        VALUES (?, ?, ?, ?)
    `);

    // Loop through the products from the original order and copy them to the historical snapshot
    while (productsToCopyStmt.step()) {
      const { name, quantity, price_sell } = productsToCopyStmt.getAsObject();
      productInsertStmt.run([snapshotId, name, price_sell, quantity]);
    }
    productsToCopyStmt.free();
    productInsertStmt.free();
    
    // Add the total price of this borrowed order to the borrower's main amount
    db.run(`UPDATE borrowers SET amount = amount + ? WHERE id = ?`, [total_price, borrower_id]);


    db.exec("COMMIT;");
    await saveDb();
    return { success: true };

  } catch (error) {
    db.exec("ROLLBACK;");
    console.error("❌ Failed to link order to borrower:", error);
    throw error;
  }
}

export function getSnapshotOrdersForBorrower(borrowerId) {
  const db = getDb();
  const ordersRes = db.exec(`
    SELECT id, date, total_price
    FROM orders_snapshots
    WHERE borrower_id = ?
    ORDER BY date DESC
  `, [borrowerId]);

  if (!ordersRes.length) return [];

  const orders = ordersRes[0].values.map(([id, date, total]) => ({
    order_id: id,
    order_date: date,
    total_price: total,
    products: []
  }));

  for (const order of orders) {
    const prodRes = db.exec(`
      SELECT name, quantity, price_sell
      FROM orders_snapshots_products
      WHERE order_snapshot_id = ?
    `, [order.order_id]);

    if (prodRes.length) {
      order.products = prodRes[0].values.map(([n, q, p]) => ({
        name: n, quantity: q, price_sell: p
      }));
    }
  }
  return orders;
}

export async function updateBorrowerAmountDirect(borrower_id, newAmount) {
  const db = getDb();
  db.run(`UPDATE borrowers SET amount = ? WHERE id = ?`, [newAmount, borrower_id]);
  await saveDb();
}

export async function deleteBorrower(id) {
  const db = getDb();
  db.exec("BEGIN TRANSACTION;");
  // Also delete their historical order snapshots when a borrower is deleted
  db.run(`DELETE FROM orders_snapshots_products WHERE order_snapshot_id IN (SELECT id FROM orders_snapshots WHERE borrower_id = ?)`, [id]);
  db.run(`DELETE FROM orders_snapshots WHERE borrower_id = ?`, [id]);
  db.run(`DELETE FROM borrowers WHERE id = ?`, [id]);
  db.exec("COMMIT;");
  await saveDb();
}