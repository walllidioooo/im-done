// ui/borrowers_ui.js
import {
  getBorrowers,
  getSnapshotOrdersForBorrower,
  updateBorrowerAmountDirect,
  deleteBorrower,
  countBorrowers,
} from '../js/borrowers.js';

// --- Module-level State ---
let currentSort = { field: 'date', direction: 'desc' };
let currentPage = 0;
const limit = 5;
let currentSearchTerm = '';
let allOrdersCache = new Map();

/**
 * Main entry point. Sets up event listeners and renders the initial list.
 */
export async function setupBorrowersUI() {
  setupPersistentEventListeners();
  await renderBorrowersList();
}

// A flag to ensure listeners are only attached once
let listenersAttached = false;

function setupPersistentEventListeners() {
  if (listenersAttached) return;

  // Sorting
  document.getElementById('sortByDateBtn').addEventListener('click', () => {
    setSort('date');
    renderBorrowersList();
  });
  document.getElementById('sortByAmountBtn').addEventListener('click', () => {
    setSort('amount');
    renderBorrowersList();
  });

  // Live search
  document.getElementById('searchBorrowerInput').addEventListener('input', (e) => {
    currentSearchTerm = e.target.value.trim();
    currentPage = 0;
    renderBorrowersList();
  });

  // Event delegation for the main container
  document.getElementById('borrowersContainer').addEventListener('click', handleContainerClick);

  // Modal close button
  document.getElementById('closeModal')?.addEventListener('click', hideModal);

  listenersAttached = true;
}

/**
 * Handles all clicks within the borrowers container using event delegation.
 */
async function handleContainerClick(e) {
  const target = e.target.closest('button'); // We only care about button clicks
  if (!target) return;

  // **FIX 2**: Handle "Show Products" button click first
  if (target.matches('.show-products-btn')) {
    const borrowerId = Number(target.dataset.borrowerId);
    const orderId = Number(target.dataset.orderId);
    if (borrowerId && orderId) {
        toggleProductsDisplay(borrowerId, orderId, target);
    }
    return; // Stop processing
  }
  
  // Now, handle actions on the main borrower row
  const borrowerRow = target.closest('tr:not(.details-row)');
  if (!borrowerRow) return;

  const borrowerId = Number(borrowerRow.dataset.id);
  if (!borrowerId) return;

  if (target.matches('.show-orders-btn')) {
    toggleOrdersDisplay(borrowerId, borrowerRow, target);
  } else if (target.matches('.edit-borrower-btn')) {
    const name = borrowerRow.dataset.name;
    const amount = parseFloat(borrowerRow.dataset.amount);
    handleEditAmount(borrowerId, name, amount);
  } else if (target.matches('.delete-borrower-btn')) {
    handleDeleteBorrower(borrowerId);
  }
}

/**
 * Replaces prompt() with a user-friendly modal for editing amount.
 */
function handleEditAmount(borrowerId, name, currentAmount) {
    showModal(`Edit Debt for: ${name}`, { id: borrowerId, amount: currentAmount }, async (values) => {
        await updateBorrowerAmountDirect(borrowerId, values.amount);
        await renderBorrowersList();
    });
}

async function handleDeleteBorrower(borrowerId) {
    if (confirm("Are you sure you want to delete this borrower and all their history? This cannot be undone.")) {
        await deleteBorrower(borrowerId);
        await renderBorrowersList();
    }
}

function setSort(field) {
  currentSort.field = field;
  currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  currentPage = 0;
}

function updateSortLabels() {
  ['sortByDateBtn', 'sortByAmountBtn'].forEach(id => {
    const btn = document.getElementById(id);
    btn.style.fontWeight = 'normal';
    btn.textContent = btn.textContent.replace(/ [↑↓]/, '');
  });

  const arrow = currentSort.direction === 'asc' ? ' ↑' : ' ↓';
  const btnId = currentSort.field === 'date' ? 'sortByDateBtn' : 'sortByAmountBtn';
  const activeBtn = document.getElementById(btnId);
  activeBtn.textContent += arrow;
  activeBtn.style.fontWeight = 'bold';
}

/**
 * Fetches and renders the paginated table of borrowers.
 */
async function renderBorrowersList() {
  const container = document.getElementById('borrowersContainer');
  container.innerHTML = '<p>Loading borrowers...</p>';
  updateSortLabels();

  const offset = currentPage * limit;
  const borrowers = await getBorrowers(currentSearchTerm, currentSort.field, currentSort.direction === 'asc', limit, offset);
  
  container.innerHTML = ''; // Clear loading message

  if (borrowers.length === 0 && currentPage === 0) {
    container.innerHTML = '<p>No borrowers found.</p>';
    renderPagination(0);
    return;
  }
  
  const table = document.createElement('table');
  table.className = 'borrower-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Name</th>
        <th>Total Debt</th>
        <th>Borrower Since</th>
        <th>Actions</th>
      </tr>
    </thead>
  `;
  const tbody = document.createElement('tbody');

  borrowers.forEach(b => {
    const tr = document.createElement('tr');
    tr.dataset.id = b.id;
    tr.dataset.name = b.name; // Store for modal
    tr.dataset.amount = b.amount; // Store for modal

    // **FIX 3**: Added text labels to the action buttons
    tr.innerHTML = `
      <td data-label="Name"><strong>${b.name}</strong></td>
      <td data-label="Total Debt">${b.amount.toFixed(2)} DA</td>
      <td data-label="Borrower Since">${new Date(b.date).toLocaleDateString()}</td>
      <td data-label="Actions">
        <div class="table-actions">
          <button class="show-orders-btn">📦 Orders</button>
          <button class="edit-borrower-btn">✏️ Edit</button>
          <button class="delete-borrower-btn">🗑️ Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  table.appendChild(tbody);
  container.appendChild(table);

  const totalCount = countBorrowers(currentSearchTerm);
  renderPagination(totalCount);
}

