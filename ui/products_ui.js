// ui/products_ui.js
import {
  getProducts,
  countProducts,
  addProduct,
  addProductWithId,
  updateProduct,
  deleteProduct,
  getProductById,
  searchProducts,
  getProductStatistics,
} from '../js/products.js';

// --- Module-level State ---
let showingLowStock = false;
let currentPage = 0;
const limit = 5;
let currentSort = { type: 'created_at', ascending: false };
let isScanModeActive = false;
let barcodeBuffer = '';
let barcodeTimer = null;
const SCAN_TIMEOUT_MS = 800; // Time to wait for the next digit

/**
 * Main entry point function. Sets up all UI elements and loads initial data.
 */
export async function setupProductUI() {
  await loadProductUI();
  setupEventListeners();
}

/**
 * Centralizes all event listener attachments for clarity.
 */
function setupEventListeners() {
  // Main Action Buttons
  document.getElementById('scanModeBtn')?.addEventListener('click', toggleScanMode);
  document.getElementById('addProductBtn')?.addEventListener('click', () => showModal('Add New Product', handleAddProduct, {}));
  document.getElementById('closeModal')?.addEventListener('click', hideModal);
  document.getElementById('searchInput')?.addEventListener('input', handleSearchInput);
  
  // Sorting Buttons
  document.getElementById('sortByPriceBtn')?.addEventListener('click', () => sortAndRenderProducts('price_sell'));
  document.getElementById('sortByNameBtn')?.addEventListener('click', () => sortAndRenderProducts('name'));
  document.getElementById('sortByStockBtn')?.addEventListener('click', handleStockSort);
  
  // Other Features
  setupProductStatsButton();
  document.addEventListener('keydown', handleGlobalKeyPress);
}


// --- Barcode Scanning Logic ---

function toggleScanMode() {
  isScanModeActive = !isScanModeActive;
  const feedback = document.getElementById('scanner-feedback');
  const scanBtn = document.getElementById('scanModeBtn');
  const searchInput = document.getElementById('searchInput');
  barcodeBuffer = ''; // Always clear buffer when toggling

  if (isScanModeActive) {
    feedback.textContent = 'SCAN MODE ACTIVE: Start typing barcode... (Press Esc to cancel)';
    feedback.classList.remove('hidden');
    scanBtn.textContent = '🔴 Cancel Scan';
    if (searchInput) searchInput.disabled = true;
  } else {
    feedback.classList.add('hidden');
    scanBtn.textContent = '📠 Scan Barcode';
    if (searchInput) searchInput.disabled = false;
  }
}

function handleGlobalKeyPress(e) {
  if (!isScanModeActive) return;

  if (e.key === 'Escape') { toggleScanMode(); return; }
  if (e.key === 'Enter') { e.preventDefault(); processBarcodeBuffer(); return; }
  if (!/^\d$/.test(e.key)) { return; }
  
  e.preventDefault();
  barcodeBuffer += e.key;
  document.getElementById('scanner-feedback').textContent = `Scanning: ${barcodeBuffer}`;
  clearTimeout(barcodeTimer);
  barcodeTimer = setTimeout(processBarcodeBuffer, SCAN_TIMEOUT_MS);
}

function processBarcodeBuffer() {
  if (barcodeBuffer.length === 0) return;
  const scannedId = Number(barcodeBuffer);
  const bufferCopy = barcodeBuffer; // Copy buffer before resetting
  barcodeBuffer = '';
  
  console.log(`📠 Processing scanned barcode: ${bufferCopy}`);
  handleBarcodeScan(scannedId);
  
  // Deactivate scan mode after each attempt to prevent accidental re-scans
  if (isScanModeActive) { toggleScanMode(); }
}

async function handleBarcodeScan(scannedId) {
  if (isNaN(scannedId) || scannedId === 0) return;

  const product = await getProductById(scannedId);

  if (product) {
    // MODIFIED SELECTOR: from 'li' to 'tr'
    const productElement = document.querySelector(`tr[data-product-id='${scannedId}']`);
    
    if (productElement) {
      productElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      productElement.classList.add('highlight');
      setTimeout(() => productElement.classList.remove('highlight'), 2500);
    } else {
      alert(`✅ Product Found (not on current page):\n\nName: ${product.name}\nID: ${product.id}\nPrice: ${product.price_sell} DA`);
    }
  } else {
    if (confirm(`⚠️ Product with barcode "${scannedId}" not found. Would you like to add it?`)) {
        showModal('Add New Product (from Scan)', handleAddProductWithId, { id: scannedId });
    }
  }
}


// --- Data Loading & Rendering ---

