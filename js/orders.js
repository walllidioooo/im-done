// js/orders.js
import { getDb, saveDb } from './db.js';

/**
 * Adds a new order to the database.
 * This process is wrapped in a transaction to ensure data integrity. It creates an order,
 * creates snapshots of the products at the time of purchase, and updates the stock levels.
 * @param {Array<Object>} productsList - A list of products to include in the order.
 *   Each object should have `product_id` and `quantity`.
 * @returns {Promise<number>} The ID of the newly created order.
 */
export async function addOrder(productsList) {
  const db = getDb();
  if (!productsList || productsList.length === 0) {
    throw new Error("Cannot create an empty order.");
  }

  try {
    db.exec("BEGIN TRANSACTION;");

    // 1. Create the main order entry to get an ID
    const now = new Date().toISOString();
    let stmt = db.prepare("INSERT INTO orders (created_at) VALUES (?);");
    stmt.run([now]);
    stmt.free();
    
    const orderIdResult = db.exec("SELECT last_insert_rowid();");
    const orderId = orderIdResult[0].values[0][0];

    // Prepare statements for repeated use
    const productQueryStmt = db.prepare("SELECT name, price_buy, price_sell, stock FROM products WHERE id = ?;");
    const snapshotInsertStmt = db.prepare("INSERT INTO products_snapshots (order_id, product_id, name, price_buy, price_sell, quantity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?);");
    const stockUpdateStmt = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?;");

    for (const item of productsList) {
      // 2. Get current product details
      const productResult = productQueryStmt.get([item.product_id]);
      if (!productResult) {
        throw new Error(`Product with ID ${item.product_id} not found.`);
      }

      const [name, price_buy, price_sell, stock] = productResult;

      if (stock !== null && stock < item.quantity) {
          throw new Error(`Insufficient stock for product "${name}". Available: ${stock}, Requested: ${item.quantity}.`);
      }
      
      // 3. Create a product snapshot
      snapshotInsertStmt.run([orderId, item.product_id, name, price_buy, price_sell, item.quantity, now]);
      
      // 4. Update the product's stock
      if (stock !== null) {
        stockUpdateStmt.run([item.quantity, item.product_id]);
      }
    }
    
    productQueryStmt.free();
    snapshotInsertStmt.free();
    stockUpdateStmt.free();
    
    db.exec("COMMIT;");
    await saveDb();
    console.log(`✅ Order #${orderId} created successfully.`);
    return orderId;

  } catch (error) {
    console.error("❌ Failed to add order:", error);
    db.exec("ROLLBACK;");
    throw error;
  }
}

/**
 * Deletes an order and its related data, and restores the stock for the products in the order.
 * This will NOT delete any historical snapshots linked to borrowers.
 * @param {number} orderId - The ID of the order to delete.
 */
export async function deleteOrder(orderId) {
    const db = getDb();
    try {
        db.exec("BEGIN TRANSACTION;");

        // 1. Get products from the order to restore stock
        const productsToRestoreStmt = db.prepare("SELECT product_id, quantity FROM products_snapshots WHERE order_id = ?;");
        const productsToRestore = [];
        productsToRestoreStmt.bind([orderId]);
        while(productsToRestoreStmt.step()){
            const row = productsToRestoreStmt.get();
            // Ensure the row is not empty and has expected values
            if (row && row.length === 2) {
                productsToRestore.push(row);
            }
        }
        productsToRestoreStmt.free();

        if (productsToRestore.length > 0) {
            const stockUpdateStmt = db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?;");
            productsToRestore.forEach(([product_id, quantity]) => {
                if (product_id !== null) {
                    stockUpdateStmt.run([quantity, product_id]);
                }
            });
            stockUpdateStmt.free();
        }

        // 2. Delete the "live" order data.
        // The unused products_orders table can be cleared.
        db.run("DELETE FROM products_orders WHERE order_id = ?;", [orderId]);
        // The original snapshots for the live order are deleted.
        db.run("DELETE FROM products_snapshots WHERE order_id = ?;", [orderId]);
        // The main order entry is deleted.
        db.run("DELETE FROM orders WHERE id = ?;", [orderId]);

        // *** FIX: Removed line that deleted historical borrower data.
        // The line "DELETE FROM orders_snapshots WHERE original_order_id = ?" was here and has been removed
        // to ensure that borrower history is preserved even if the original order is deleted.

        db.exec("COMMIT;");
        await saveDb();
        console.log(`🗑️ Order #${orderId} and its associations have been deleted. Borrower history remains.`);
    } catch (error) {
        console.error(`❌ Failed to delete order #${orderId}:`, error);
        db.exec("ROLLBACK;");
        throw error;
    }
}