/**
 * Toggles an expandable row below the borrower to show order details.
 */
async function toggleOrdersDisplay(borrowerId, borrowerRow, button) {
  const existingDetailsRow = borrowerRow.nextElementSibling;
  if (existingDetailsRow && existingDetailsRow.classList.contains('details-row')) {
    existingDetailsRow.remove();
    button.innerHTML = '📦 Orders'; // Reset button text
    return;
  }
  
  button.innerHTML = '🔼 Hide'; // Change button text
  
  const detailsRow = document.createElement('tr');
  detailsRow.className = 'details-row';
  const detailsCell = document.createElement('td');
  detailsCell.colSpan = 4; // Span all columns
  detailsCell.innerHTML = '<p>Loading orders...</p>';
  detailsRow.appendChild(detailsCell);
  borrowerRow.insertAdjacentElement('afterend', detailsRow);
  
  const orders = await getSnapshotOrdersForBorrower(borrowerId);
  allOrdersCache.set(borrowerId, orders);
  
  if (orders.length === 0) {
    detailsCell.innerHTML = `<em>No historical orders found for this borrower.</em>`;
  } else {
    // **FIX 2**: Add data-borrower-id to the "Show Products" button
    detailsCell.innerHTML = `
      <h4>Order History</h4>
      <div class="orders-container">
        ${orders.map(order => `
          <div class="order-box">
            <span>🧾 Order #${order.order_id} (${new Date(order.order_date).toLocaleString()}) - <strong>Total: ${order.total_price.toFixed(2)} DA</strong></span>
            <br/>
            <button class="show-products-btn" data-order-id="${order.order_id}" data-borrower-id="${borrowerId}">👁️ Show Products</button>
            <div class="products-container" style="display: none;"></div>
          </div>
        `).join('')}
      </div>`;
  }
}

function toggleProductsDisplay(borrowerId, orderId, button) {
  const container = button.nextElementSibling;
  const isVisible = container.style.display !== 'none';

  if (isVisible) {
    container.style.display = 'none';
    button.textContent = '👁️ Show Products';
  } else {
    container.style.display = 'block';
    button.textContent = '🔼 Hide Products';
    const orders = allOrdersCache.get(borrowerId);
    const order = orders?.find(o => o.order_id === orderId);
    const products = order?.products || [];

    if (products.length === 0) {
      container.innerHTML = `<em>No products found in this snapshot.</em>`;
    } else {
      container.innerHTML = products.map(p => 
        `🛒 ${p.name} (Qty: ${p.quantity}) @ ${p.price_sell.toFixed(2)} DA`
      ).join('<br/>');
    }
  }
}

function renderPagination(totalCount) {
  const container = document.getElementById('pagination-container');
  container.innerHTML = '';
  const totalPages = Math.ceil(totalCount / limit);

  if (totalPages <= 1) return;

  const prev = document.createElement('button');
  prev.textContent = '⬅️ Prev';
  prev.disabled = currentPage === 0;
  prev.onclick = () => { currentPage--; renderBorrowersList(); };
  container.appendChild(prev);

  container.appendChild(document.createElement('span')).textContent = `Page ${currentPage + 1} of ${totalPages}`;

  const next = document.createElement('button');
  next.textContent = 'Next ➡️';
  next.disabled = currentPage >= totalPages - 1;
  next.onclick = () => { currentPage++; renderBorrowersList(); };
  container.appendChild(next);
}

// --- Modal Functions ---
function showModal(title, prefill, onSubmit) {
    const modal = document.getElementById('borrowerModal');
    document.getElementById('modalTitle').textContent = title;
    const modalBody = document.getElementById('modalBody');

    modalBody.innerHTML = `
        <label for="amount">New Total Debt Amount (DA):</label>
        <input id="amount" type="number" step="0.01" value="${prefill.amount ?? ''}" required />
        <button id="submitModal">Update Amount</button>
    `;
    modal.classList.remove('hidden');
    document.getElementById('amount').focus();

    document.getElementById('submitModal').onclick = async () => {
        const newAmount = parseFloat(document.getElementById('amount').value);
        if (isNaN(newAmount) || newAmount < 0) {
            alert("Please enter a valid, non-negative amount.");
            return;
        }
        await onSubmit({ amount: newAmount });
        hideModal();
    };
}

function hideModal() {
  document.getElementById('borrowerModal').classList.add('hidden');
}