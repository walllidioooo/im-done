// js/products.js
import { getDb, saveDb } from './db.js';

/**
 * Generates a unique 18-digit numeric barcode.
 * It combines the current timestamp with a random number to ensure high uniqueness.
 * @returns {number} A unique 18-digit number.
 */
function generateUniqueBarcode() {
  const timestamp = Date.now().toString(); // 13 digits
  const random = Math.floor(Math.random() * 1e5).toString().padStart(5, '0'); // 5 random digits
  return Number(timestamp + random);
}

/**
 * Adds a new product to the database with a system-generated unique barcode.
 * This is used by the standard 'Add Product' button flow.
 * @param {string} name - The product's name.
 * @param {number} price_buy - The buying price.
 * @param {number} price_sell - The selling price.
 * @param {number|null} stock - The current stock quantity.
 * @param {number|null} stock_danger - The stock level considered as low.
 */
export async function addProduct(name, price_buy, price_sell, stock, stock_danger) {
  const id = generateUniqueBarcode(); // Generate the unique barcode
  await addProductWithId(id, name, price_buy, price_sell, stock, stock_danger);
}

/**
 * Adds a new product using a specific, provided ID (barcode).
 * This is used when adding a product after a scan finds no existing item.
 * @param {number} id - The explicit barcode/ID for the new product.
 * @param {string} name - The product's name.
 * @param {number} price_buy - The buying price.
 * @param {number} price_sell - The selling price.
 * @param {number|null} stock - The current stock quantity.
 * @param {number|null} stock_danger - The stock level considered as low.
 */
export async function addProductWithId(id, name, price_buy, price_sell, stock, stock_danger) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO products (id, name, price_buy, price_sell, stock, stock_danger, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const createdAt = new Date().toISOString();
  try {
    stmt.run([id, name, price_buy, price_sell, stock, stock_danger, createdAt]);
    console.log(`✅ Product with ID ${id} was added successfully.`);
  } catch (error) {
    console.error(`❌ Failed to add product with ID ${id}:`, error);
    // Optionally re-throw or handle the error (e.g., if ID already exists)
    throw error;
  } finally {
    stmt.free();
  }
  await saveDb();
}

/**
 * Updates an existing product identified by its ID (barcode).
 * @param {number} id - The product's unique barcode/ID.
 * @param {object} updates - An object with fields to update (e.g., { name: 'New Name' }).
 */
export async function updateProduct(id, updates) {
  const db = getDb();
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }

  if (fields.length === 0) return;

  values.push(id);
  const stmt = db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(values);
  stmt.free();
  await saveDb();
}

/**
 * Deletes a product from the database by its ID (barcode).
 * @param {number} id - The product's unique barcode/ID.
 */
export async function deleteProduct(id) {
  const db = getDb();
  const stmt = db.prepare(`DELETE FROM products WHERE id = ?`);
  stmt.run([id]);
  stmt.free();
  await saveDb();
}

/**
 * Retrieves a paginated and sorted list of products.
 * @param {object} options - Filtering and sorting options.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of product objects.
 */
export async function getProducts({
  sortBy = 'created_at',
  ascending = false,
  limit = 100,
  offset = 0,
  lowStockOnly = false
} = {}) {
  const db = getDb();
  const direction = ascending ? 'ASC' : 'DESC';
  let query = `SELECT * FROM products WHERE 1=1`;

  if (lowStockOnly) {
    query += ` AND stock IS NOT NULL AND stock_danger IS NOT NULL AND stock < stock_danger`;
  }
  
  // Ensure sortBy is a valid column to prevent SQL injection
  const validSortColumns = ['id', 'name', 'price_buy', 'price_sell', 'stock', 'created_at'];
  if (!validSortColumns.includes(sortBy)) {
    sortBy = 'created_at';
  }

  query += ` ORDER BY ${sortBy} ${direction} LIMIT ? OFFSET ?`;
  const stmt = db.prepare(query);
  stmt.bind([limit, offset]);

  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Counts the total number of products in the database.
 * @returns {Promise<number>} The total product count.
 */
export async function countProducts() {
  const db = getDb();
  const stmt = db.prepare(`SELECT COUNT(*) AS total FROM products`);
  stmt.step();
  const result = stmt.getAsObject();
  stmt.free();
  return result.total;
}

/**
 * Retrieves a single product by its ID (barcode).
 * @param {number} id - The product's unique barcode/ID.
 * @returns {Promise<object|null>} The product object or null if not found.
 */
export async function getProductById(id) {
  const db = getDb();
  const stmt = db.prepare(`SELECT * FROM products WHERE id = ?`);
  stmt.bind([id]);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

/**
 * Searches for products by a keyword in their name or barcode.
 * @param {string} keyword - The search term.
 * @param {object} options - Sorting and pagination options.
 * @returns {Array<object>} An array of matching product objects.
 */
export function searchProducts(keyword, { sortBy = 'name', ascending = true, limit = 100, offset = 0 } = {}) {
  const db = getDb();
  const order = ascending ? 'ASC' : 'DESC';
  const stmt = db.prepare(`
    SELECT * FROM products
    WHERE name LIKE ? OR CAST(id AS TEXT) LIKE ?
    ORDER BY ${sortBy} ${order}
    LIMIT ? OFFSET ?
  `);
  stmt.bind([`%${keyword}%`, `%${keyword}%`, limit, offset]);

  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Retrieves various statistics about the products.
 * @returns {Promise<object>} An object containing product statistics.
 */
export async function getProductStatistics() {
  const db = getDb();
  const execQuery = (sql) => (db.exec(sql)[0]?.values[0] || [0])[0] || 0;
  const execQueryWithFallback = (sql) => db.exec(sql)[0]?.values[0] || ["N/A", 0];

  const totalProducts = execQuery(`SELECT COUNT(*) FROM products`);
  const totalQuantity = execQuery(`SELECT SUM(quantity) FROM products_snapshots`);
  const mostSold = execQueryWithFallback(`SELECT name, SUM(quantity) AS total FROM products_snapshots GROUP BY name ORDER BY total DESC LIMIT 1`);
  const leastSold = execQueryWithFallback(`SELECT name, SUM(quantity) AS total FROM products_snapshots GROUP BY name HAVING total > 0 ORDER BY total ASC LIMIT 1`);
  const topRevenue = execQueryWithFallback(`SELECT name, SUM(quantity * price_sell) AS revenue FROM products_snapshots GROUP BY name ORDER BY revenue DESC LIMIT 1`);
  const totalProfit = execQuery(`SELECT SUM((price_sell - price_buy) * quantity) FROM products_snapshots`);
  const stockValueBuy = execQuery(`SELECT SUM(stock * price_buy) FROM products`);
  const stockValueSell = execQuery(`SELECT SUM(stock * price_sell) FROM products`);

  return { totalProducts, totalQuantity, mostSold, leastSold, topRevenue, totalProfit, stockValueBuy, stockValueSell };
}