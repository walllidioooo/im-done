// js/import_export.js

const CLIENT_ID = '298836720613-t4mv2th3cn4f4a68ldk0ig4r8mr8abt2.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
let accessToken = null;
let SQL;
let db = null;

// Status management
function showStatus(message, type = 'info') {
  const statusArea = document.getElementById('status-area');
  statusArea.innerHTML = `<div class="status ${type}">${message}</div>`;
  console.log(`[${type.toUpperCase()}] ${message}`);

  if (type !== 'error') {
    setTimeout(() => {
      if (statusArea.firstChild && statusArea.firstChild.textContent === message) {
          statusArea.innerHTML = '';
      }
    }, 5000);
  }
}

// =================================================================
// === THE FIX IS HERE (1/4): Schema includes the new table      ===
// =================================================================
function initDatabaseSchema() {
    if (!db) {
      db = new SQL.Database();
    }
    // (Your existing table creations remain here...)
    db.run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, price_buy REAL NOT NULL, price_sell REAL NOT NULL, stock INTEGER NOT NULL, stock_danger INTEGER NOT NULL, created_at TEXT NOT NULL)`);
    db.run(`CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL)`);
    db.run(`CREATE TABLE IF NOT EXISTS products_snapshots (id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, product_id INTEGER NOT NULL, name TEXT NOT NULL, price_buy REAL NOT NULL, price_sell REAL NOT NULL, quantity INTEGER NOT NULL, created_at TEXT NOT NULL)`);
    db.run(`CREATE TABLE IF NOT EXISTS products_orders (id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, product_id INTEGER NOT NULL, snapshot_id INTEGER NOT NULL, quantity INTEGER NOT NULL)`);
    db.run(`CREATE TABLE IF NOT EXISTS borrowers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, date TEXT NOT NULL, amount REAL NOT NULL)`);
    db.run(`CREATE TABLE IF NOT EXISTS orders_snapshots (id INTEGER PRIMARY KEY, original_order_id INTEGER NOT NULL, borrower_id INTEGER NOT NULL, date TEXT NOT NULL, total_price REAL NOT NULL)`);
    db.run(`CREATE TABLE IF NOT EXISTS orders_snapshots_products (id INTEGER PRIMARY KEY, order_snapshot_id INTEGER NOT NULL, name TEXT NOT NULL, price_sell REAL NOT NULL, quantity INTEGER NOT NULL)`);

    // Create a new table to store the last used Google Drive ID
    db.run(`CREATE TABLE IF NOT EXISTS import_id_table (
        id INTEGER PRIMARY KEY DEFAULT 1,
        drive_id TEXT NOT NULL
    )`);
}

// =================================================================
// === THE FIX IS HERE (2/4): Functions to save and load the ID  ===
// =================================================================
async function saveLatestDriveId(fileId) {
    if (!db) return;
    try {
        // This command will INSERT a new row if one doesn't exist,
        // or UPDATE the existing one. Perfect for a single value.
        db.run(
            'INSERT INTO import_id_table (id, drive_id) VALUES (1, :drive_id) ON CONFLICT(id) DO UPDATE SET drive_id = :drive_id',
            { ':drive_id': fileId }
        );
        await saveToIndexedDB(); // Persist the change
        console.log(`Saved latest Drive ID to DB: ${fileId}`);
    } catch (error) {
        console.error("❌ Error saving Drive ID:", error);
    }
}

function loadLatestDriveId() {
    if (!db) return;
    try {
        const stmt = db.prepare('SELECT drive_id FROM import_id_table WHERE id = 1');
        if (stmt.step()) { // Check if a row was found
            const driveId = stmt.get()[0];
            if (driveId) {
                document.getElementById('drive-file-id').value = driveId;
                console.log(`Loaded latest Drive ID from DB: ${driveId}`);
            }
        }
        stmt.free();
    } catch (error) {
        // This can safely fail on a fresh database.
        console.warn("Could not load latest Drive ID, table might not exist yet.");
    }
}

// (deleteAllData and initializeSampleData functions remain the same)
async function deleteAllData() { if (!db) { showStatus('❌ Database not initialized.', 'error'); return; } try { showStatus('⏳ Deleting all data from all tables...', 'info'); const tablesToClear = [ 'products', 'orders', 'borrowers', 'products_snapshots', 'products_orders', 'orders_snapshots', 'orders_snapshots_products', 'import_id_table' ]; tablesToClear.forEach(table => { db.run(`DELETE FROM ${table};`); db.run(`DELETE FROM sqlite_sequence WHERE name='${table}';`); }); showStatus('✅ All data has been successfully deleted.', 'success'); await saveToIndexedDB(); updateUI(); } catch (error) { console.error("❌ Error deleting data:", error); showStatus(`❌ Error deleting data: ${error.message}`, 'error'); } }
async function initializeSampleData() { if (!db) throw new Error("❌ Database not initialized"); showStatus('⏳ Initializing sample data...', 'info'); try { const tablesToClear = [ 'products', 'orders', 'borrowers', 'products_snapshots', 'products_orders', 'orders_snapshots', 'orders_snapshots_products', 'import_id_table' ]; tablesToClear.forEach(table => db.run(`DELETE FROM ${table};`)); const products = []; const productData = []; for (let i = 1; i <= 100; i++) { const priceBuy = 50 + i * 10; const priceSell = 100 + i * 15; const stock = Math.floor(Math.random() * 50) + 10; const stockDanger = Math.floor(Math.random() * 10) + 5; products.push(`('Product ${i}', ${priceBuy}, ${priceSell}, ${stock}, ${stockDanger}, '2025-08-09')`); productData.push({ id: i, name: `Product ${i}`, price_buy: priceBuy, price_sell: priceSell }); } db.run(`INSERT INTO products (name, price_buy, price_sell, stock, stock_danger, created_at) VALUES ${products.join(',')};`); const orders = [], borrowers = [], orderSnapshots = [], orderSnapshotsProducts = [], productSnapshots = [], productOrders = []; const borrowerTotals = new Array(50).fill(0); let snapshotIdCounter = 1; function getRandomDateInYear() { const endDate = new Date('2025-08-09T23:59:59'); const startDate = new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000); return new Date(startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime())).toISOString().slice(0, 19).replace('T', ' '); } for (let i = 1; i <= 300; i++) { const orderId = i, orderDate = getRandomDateInYear(), borrowerId = Math.floor(Math.random() * 50) + 1; let currentOrderTotalPrice = 0; orders.push(`('${orderDate}')`); const numProductsInOrder = Math.floor(Math.random() * 3) + 1; for (let j = 0; j < numProductsInOrder; j++) { const product = productData[Math.floor(Math.random() * productData.length)], quantity = Math.floor(Math.random() * 5) + 1, priceAtSale = parseFloat(product.price_sell.toFixed(2)); currentOrderTotalPrice += quantity * priceAtSale; orderSnapshotsProducts.push(`(${orderId}, '${product.name}', ${priceAtSale}, ${quantity})`); productSnapshots.push(`(${orderId}, ${product.id}, '${product.name}', ${product.price_buy.toFixed(2)}, ${priceAtSale}, ${quantity}, '${orderDate.split(' ')[0]}')`); productOrders.push(`(${orderId}, ${product.id}, ${snapshotIdCounter}, ${quantity})`); snapshotIdCounter++; } const finalOrderPrice = parseFloat(currentOrderTotalPrice.toFixed(2)); orderSnapshots.push(`(${orderId}, ${borrowerId}, '${orderDate.split(' ')[0]}', ${finalOrderPrice})`); borrowerTotals[borrowerId - 1] += finalOrderPrice; } const names = ['John', 'Jane', 'Bob', 'Alice', 'Charlie', 'Emma', 'David', 'Sophia', 'Michael', 'Olivia']; for (let i = 1; i <= 50; i++) { const name = `${names[Math.floor(Math.random() * names.length)]} ${String.fromCharCode(65 + ((i-1) % 26))}`; borrowers.push(`('${name}', '2025-08-09', ${borrowerTotals[i - 1].toFixed(2)})`); } db.run(`INSERT INTO orders (created_at) VALUES ${orders.join(',')};`); db.run(`INSERT INTO borrowers (name, date, amount) VALUES ${borrowers.join(',')};`); db.run(`INSERT INTO orders_snapshots (original_order_id, borrower_id, date, total_price) VALUES ${orderSnapshots.join(',')};`); db.run(`INSERT INTO orders_snapshots_products (order_snapshot_id, name, price_sell, quantity) VALUES ${orderSnapshotsProducts.join(',')};`); db.run(`INSERT INTO products_snapshots (order_id, product_id, name, price_buy, price_sell, quantity, created_at) VALUES ${productSnapshots.join(',')};`); db.run(`INSERT INTO products_orders (order_id, product_id, snapshot_id, quantity) VALUES ${productOrders.join(',')};`); showStatus("✅ Sample data initialized: 100 products, 300 orders, 50 borrowers.", 'success'); updateUI(); await saveToIndexedDB(); } catch (error) { console.error("❌ Error initializing sample data:", error); showStatus(`❌ Error initializing sample data: ${error.message}`, 'error'); } }


// (saveToIndexedDB and loadFromIndexedDB remain the same)
async function saveToIndexedDB() { if (!db) return; return new Promise((resolve, reject) => { try { const request = indexedDB.open('MyAppDB', 1); request.onupgradeneeded = e => { e.target.result.createObjectStore('datastore', { keyPath: 'id' }); }; request.onsuccess = e => { const tx = e.target.result.transaction('datastore', 'readwrite'); tx.objectStore('datastore').put({ id: 'main', data: db.export(), timestamp: Date.now() }); tx.oncomplete = () => resolve(); tx.onerror = () => reject(new Error('Failed to save to IndexedDB')); }; request.onerror = () => reject(new Error('Failed to open IndexedDB')); } catch (error) { reject(error); } }); }
function loadFromIndexedDB(SQL) { return new Promise((resolve) => { const request = indexedDB.open('MyAppDB', 1); request.onupgradeneeded = e => { e.target.result.createObjectStore('datastore', { keyPath: 'id' }); }; request.onsuccess = e => { const tx = e.target.result.transaction('datastore', 'readonly'); const get = tx.objectStore('datastore').get('main'); get.onsuccess = () => resolve(get.result?.data ? new SQL.Database(get.result.data) : null); get.onerror = () => resolve(null); }; request.onerror = () => resolve(null); }); }


// (Google Drive Auth functions remain the same)
function initGoogleDriveAuth(callback) { showStatus('⏳ Awaiting Google sign-in...', 'info'); google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPES, callback: (response) => { if (response.error) { showStatus('❌ Google Sign-in failed', 'error'); return; } accessToken = response.access_token; document.getElementById('auth-status').textContent = '✅ Signed in to Google'; showStatus('✅ Successfully signed in to Google Drive', 'success'); if (callback) callback(); } }).requestAccessToken(); }
function ensureAuthThenRun(callback) { if (!accessToken) { initGoogleDriveAuth(callback); } else { callback(); } }

// =================================================================
// === THE FIX IS HERE (3/4): Export now saves the ID            ===
// =================================================================
async function exportDatabaseToDrive() {
  if (!db) { showStatus('❌ No database to export', 'error'); return; }
  try {
    showStatus('⏳ Exporting database to Google Drive...', 'info');
    const metadata = { name: `store_database_${new Date().toISOString().split('T')[0]}.db`, description: 'SQLite database export' };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([db.export()], { type: 'application/octet-stream' }));

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size', {
      method: 'POST',
      headers: new Headers({ Authorization: 'Bearer ' + accessToken }),
      body: form,
    });
    if (!response.ok) throw new Error(`Upload failed: ${response.status} ${response.statusText}`);

    const result = await response.json();
    const fileId = result.id;
    
    showStatus(`✅ Database exported successfully! File ID: ${fileId}`, 'success');
    
    // Save the new ID and update the import field
    await saveLatestDriveId(fileId);
    document.getElementById('drive-file-id').value = fileId;

  } catch (error) { showStatus(`❌ Export failed: ${error.message}`, 'error'); }
}


// (Import function remains the same)
async function importDatabaseFromDrive(fileId) { if (!fileId) { showStatus('❌ Please enter a file ID', 'error'); return; } try { showStatus('⏳ Downloading database...', 'info'); const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: new Headers({ Authorization: 'Bearer ' + accessToken }), }); if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`); showStatus('⏳ Loading database into memory...', 'info'); const newDb = new SQL.Database(new Uint8Array(await response.arrayBuffer())); const tablesResult = newDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"); if (tablesResult.length === 0 || tablesResult[0].values.length === 0) { newDb.close(); throw new Error('No valid tables found in the imported database'); } if (db) db.close(); db = newDb; showStatus('⏳ Saving to local storage...', 'info'); await saveToIndexedDB(); updateUI(); showStatus(`✅ Database imported successfully! Found ${tablesResult[0].values.length} tables`, 'success'); document.getElementById('drive-file-id').value = ''; } catch (error) { showStatus(`❌ Import failed: ${error.message}`, 'error'); } }