async function loadProductUI() {
  const productContainer = document.getElementById('productContainer'); // We'll use a container div
  if (!productContainer) return;

  productContainer.innerHTML = '<p>Loading products...</p>'; // Show loading message
  
  const offset = currentPage * limit;
  
  const products = await getProducts({
    limit,
    offset,
    sortBy: currentSort.type,
    ascending: currentSort.ascending,
    lowStockOnly: showingLowStock
  });

  renderProductList(products); // This function will now render the table
  
  const total = await countProducts();
  renderPagination(total);
}

function renderProductList(products) {
  const productContainer = document.getElementById('productContainer');
  productContainer.innerHTML = ''; // Clear the container

  if (products.length === 0) {
    productContainer.innerHTML = '<p>No products match your criteria.</p>';
    return;
  }

  // Create the table and its header
  const table = document.createElement('table');
  table.className = 'product-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Product Name</th>
        
        <th>Buy Price</th>
        <th>Sell Price</th>
        <th>Stock</th>
        <th>danger</th>
        <th>Actions</th>
      </tr>
    </thead>
  `;

  // Create the table body
  const tbody = document.createElement('tbody');
  products.forEach(product => {
    const tr = document.createElement('tr');
    tr.dataset.productId = product.id; // Important for scan highlighting

    tr.innerHTML = `
      <td data-label="Product Name"><strong>${product.name}</strong></td>
      
      <td data-label="Buy Price">${product.price_buy ?? '-'} DA</td>
      <td data-label="Sell Price">${product.price_sell ?? '-'} DA</td>
      <td data-label="Stock">${product.stock ?? '-'}</td>
      <td data-label="Danger Level">${product.stock_danger ?? '-'}</td>
      <td data-label="Actions">
        <div class="product-actions">
          <button data-id="${product.id}" class="edit-btn">✏️</button>
          <button data-id="${product.id}" class="delete-btn">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  productContainer.appendChild(table);

  // Re-attach listeners for the new buttons
  setupProductEditDeleteButtons();
}

function setupProductEditDeleteButtons() {
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.onclick = async (e) => {
      const id = Number(e.currentTarget.dataset.id);
      if (confirm(`🗑️ Are you sure you want to delete product #${id}?`)) {
        await deleteProduct(id);
        await loadProductUI();
      }
    };
  });

  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.onclick = async (e) => {
      const id = Number(e.currentTarget.dataset.id);
      const product = await getProductById(id);
      if (product) {
        showModal('Edit Product', handleUpdateProduct, product);
      } else {
        alert("⚠️ Product not found.");
      }
    };
  });
}


// --- UI Handlers (Modal, Pagination, Sort, Search) ---

function showModal(title, onSubmit, prefill = {}) {
    const modal = document.getElementById('productModal');
    document.getElementById('modalTitle').textContent = title;
    const modalBody = document.getElementById('modalBody');

    const barcodeField = prefill.id
      ? `<label>Barcode (ID): <input id="barcode" value="${prefill.id}" readonly /></label><br/>`
      : '';

    modalBody.innerHTML = `
        ${barcodeField}
        <label>Name: <input id="name" value="${prefill.name ?? ''}" required /></label><br/>
        <label>Buying Price: <input id="price_buy" type="number" step="0.01" value="${prefill.price_buy ?? ''}" /></label><br/>
        <label>Selling Price: <input id="price_sell" type="number" step="0.01" value="${prefill.price_sell ?? ''}" /></label><br/>
        <label>Stock: <input id="stock" type="number" value="${prefill.stock ?? ''}" /></label><br/>
        <label>Stock Danger: <input id="stock_danger" type="number" value="${prefill.stock_danger ?? ''}" /></label><br/>
        <button id="submitModal">Submit</button>
    `;
    modal.classList.remove('hidden');

    document.getElementById('submitModal').onclick = async () => {
        const values = {
            name: document.getElementById('name').value.trim(),
            price_buy: parseFloat(document.getElementById('price_buy').value) || 0,
            price_sell: parseFloat(document.getElementById('price_sell').value) || 0,
            stock: parseInt(document.getElementById('stock').value, 10) || null,
            stock_danger: parseInt(document.getElementById('stock_danger').value, 10) || null
        };
        if (!values.name) {
            alert("Name is required.");
            return;
        }
        await onSubmit(prefill, values);
        hideModal();
        await loadProductUI();
    };
}

function hideModal() {
  document.getElementById('productModal').classList.add('hidden');
}

// --- Action Handlers (Passed to onSubmit) ---

async function handleAddProduct(prefill, values) {
  await addProduct(values.name, values.price_buy, values.price_sell, values.stock, values.stock_danger);
}

