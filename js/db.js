// db.js - Enhanced database module with binary export/import support

let db = null;
let SQL = null;

// 🧠 Initialize the database
export async function initDatabase() {
  try {
    SQL = await initSqlJs({
      locateFile: file => `https://sql.js.org/dist/${file}`
    });

    // Try to load existing database from IndexedDB
    db = await loadFromIndexedDB(SQL);
    
    if (!db) {
      // Create new empty database
      db = new SQL.Database();
      createTables();
      console.log("✅ New database initialized with empty tables.");
    } else {
      console.log("✅ Database loaded from IndexedDB.");
    }
    
    // Save the current state
    await saveDb();
    return db;
    
  } catch (error) {
    console.error("❌ Database initialization failed:", error);
    throw error;
  }
}

// 📦 Get database instance
export function getDb() {
  if (!db) throw new Error("❌ DB not initialized. Call initDatabase() first.");
  return db;
}

// 🔄 Replace current database with new one
export async function replaceDatabase(newDatabaseBinary) {
  try {
    if (!SQL) {
      throw new Error("SQL.js not initialized");
    }
    
    // Close current database
    if (db) {
      db.close();
    }
    
    // Create new database from binary data
    db = new SQL.Database(newDatabaseBinary);
    
    // Verify the database is valid
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    if (tables.length === 0 || tables[0].values.length === 0) {
      throw new Error("No valid tables found in the database");
    }
    
    // Save to IndexedDB
    await saveDb();
    
    console.log("✅ Database replaced successfully.");
    return db;
    
  } catch (error) {
    console.error("❌ Failed to replace database:", error);
    
    // Restore previous database or create new one if replacement failed
    if (!db) {
      db = new SQL.Database();
      createTables();
      await saveDb();
    }
    
    throw error;
  }
}

// 📤 Export database as binary data
export function exportDatabaseBinary() {
  if (!db) throw new Error("❌ No database to export");
  
  try {
    const binaryData = db.export();
    console.log("✅ Database exported as binary data.");
    return binaryData;
  } catch (error) {
    console.error("❌ Export failed:", error);
    throw error;
  }
}

// 📥 Import database from binary data
export async function importDatabaseBinary(binaryData) {
  return await replaceDatabase(binaryData);
}

// 🗄️ Create database schema
function createTables() {
  if (!db) return;

  try {
    // Live products table
    db.run(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY ,
        name TEXT NOT NULL,
        price_buy REAL NOT NULL,
        price_sell REAL NOT NULL,
        stock INTEGER DEFAULT NULL,
        stock_danger INTEGER DEFAULT NULL,
        created_at TEXT
      );
    `);

    // Orders table
    db.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL
      );
    `);

    // Product snapshots taken when order is placed
    db.run(`
      CREATE TABLE IF NOT EXISTS products_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER,
        name TEXT,
        price_buy REAL,
        price_sell REAL,
        quantity INTEGER NOT NULL,
        created_at TEXT
      );
    `);

    // Order-product links (via snapshot)
    db.run(`
      CREATE TABLE IF NOT EXISTS products_orders (
        order_id INTEGER NOT NULL,
        product_id INTEGER,
        snapshot_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        PRIMARY KEY (order_id, snapshot_id),
        FOREIGN KEY(order_id) REFERENCES orders(id),
        FOREIGN KEY(snapshot_id) REFERENCES products_snapshots(id)
      );
    `);

    // Borrowers
    db.run(`
      CREATE TABLE IF NOT EXISTS borrowers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        date TEXT NOT NULL,
        amount REAL NOT NULL
      );
    `);

    // Order snapshots
    db.run(`
      CREATE TABLE IF NOT EXISTS orders_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_order_id INTEGER,
        borrower_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        total_price REAL NOT NULL
      );
    `);

    // Products of an order snapshot
    db.run(`
      CREATE TABLE IF NOT EXISTS orders_snapshots_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_snapshot_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        price_sell REAL NOT NULL,
        quantity INTEGER NOT NULL,
        FOREIGN KEY(order_snapshot_id) REFERENCES orders_snapshots(id)
      );
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS import_id_table (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        drive_id TEXT NOT NULL
        
      );
    `);

    console.log("📦 All tables created successfully.");
    
  } catch (error) {
    console.error("❌ Error creating tables:", error);
    throw error;
  }
}

// 💾 Save the database to IndexedDB
export async function saveDb() {
  if (!db) return;

  return new Promise((resolve, reject) => {
    try {
      const binary = db.export();
      const request = indexedDB.open('MyAppDB', 1);

      request.onupgradeneeded = e => {
        const idb = e.target.result;
        if (!idb.objectStoreNames.contains('datastore')) {
          idb.createObjectStore('datastore', { keyPath: 'id' });
        }
      };

      request.onsuccess = e => {
        const idb = e.target.result;
        const tx = idb.transaction('datastore', 'readwrite');
        const store = tx.objectStore('datastore');
        
        store.put({ 
          id: 'main', 
          data: binary, 
          timestamp: Date.now(),
          version: '1.0'
        });
        
        tx.oncomplete = () => {
          console.log("📂 DB saved to IndexedDB.");
          resolve();
        };
        
        tx.onerror = () => {
          reject(new Error('Failed to save to IndexedDB'));
        };
      };

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

    } catch (error) {
      reject(error);
    }
  });
}

// 📥 Load the database from IndexedDB
function loadFromIndexedDB(SQL) {
  return new Promise((resolve) => {
    const request = indexedDB.open('MyAppDB', 1);

    request.onupgradeneeded = e => {
      const idb = e.target.result;
      if (!idb.objectStoreNames.contains('datastore')) {
        idb.createObjectStore('datastore', { keyPath: 'id' });
      }
    };

    request.onsuccess = e => {
      const idb = e.target.result;
      const tx = idb.transaction('datastore', 'readonly');
      const store = tx.objectStore('datastore');
      const get = store.get('main');

      get.onsuccess = () => {
        if (get.result?.data) {
          try {
            const loadedDb = new SQL.Database(get.result.data);
            console.log("📥 Database loaded from IndexedDB");
            resolve(loadedDb);
          } catch (error) {
            console.error("Error creating database from IndexedDB data:", error);
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };

      get.onerror = () => {
        resolve(null);
      };
    };

    request.onerror = () => {
      resolve(null);
    };
  });
}