// --- Other unmodified functions ---

export async function getOrdersWithTotal({ sortBy = 'date', ascending = false, limit = 5, offset = 0 } = {}) {
    const db = getDb();
    const validSortFields = { 'date': 'o.created_at', 'price_sell': 'total_sell', 'profit': 'profit' };
    const orderByField = validSortFields[sortBy] || 'o.created_at';
    const direction = ascending ? 'ASC' : 'DESC';
    const sql = `
        SELECT
            o.id as order_id,
            o.created_at,
            COALESCE(SUM(ps.price_sell * ps.quantity), 0) as total_sell,
            COALESCE(SUM((ps.price_sell - ps.price_buy) * ps.quantity), 0) as profit,
            (SELECT 1 FROM orders_snapshots os WHERE os.original_order_id = o.id LIMIT 1) IS NOT NULL as has_borrower
        FROM orders o
        LEFT JOIN products_snapshots ps ON o.id = ps.order_id
        GROUP BY o.id
        ORDER BY ${orderByField} ${direction}
        LIMIT ? OFFSET ?;
    `;
    const stmt = db.prepare(sql);
    const result = [];
    stmt.bind([limit, offset]);
    while (stmt.step()) { result.push(stmt.getAsObject()); }
    stmt.free();
    return result;
}

export async function getProductsInOrder(orderId, limit = 100, offset = 0) {
    const db = getDb();
    const sql = `
        SELECT name, quantity, price_sell, (price_sell * quantity) as subtotal_sell
        FROM products_snapshots WHERE order_id = ? LIMIT ? OFFSET ?;`;
    const stmt = db.prepare(sql);
    const result = [];
    stmt.bind([orderId, limit, offset]);
    while (stmt.step()) { result.push(stmt.getAsObject()); }
    stmt.free();
    return result;
}

export async function countOrders() {
    const db = getDb();
    const result = db.exec("SELECT COUNT(*) FROM orders;");
    return result.length > 0 ? result[0].values[0][0] : 0;
}

export async function getOrderStatistics() {
    const db = getDb();
    const totalsResult = db.exec(`
        SELECT SUM(price_sell * quantity), SUM(price_buy * quantity), SUM((price_sell - price_buy) * quantity)
        FROM products_snapshots;`);
    const totals = totalsResult.length > 0 ? totalsResult[0].values[0] : [0, 0, 0];
    const total_orders = await countOrders();
    const with_borrower_result = db.exec("SELECT COUNT(DISTINCT original_order_id) FROM orders_snapshots;");
    const with_borrower = with_borrower_result.length > 0 ? with_borrower_result[0].values[0][0] : 0;
    const largestOrderResult = db.exec(`
        SELECT order_id FROM products_snapshots GROUP BY order_id ORDER BY SUM(price_sell * quantity) DESC LIMIT 1;`);
    const largest_order_id = largestOrderResult.length > 0 ? largestOrderResult[0].values[0][0] : null;
    return {
        total_orders,
        total_sell: totals[0] || 0,
        total_buy: totals[1] || 0,
        total_profit: totals[2] || 0,
        average_profit: total_orders > 0 ? (totals[2] || 0) / total_orders : 0,
        with_borrower,
        largest_order_id,
    };
}

export async function countProductsInOrder(orderId) {
    const db = getDb();
    const result = db.exec("SELECT COUNT(*) FROM products_snapshots WHERE order_id = ?;", [orderId]);
    return result.length > 0 ? result[0].values[0][0] : 0;
}