// (UI Update functions remain the same)
function updateUI() { updateTableSelector(); updateDatabaseInfo(); displaySelectedTable(); }
function updateTableSelector() { const selector = document.getElementById('table-selector'); selector.innerHTML = '<option value="">Select a table...</option>'; if (!db) return; try { const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"); if (result[0]?.values) { result[0].values.flat().forEach(name => selector.add(new Option(name, name))); } } catch (e) { console.error('Error updating table selector:', e); } }
function updateDatabaseInfo() { const infoEl = document.getElementById('db-info'); if (!db) { infoEl.textContent = 'No database loaded'; return; } try { const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")[0].values.flat(); let info = `Database loaded with ${tables.length} tables:\n\n`; tables.forEach(name => { try { const count = db.exec(`SELECT COUNT(*) FROM ${name}`)[0].values[0][0]; info += `• ${name}: ${count} rows\n`; } catch { info += `• ${name}: Error reading\n`; } }); infoEl.textContent = info; } catch (e) { infoEl.textContent = `Error reading database info: ${e.message}`; } }
function displaySelectedTable() { const selector = document.getElementById('table-selector'); const output = document.getElementById('table-output'); const tableName = selector.value; if (!tableName || !db) { output.textContent = 'No table selected'; return; } try { const limit = parseInt(document.getElementById('row-limit').value) || 10; const result = db.exec(`SELECT * FROM ${tableName} ORDER BY id DESC LIMIT ${limit}`); if (result[0]?.values.length > 0) { const { columns, values } = result[0]; const headers = columns.join(' | '); const rows = values.map(row => row.join(' | ')).join('\n'); output.textContent = `${headers}\n${'-'.repeat(headers.length)}\n${rows}`; } else { output.textContent = `Table "${tableName}" is empty.`; } } catch (e) { output.textContent = `Error reading table "${tableName}": ${e.message}`; } }

// =================================================================
// === THE FIX IS HERE (4/4): App init now loads the saved ID    ===
// =================================================================
async function initApp() {
    showStatus('⏳ Initializing application...', 'info');
    try {
        const sqlPromise = initSqlJs({ locateFile: file => `https://sql.js.org/dist/${file}` });
        SQL = await sqlPromise;
        db = await loadFromIndexedDB(SQL);

        if (!db) {
            initDatabaseSchema();
            showStatus('✅ New database initialized. Add data or import from Drive.', 'success');
        } else {
            showStatus('✅ Database loaded from local storage.', 'success');
        }
        updateUI();
        loadLatestDriveId(); // Load the saved ID into the UI
    } catch (err) {
        console.error(err);
        showStatus('❌ Critical Error: Failed to initialize database.', 'error');
    }
}

// (Event Listeners remain the same)
document.addEventListener('DOMContentLoaded', () => { document.getElementById('export-db-to-drive-btn').addEventListener('click', () => ensureAuthThenRun(exportDatabaseToDrive)); document.getElementById('import-db-from-drive-btn').addEventListener('click', () => { const fileId = document.getElementById('drive-file-id').value.trim(); ensureAuthThenRun(() => importDatabaseFromDrive(fileId)); }); document.getElementById('init-sample-data-btn').addEventListener('click', () => { if (confirm('This will replace all current data with sample data. Are you sure?')) { initializeSampleData(); } }); document.getElementById('delete-all-data-btn').addEventListener('click', () => { if (confirm('DANGER! This will permanently delete ALL data from the database. This action cannot be undone. Are you absolutely sure?')) { deleteAllData(); } }); document.getElementById('table-selector').addEventListener('change', displaySelectedTable); document.getElementById('refresh-table-btn').addEventListener('click', updateUI); initApp(); });