async function handleAddProductWithId(prefill, values) {
  await addProductWithId(prefill.id, values.name, values.price_buy, values.price_sell, values.stock, values.stock_danger);
}

async function handleUpdateProduct(prefill, values) {
  await updateProduct(prefill.id, values);
}

async function handleSearchInput(e) {
  const keyword = e.target.value.trim();
  currentPage = 0;
  if (keyword === '') {
    await loadProductUI();
  } else {
    // FIX: Removed unnecessary `await` as `searchProducts` is a synchronous function.
    const results = searchProducts(keyword, { limit: 100 });
    renderProductList(results);
    const pagination = document.getElementById('pagination-container');
    if (pagination) pagination.remove();
  }
}

async function handleStockSort() {
  const btn = document.getElementById('sortByStockBtn');
  showingLowStock = !showingLowStock;
  btn.textContent = showingLowStock ? '✅ Showing Low Stock' : '⚠️ Sort by Low Stock';
  currentSort = { type: 'stock', ascending: true };
  currentPage = 0;
  await loadProductUI();
}

async function sortAndRenderProducts(type) {
  if (currentSort.type === type) {
    currentSort.ascending = !currentSort.ascending;
  } else {
    currentSort = { type, ascending: true };
  }
  showingLowStock = false;
  document.getElementById('sortByStockBtn').textContent = '⚠️ Sort by Low Stock';
  currentPage = 0;
  await loadProductUI();
}

function renderPagination(totalCount) {
  // First, remove the old pagination if it exists
  let pagination = document.getElementById('pagination-container');
  if (pagination) pagination.remove();

  const totalPages = Math.ceil(totalCount / limit);
  if (totalPages <= 1) return; // Don't show pagination for a single page

  // Create the container for the buttons
  pagination = document.createElement('div');
  pagination.id = 'pagination-container';
  pagination.style.marginTop = '20px';

  // "Previous" button
  if (currentPage > 0) {
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '⬅️ Prev';
    prevBtn.onclick = () => { currentPage--; loadProductUI(); };
    pagination.appendChild(prevBtn);
  }

  // "Page X of Y" text
  const pageInfo = document.createElement('span');
  pageInfo.textContent = ` Page ${currentPage + 1} of ${totalPages} `;
  pageInfo.style.margin = "0 10px";
  pagination.appendChild(pageInfo);

  // "Next" button
  if (currentPage < totalPages - 1) {
    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next ➡️';
    nextBtn.onclick = () => { currentPage++; loadProductUI(); };
    pagination.appendChild(nextBtn);
  }
  
  // *** THE FIX IS HERE ***
  // Find the new container to place the pagination after it.
  const productContainer = document.getElementById('productContainer');
  if (productContainer) {
    productContainer.insertAdjacentElement('afterend', pagination);
  }
}


// --- Statistics ---

function createOverlay(html) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="overlay-content">${html}<button id="closeStatsOverlay">❌ Close</button></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeStatsOverlay').onclick = () => overlay.remove();
}

export async function setupProductStatsButton() {
  const btn = document.getElementById('productStatsBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const stats = await getProductStatistics();
    if (!stats) {
      alert("Could not calculate statistics.");
      return;
    }

    // Format numbers for better readability
    const formatCurrency = (num) => `${(num || 0).toFixed(2)} DA`;

    const html = `
      <h2>📦 Product Statistics</h2>
      
      <h3>Inventory Summary</h3>
      <ul>
        <li><strong>Total Unique Products:</strong> ${stats.totalProducts}</li>
        <li><strong>Total Items Sold (All Time):</strong> ${stats.totalQuantity}</li>
        <li><strong>Current Stock Value (Buy Price):</strong> ${formatCurrency(stats.stockValueBuy)}</li>
        <li><strong>Potential Revenue (Sell Price):</strong> ${formatCurrency(stats.stockValueSell)}</li>
      </ul>

      <h3>Sales Performance</h3>
      <ul>
        <li><strong>Total Profit (All Time):</strong> <strong style="color: ${stats.totalProfit >= 0 ? 'green' : 'red'};">${formatCurrency(stats.totalProfit)}</strong></li>
        <li><strong>Most Sold Product:</strong> ${stats.mostSold[0]} (${stats.mostSold[1]} units)</li>
        <li><strong>Least Sold Product:</strong> ${stats.leastSold[0]} (${stats.leastSold[1]} units)</li>
        <li><strong>Top Revenue Product:</strong> ${stats.topRevenue[0]} (${formatCurrency(stats.topRevenue[1])} revenue)</li>
      </ul>
    `;
    createOverlay(html);
  });
}