// ui/orders_ui.js
import {
  getOrdersWithTotal,
  getProductsInOrder,
  deleteOrder,
  countOrders,
  addOrder,
  getOrderStatistics,
  countProductsInOrder,
} from '../js/orders.js';
import {
  getProducts,
  searchProducts,
  countProducts,
  getProductById,
} from '../js/products.js';
// Re-add all necessary borrower functions
import {
  getBorrowers,
  addBorrower,
  linkOrderToBorrower,
  countBorrowers,
} from '../js/borrowers.js';

// --- Module-level State ---
let ordersList;
let currentPage = 0;
const limit = 20;
let currentSort = { field: 'date', direction: 'desc' };


let borrowerPickerPage = 0;
const borrowerPickerLimit = 9; // Show 5 borrowers per page
// --- Add Order Modal State ---
let isFirstLoad = true;
const selectedProductsMap = new Map();
let productPickerPage = 0;
const productPickerLimit = 30;

// --- Barcode Scanning (in Modal) State ---
let isScanModeActiveInModal = false;
let barcodeBuffer = '';
let barcodeTimer = null;
const SCAN_TIMEOUT_MS = 500;


let calculatorTargetProductId = null;
let calculatorInputBuffer = '';
/**
 * Main entry point for the Orders UI.
 */
let focusedPickerItemId = null; // Tracks focused product in picker
let focusedCartItemId = null; // Tracks focused product in cart

const style = document.createElement('style');
style.textContent = `
/* Enhanced Modal Layout for Fixed Submit Button */
.modal-content {
  display: flex;
  flex-direction: column;
  gap: 15px;
  max-height: 90vh;
  overflow: hidden;
}

.modal-scrollable {
  flex: 1;
  overflow-y: auto;
  padding: 0 5px;
}

/* Subtle Beautification for Sections */
.selected-products-section,
.product-picker-section {
  border: 1px solid #e9ecef;
  border-radius: 8px;
  background: #fafafa;
  padding: 15px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
  .order-card {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    padding: 16px;
    margin-bottom: 16px;
    border-left: 4px solid #4CAF50;
    transition: transform 0.2s;
  }
  
  .order-card.borrowed {
    border-left-color: #FFC107;
  }
  
  .order-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #eee;
  }
  
  .order-id {
    font-weight: bold;
    color: #333;
    font-size: 1.1rem;
  }
  
  .order-date {
    color: #666;
    font-size: 0.9rem;
  }
  
  .order-stats {
    display: flex;
    gap: 20px;
    margin-bottom: 12px;
  }
  
  .stat-item {
    display: flex;
    flex-direction: column;
  }
  
  .stat-label {
    font-size: 0.8rem;
    color: #666;
    text-transform: uppercase;
  }
  
  .stat-value {
    font-weight: bold;
    font-size: 1.1rem;
  }
  
  .positive {
    color: #4CAF50;
  }
  
  .negative {
    color: #F44336;
  }
  
  .borrowed-badge {
    background: #FFC107;
    color: #333;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: bold;
    margin-left: 8px;
  }
  
  .order-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  
  .order-actions button {
    padding: 8px 12px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  .btn-show-products {
    background: #2196F3;
    color: white;
  }
  
  .btn-link-borrower {
    background: #9C27B0;
    color: white;
  }
  
  .btn-delete {
    background: #F44336;
    color: white;
  }
  
  .products-container {
    margin-top: 12px;
    padding: 12px;
    background: #f9f9f9;
    border-radius: 4px;
  }
  
  .products-container ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  
  .products-container li {
    padding: 8px 0;
    border-bottom: 1px solid #eee;
    display: flex;
    justify-content: space-between;
  }
`;
document.head.appendChild(style);
style.textContent += `
  .products-list {
    width: 100%;
    border-collapse: collapse;
  }
  
  .product-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid #eee;
  }
  
  .product-name {
    font-weight: 500;
    color: #333;
    flex: 2;
  }
  
  .product-qty {
    color: #666;
    font-size: 0.9em;
    flex: 1;
    text-align: center;
  }
  
  .product-price {
    font-weight: bold;
    color: #2196F3;
    flex: 1;
    text-align: right;
  }
  
  .product-subtotal {
    font-weight: bold;
    color: #4CAF50;
    flex: 1;
    text-align: right;
  }
  
  .product-header {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 2px solid #ddd;
    font-weight: bold;
    text-transform: uppercase;
    font-size: 0.8em;
    color: #666;
  }
  
  .product-header span {
    flex: 1;
  }
  
  .product-header .product-name {
    flex: 2;
  }
`;
// Add to your existing style element
// Replace existing borrower card styles with:
style.textContent += `
  /* Minimalist Borrower Matrix */
  .borrower-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 12px;
    margin: 20px 0;
  }

  .borrower-card {
    background: white;
    border-radius: 4px;
    padding: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    border-left: 4px solid #9C27B0; /* Only colored element */
    transition: all 0.2s ease;
    cursor: pointer;
    display: flex;
    flex-direction: column;
  }

  .borrower-card:hover {
    box-shadow: 0 2px 6px rgba(0,0,0,0.15);
  }

  .borrower-name {
    font-weight: 500;
    color: #333; /* Neutral dark gray */
    font-size: 0.9rem;
    margin-bottom: 4px;
    line-height: 1.3;
  }

  .borrower-meta {
    font-size: 0.75rem;
    color: #666; /* Neutral medium gray */
  }

  /* Responsive adjustments */
  @media (max-width: 1200px) {
    .borrower-grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  @media (max-width: 900px) {
    .borrower-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (max-width: 600px) {
    .borrower-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
`;
























style.textContent += `
  .borrower-initial {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 2px solid #9C27B0; /* Purple circle */
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 8px;
    font-weight: bold;
    color: #333; /* Dark text */
    font-size: 1.2rem;
  }
`;
// Add to your existing style element
style.textContent += `/* =================================================================== */
/* === STYLES FOR ADD/EDIT ORDER MODAL & FLOATING CALCULATOR KEYPAD === */
/* =================================================================== */

/* --- Modal Base Layout --- */
.order-modal-header {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 0 5px 15px 5px;
  border-bottom: 1px solid #e9ecef;
  margin-bottom: 15px;
}
#productSearchInput {
  flex-grow: 1;
  padding: 12px 15px;
  font-size: 1rem;
  border: 1px solid #ccc;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  caret-color: #28a745; /* Green cursor to match scan mode */
}

#productSearchInput:focus {
  border-color: #28a745; /* Green border on focus to match scan mode */
  box-shadow: 0 0 5px rgba(40, 167, 69, 0.3); /* Subtle green glow */
}

#productSearchInput.scan-active {
  background-color: #f0fff4; /* Very light green background when scan mode is active */
  border-color: #28a745;
}

#scanModeInModalBtn {
  padding: 10px 15px;
  font-size: 0.95rem;
  font-weight: 500;
  border-radius: 8px;
  border: 1px solid transparent;
  background-color: #e9ecef;
  color: #343a40;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.2s, color 0.2s, box-shadow 0.2s, transform 0.1s;
}

#scanModeInModalBtn.active {
  background-color: #28a745;
  color: white;
  box-shadow: 0 0 8px rgba(40, 167, 69, 0.4);
  transform: scale(1.05);
}

#scanModeInModalBtn:hover {
  background-color: #d5d8dc; /* Slightly darker gray for inactive hover */
}

#scanModeInModalBtn.active:hover {
  background-color: #218838; /* Darker green for active hover */
}
/* Scan Feedback Container */
#scanFeedback {
  width: 100%;
  background-color: #28a745;
  color: white;
  padding: 10px 15px;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 500;
  text-align: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-bottom: 15px;
  display: none; /* Hidden by default, controlled by .hidden class */
}

#scanFeedback:not(.hidden) {
  display: block; /* Show when not hidden */
}  

/* --- Main Content Grid (Selected vs. Picker) --- */
.order-modal-content {
  display: grid;
  grid-template-columns: 1.2fr 1fr; /* Cart (left, wider), Products (right) */
  gap: 25px;
  max-height: auto; /* Remove fixed height; scrolling handled by .modal-scrollable */
  overflow-y: visible;
  padding: 5px;
}

/* --- Sections (Selected Products & Product Picker) --- */
.selected-products-section,
.product-picker-section {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.selected-products-section h3,
.product-picker-section h3 {
  margin: 0;
  font-size: 1.2rem;
  color: #333;
}

/* --- Selected Products List --- */
/* --- Selected Products List --- */
/* --- Selected Products List --- */
#selectedProductsContainer {
  max-height: 300px; /* Limit height to enable scrolling */
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 100px;
  scroll-behavior: smooth;
}
.selected-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background-color: #fff;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  cursor: pointer;
  transition: box-shadow 0.2s, border-color 0.2s;
}

.selected-item:hover {
  border-color: #9C27B0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.07);
}

.selected-item.targeted { /* Style for the calculator's target */
  border-color: #9C27B0;
  box-shadow: 0 2px 8px rgba(156, 39, 176, 0.3);
}

.selected-item > span {
  font-weight: 500;
}

.item-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}
  /* Focused Cart Item */
.selected-item.focused {
  border: 2px solid #28a745;
  background-color: #e6fffa;
  box-shadow: 0 0 8px rgba(40, 167, 69, 0.4);
  outline: none;
}
/* Stock Info */
.stock-info {
  font-size: 0.85rem;
  color: #6c757d;
  margin-left: 8px;
  font-style: italic;
}

/* Quantity Controls (+/- Buttons) */
.qty-minus, .qty-plus {
  width: 35px;
  height: 35px;
  padding: 0;
  font-size: 1.2rem;
  background: #e9ecef;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.qty-minus:hover, .qty-plus:hover {
  background: #dee2e6;
}

.quantity-input {
  width: 50px;
  padding: 5px;
  text-align: center;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 1rem;
}
.item-controls .quantity-input {
  width: 55px;
  padding: 5px 8px;
  text-align: center;
  border-radius: 4px;
  border: 1px solid #ccc;
}

.item-controls .remove-item-btn {
  background: none;
  border: none;
  color: #c82333;
  font-size: 1.2rem;
  cursor: pointer;
}

#orderTotal {
  padding-bottom: 10px;
  border-bottom: 1px solid #e9ecef;
  text-align: right;
  font-size: 1.5rem;
  font-weight: bold;
  color: #333;
}

/* --- Product Picker List (Available products) --- */
#productListInModal {
  max-height: 300px; /* Limit height to enable scrolling */
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  scroll-behavior: smooth;
}

.picker-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background-color: #fff;
  border: 1px solid #e9ecef;
  border-radius: 8px;
}

.picker-item button {
  background-color: #e6f4ff;
  color: #007aff;
  border: none;
  border-radius: 50px;
  padding: 6px 12px;
  font-weight: 500;
  cursor: pointer;
}
  /* Focused Picker Item */
.picker-item.focused {
  border: 2px solid #28a745;
  background-color: #e6fffa;
  box-shadow: 0 0 8px rgba(40, 167, 69, 0.4);
  outline: none;
}

/* Ensure smooth scrolling for both containers */
#selectedProductsContainer {
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 100px;
  scroll-behavior: smooth;
}
#productListInModal {
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  scroll-behavior: smooth;
}

/* --- Floating Calculator Keypad --- */
.calculator-toggle-btn {
  position: absolute;
  bottom: 25px;
  right: 25px;
  z-index: 1001; /* Must be above the modal content */
  width: 55px;
  height: 55px;
  border-radius: 50%;
  background-color: #9C27B0;
  color: white;
  border: none;
  font-size: 24px;
  box-shadow: 0 4px 15px rgba(0,0,0,0.25);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.qty-calculator {
  position: absolute;
  bottom: 95px; /* Position above the toggle button */
  right: 25px;
  width: 220px; /* MODIFIED: Adjusted width for 3 columns */
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 5px 20px rgba(0,0,0,0.3);
  z-index: 1000;
  border: 1px solid #ddd;
  transition: transform 0.2s ease, opacity 0.2s ease;
  transform-origin: bottom right;
}

.qty-calculator.hidden {
  transform: scale(0.9);
  opacity: 0;
  pointer-events: none; /* Prevents interaction when hidden */
}

.calc-display-area {
  padding: 12px 15px;
  background-color: #343a40;
  color: white;
  text-align: right;
  border-top-left-radius: 11px;
  border-top-right-radius: 11px;
}

#calcHeader {
  font-size: 0.8rem;
  color: #adb5bd;
  text-align: left;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

#calcQtyDisplay {
  font-size: 2.5rem;
  font-weight: 700;
  min-height: 45px;
  line-height: 1;
}

.calc-keypad {
  display: grid;
  /* MODIFIED: Changed from 4 to 3 columns */
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background-color: #e0e0e0; /* This creates the grid lines */
}

.calc-btn {
  padding: 16px 0;
  font-size: 1.2rem;
  font-weight: 500;
  border: none;
  background-color: #fff;
  cursor: pointer;
  transition: background-color 0.15s;
  /* ADDED: Ensures perfect centering */
  display: flex;
  align-items: center;
  justify-content: center;
}

.calc-btn:hover {
  background-color: #f5f5f5;
}

.calc-btn.function {
  background-color: #e9ecef;
  font-weight: bold;
}

.calc-btn.confirm {
  background-color: #28a745;
  color: white;
  /* REMOVED: No longer spans multiple columns */
  font-weight: bold;
}
.calc-btn.confirm:hover {
  background-color: #218838;
}

/* --- Final Submit Button --- */
#submitOrderBtn {
  position: sticky;
  bottom: 0;
  width: 80%;
  padding: 14px;
  font-size: 1.1rem;
  font-weight: bold;
  color: white;
  background-color: #007aff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 -2px 5px rgba(0,0,0,0.1);
}

/* --- Responsive Adjustments for the Modal --- */
@media (max-width: 800px) {
  .order-modal-content {
    grid-template-columns: 1fr; /* Stack the columns on smaller screens */
    max-height: 70vh;
  }

  #orderTotal {
    font-size: 1.2rem;
  }
}
`;

export async function setupOrdersUI() {
  ordersList = document.getElementById('ordersList');
  if (!ordersList) return;

  setupGlobalEventListeners();
  await renderOrders(); // Initial render

  if (isFirstLoad) {
    showOrderModal();
    isFirstLoad = false;
  }
}


function setupGlobalEventListeners() {
    const safeAddListener = (id, event, handler) => {
        const element = document.getElementById(id);
        if (element) { element.addEventListener(event, handler); }
    };
    safeAddListener('addOrderBtn', 'click', showOrderModal);
    safeAddListener('showStatsBtn', 'click', showStatsModal);
    safeAddListener('sortByDateBtn', 'click', () => sortOrdersBy('date'));
    safeAddListener('sortByTotalBtn', 'click', () => sortOrdersBy('price_sell'));
    safeAddListener('sortByProfitBtn', 'click', () => sortOrdersBy('profit'));
    safeAddListener('closeModal', 'click', hideOrderModal);
    safeAddListener('closeBorrowerModal', 'click', hideBorrowerModal);
    safeAddListener('closeStatsModal', 'click', () => {
        const statsModal = document.getElementById('statsModal');
        if (statsModal) statsModal.classList.add('hidden');
    });
}
/**
 * Sets up listeners for static elements on the page.
 */


// =================================================================
// BORROWER MODAL LOGIC (NEW SECTION)
// =================================================================

/**
 * Shows the modal to link an order to a borrower.
 * @param {number} orderId The ID of the order to be linked.
 */
async function showBorrowerModal(orderId) {
    const modal = document.getElementById('borrowerModal');
    const body = document.getElementById('borrowerModalBody');
    const title = modal.querySelector('h2');
    
    title.textContent = `🔗 Link Order #${orderId} to Borrower`;
    
    // Set up the static HTML structure ONCE.
    body.innerHTML = `
        <input type="text" id="borrowerSearchInput" placeholder="🔍 Search borrowers..." style="width: 95%; padding: 8px; margin-bottom: 10px;">
        <div id="borrower-list-container"></div> <!-- Container for the dynamic list -->
        <hr>
        <h4>Or, Add a New Borrower & Link</h4>
        <div class="add-borrower-form">
            <input type="text" id="newBorrowerNameInput" placeholder="New Borrower's Name">
            <button id="addNewBorrowerAndLinkBtn">Add & Link</button>
        </div>
    `;

    // Attach listener to the persistent search bar ONCE.
    document.getElementById('borrowerSearchInput').addEventListener('input', (e) => {
        borrowerPickerPage = 0; // Reset page on new search
        renderBorrowerList(orderId, e.target.value); // Re-render ONLY the list
    });

    document.getElementById('addNewBorrowerAndLinkBtn').onclick = () => handleAddNewBorrowerAndLink(orderId);
    
    modal.classList.remove('hidden');
    
    borrowerPickerPage = 0;
    await renderBorrowerList(orderId, ''); // Initial render of the list
}

/**
 * Renders the content inside the borrower modal.
 * @param {number} orderId The ID of the order being linked.
 * @param {Array<Object>} borrowers The list of existing borrowers.
 */
async function renderBorrowerList(orderId, searchTerm = '') {
    const listContainer = document.getElementById('borrower-list-container');
    if (!listContainer) return;
    
    listContainer.innerHTML = '<div class="borrower-grid">Loading...</div>';

    try {
        const offset = borrowerPickerPage * borrowerPickerLimit;
        const borrowers = await getBorrowers(searchTerm, 'name', true, borrowerPickerLimit, offset);
        const totalBorrowers = await countBorrowers(searchTerm);
        
        let gridHtml = '<div class="borrower-grid">';
        
        if (borrowers.length === 0) {
            gridHtml += '<div style="grid-column: 1/-1; text-align: center; padding: 30px; color: #666;">No borrowers found</div>';
        } else {
            // In renderBorrowerList()
borrowers.forEach(b => {
  const initial = b.name.charAt(0).toUpperCase();
  gridHtml += `
    <div class="borrower-card" data-borrower-id="${b.id}">
      <div class="borrower-initial">${initial}</div>
      <div class="borrower-name">${b.name}</div>
      <div class="borrower-meta">Since ${new Date(b.date).toLocaleDateString()}</div>
    </div>
                `;
            });
        }
        
        gridHtml += '</div>';

        // Pagination controls
        const totalPages = Math.ceil(totalBorrowers / borrowerPickerLimit);
        if (totalPages > 1) {
            gridHtml += `
                <div class="pagination-controls">
                    <button id="borrowerPrevBtn" class="pagination-btn" ${borrowerPickerPage === 0 ? 'disabled' : ''}>
                        ← Previous
                    </button>
                    <span class="page-info">Page ${borrowerPickerPage + 1} of ${totalPages}</span>
                    <button id="borrowerNextBtn" class="pagination-btn" ${borrowerPickerPage + 1 >= totalPages ? 'disabled' : ''}>
                        Next →
                    </button>
                </div>
            `;
        }

        listContainer.innerHTML = gridHtml;
        
        // Attach click handlers to each card
        listContainer.querySelectorAll('.borrower-card').forEach(card => {
            card.addEventListener('click', () => {
                const borrowerId = Number(card.dataset.borrowerId);
                handleLinkToBorrower(orderId, borrowerId);
            });
        });

        // Pagination event listeners
        listContainer.querySelector('#borrowerPrevBtn')?.addEventListener('click', () => {
            borrowerPickerPage--;
            renderBorrowerList(orderId, searchTerm);
        });
        
        listContainer.querySelector('#borrowerNextBtn')?.addEventListener('click', () => {
            borrowerPickerPage++;
            renderBorrowerList(orderId, searchTerm);
        });

    } catch (error) {
        console.error("Failed to render borrower list:", error);
        listContainer.innerHTML = '<div class="borrower-grid" style="grid-column: 1/-1; text-align: center; padding: 30px; color: #666;">Error loading borrowers</div>';
    }
}

// Add this new function in the BORROWER MODAL LOGIC section
async function renderBorrowerPicker(orderId, searchTerm = '') {
    const body = document.getElementById('borrowerModalBody');
    body.innerHTML = '<p>Loading borrowers...</p>';

    try {
        const offset = borrowerPickerPage * borrowerPickerLimit;
        const borrowers = await getBorrowers(searchTerm, 'name', true, borrowerPickerLimit, offset);
        const totalBorrowers = await countBorrowers(searchTerm);
        
        renderBorrowerModalContent(orderId, borrowers, searchTerm, totalBorrowers);

    } catch (error) {
        console.error("Failed to render borrower picker:", error);
        body.innerHTML = '<p>Error loading borrowers. Please try again.</p>';
    }
}
// Replace the existing renderBorrowerModalContent function
function renderBorrowerModalContent(orderId, borrowers, searchTerm, totalBorrowers) {
    const body = document.getElementById('borrowerModalBody');
    
    body.innerHTML = `
      <div class="borrower-modal-container">
        <div class="borrower-search-container">
          <input type="text" id="borrowerSearchInput" class="borrower-search-input" 
                 placeholder="Search borrowers..." value="${searchTerm}">
        </div>
        
        <div class="borrower-list" id="borrower-list-container">
          ${borrowers.length === 0 ? 
            '<p style="text-align: center; color: #666;">No borrowers found</p>' : 
            borrowers.map(b => `
              <div class="borrower-card">
                <div class="borrower-info">
                  <div class="borrower-name">${b.name}</div>
                  <div class="borrower-meta">Joined: ${new Date(b.date).toLocaleDateString()}</div>
                </div>
                <button class="select-borrower-btn" data-borrower-id="${b.id}">
                  Select
                </button>
              </div>
            `).join('')
          }
        </div>
        
        ${totalBorrowers > borrowerPickerLimit ? `
          <div class="pagination-controls">
            <button id="borrowerPrevBtn" class="pagination-btn" ${borrowerPickerPage === 0 ? 'disabled' : ''}>
              Previous
            </button>
            <span class="page-info">Page ${borrowerPickerPage + 1} of ${Math.ceil(totalBorrowers / borrowerPickerLimit)}</span>
            <button id="borrowerNextBtn" class="pagination-btn" ${borrowerPickerPage + 1 >= Math.ceil(totalBorrowers / borrowerPickerLimit) ? 'disabled' : ''}>
              Next
            </button>
          </div>
        ` : ''}
        
        <div class="add-borrower-section">
          <div class="add-borrower-title">Or create new borrower</div>
          <div class="add-borrower-form">
            <input type="text" id="newBorrowerNameInput" class="new-borrower-input" 
                   placeholder="Enter borrower name">
            <button id="addNewBorrowerAndLinkBtn" class="add-borrower-btn">
              Add & Link
            </button>
          </div>
        </div>
      </div>
    `;

    // --- Attach Event Listeners ---
    document.getElementById('borrowerSearchInput').addEventListener('input', (e) => {
        borrowerPickerPage = 0;
        renderBorrowerPicker(orderId, e.target.value);
    });
    
    document.getElementById('borrowerPrevBtn')?.addEventListener('click', () => {
        borrowerPickerPage--;
        renderBorrowerPicker(orderId, searchTerm);
    });

    document.getElementById('borrowerNextBtn')?.addEventListener('click', () => {
        borrowerPickerPage++;
        renderBorrowerPicker(orderId, searchTerm);
    });
    
    document.querySelectorAll('.select-borrower-btn').forEach(btn => {
        btn.onclick = () => handleLinkToBorrower(orderId, Number(btn.dataset.borrowerId));
    });

    document.getElementById('addNewBorrowerAndLinkBtn').onclick = () => handleAddNewBorrowerAndLink(orderId);
}

/**
 * Handles linking an order to an existing borrower.
 */
async function handleLinkToBorrower(orderId, borrowerId) {
    try {
        const result = await linkOrderToBorrower(orderId, borrowerId);
        
        if (result && result.success === false) {
             alert(result.error || "This order is already linked to a borrower.");
             return;
        }

        alert(`✅ Successfully linked Order #${orderId} to the borrower.`);
        hideBorrowerModal();
        await renderOrders(); // Refresh list to show "(BORROWED)"
    } catch (error) {
        console.error("Failed to link order to borrower:", error);
        alert("An error occurred while linking the order.");
    }
}

/**
 * Handles creating a new borrower and immediately linking the order.
 */
async function handleAddNewBorrowerAndLink(orderId) {
    const nameInput = document.getElementById('newBorrowerNameInput');
    const name = nameInput.value.trim();

    if (!name) {
        alert("Please enter a name for the new borrower.");
        return;
    }

    try {
        const newBorrowerId = await addBorrower({
            name: name,
            date: new Date().toISOString(),
            amount: 0 // Debt is tracked via snapshots, not this field
        });

        await handleLinkToBorrower(orderId, newBorrowerId);
        
    } catch (error) {
        console.error("Failed to create and link new borrower:", error);
        alert("An error occurred while creating the new borrower.");
    }
}

/**
 * Hides the borrower selection modal.
 */
function hideBorrowerModal() {
    const modal = document.getElementById('borrowerModal');
    modal.classList.add('hidden');
    document.getElementById('borrowerModalBody').innerHTML = ''; // Clean up content
}


// =================================================================
// ADD NEW ORDER MODAL - CORE LOGIC (Unchanged)
// =================================================================

function showOrderModal() {
  const modal = document.getElementById('orderModal');
  modal.classList.remove('hidden');
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-scrollable">
      <div class="order-modal-header">
        <button id="scanModeInModalBtn">📠 Scan Mode</button>
        <input type="text" id="productSearchInput" placeholder="🔍 Search to add products..." />
      </div>
      <div id="scanFeedback" class="scanner-feedback-container hidden"></div>
      <div class="order-modal-content">
        <div class="selected-products-section">
          <h3>Selected Products</h3>
          <div id="orderTotal"></div>
          <div id="selectedProductsContainer">Your cart is empty.</div>
        </div>
        <button id="calculatorToggleBtn" class="calculator-toggle-btn">🔢</button>
        <div id="qtyCalculator" class="qty-calculator hidden">
          <div class="calc-display-area">
            <div id="calcHeader">No Product Selected</div>
            <div id="calcQtyDisplay">0</div>
          </div>
          <div id="calcKeypad" class="calc-keypad">
            <button class="calc-btn" data-key="1">1</button>
            <button class="calc-btn" data-key="2">2</button>
            <button class="calc-btn" data-key="3">3</button>
            <button class="calc-btn" data-key="4">4</button>
            <button class="calc-btn" data-key="5">5</button>
            <button class="calc-btn" data-key="6">6</button>
            <button class="calc-btn" data-key="7">7</button>
            <button class="calc-btn" data-key="8">8</button>
            <button class="calc-btn" data-key="9">9</button>
            <button class="calc-btn confirm" data-key="set">Set</button>
            <button class="calc-btn" data-key="0">0</button>
            <button class="calc-btn function" data-key="clear">C</button>
          </div>
        </div>
        <div class="product-picker-section">
          <h3>Add Products</h3>
          <div id="productListInModal"></div>
        </div>
      </div>
    </div>
    <button id="submitOrderBtn" class="submit-button">✅ Submit Order</button>
  `;
  document.getElementById('productSearchInput').addEventListener('input', handleProductSearch);
  document.getElementById('submitOrderBtn').addEventListener('click', handleSubmitOrder);
  document.getElementById('scanModeInModalBtn').addEventListener('click', toggleScanModeInModal);
  document.addEventListener('keydown', handleModalKeyPress);
  document.addEventListener('keydown', handleListNavigation);
  document.getElementById('calculatorToggleBtn').addEventListener('click', toggleCalculator);
  document.getElementById('calcKeypad').addEventListener('click', (e) => {
    if (e.target.matches('.calc-btn')) {
      const key = e.target.dataset.key;
      handleCalculatorKey(key);
    }
  });
  document.getElementById('productSearchInput').focus();
  renderSelectedProducts();
  renderProductPicker();
}

function toggleCalculator() {
  const calculator = document.getElementById('qtyCalculator');
  if (calculator.classList.contains('hidden')) {
    // Before showing, update it with the current target's data
    updateCalculatorDisplay();
    calculator.classList.remove('hidden');
  } else {
    calculator.classList.add('hidden');
  }
}
function updateCalculatorDisplay() {
  const header = document.getElementById('calcHeader');
  const display = document.getElementById('calcQtyDisplay');

  if (calculatorTargetProductId && selectedProductsMap.has(calculatorTargetProductId)) {
    const product = selectedProductsMap.get(calculatorTargetProductId);
    header.textContent = product.name;
    // Display the buffer if it has content, otherwise show the product's current quantity
    display.textContent = calculatorInputBuffer || product.quantity;
  } else {
    header.textContent = 'No Product Selected';
    display.textContent = '0';
  }
}





function hideOrderModal() {
  const modal = document.getElementById('orderModal');
  modal.classList.add('hidden');
  isFirstLoad = false;
  selectedProductsMap.clear();
  isScanModeActiveInModal = false;
  barcodeBuffer = '';
  clearTimeout(barcodeTimer);
  document.removeEventListener('keydown', handleModalKeyPress);
}

/**
 * Handles any key press on the calculator keypad.
 * @param {string} key - The key that was pressed (e.g., '1', 'clear', 'set').
 */
function handleCalculatorKey(key) {
  if (!calculatorTargetProductId) return; // Do nothing if no product is selected

  if (key >= '0' && key <= '9') {
    calculatorInputBuffer += key;
  } else if (key === 'clear') {
    calculatorInputBuffer = '';
  } else if (key === 'set') {
    setCalculatorQuantity();
    return; // Exit after setting
  }
  
  updateCalculatorDisplay(); // Update the visual display with the new buffer content
}


function setCalculatorQuantity() {
  if (!calculatorTargetProductId) return;

  // Use the buffer to get the new quantity. If buffer is empty, do nothing.
  const newQuantity = parseInt(calculatorInputBuffer, 10);
  if (isNaN(newQuantity)) {
    calculatorInputBuffer = ''; // Just clear the buffer
    updateCalculatorDisplay();
    return;
  }

  if (newQuantity <= 0) {
    selectedProductsMap.delete(calculatorTargetProductId);
    // Unset the target and hide the calculator since the item is gone
    calculatorTargetProductId = null;
    document.getElementById('qtyCalculator').classList.add('hidden');
  } else {
    const product = selectedProductsMap.get(calculatorTargetProductId);
    product.quantity = newQuantity;
  }
  
  calculatorInputBuffer = ''; // Clear buffer after setting
  renderSelectedProducts(); // Refresh the main list of selected items
  updateCalculatorDisplay(); // Refresh the calculator display to show the new official quantity
}
async function handleSubmitOrder() {
  if (selectedProductsMap.size === 0) {
    alert("Please add at least one product to the order.");
    return;
  }
  const productsList = Array.from(selectedProductsMap.entries()).map(([product_id, data]) => ({
    product_id: Number(product_id),
    quantity: data.quantity
  }));
  try {
    await addOrder(productsList);
    alert("✅ Order submitted successfully!");
    selectedProductsMap.clear();
    productPickerPage = 0;
    document.getElementById('productSearchInput').value = '';
    renderSelectedProducts();
    await renderProductPicker();
    await renderOrders();
  } catch (error) {
    console.error("❌ Failed to submit order:", error);
    alert(`An error occurred while submitting the order: ${error.message}`);
  }
}

function toggleScanModeInModal() {
  isScanModeActiveInModal = !isScanModeActiveInModal;
  const feedback = document.getElementById('scanFeedback');
  const scanBtn = document.getElementById('scanModeInModalBtn');
  const searchInput = document.getElementById('productSearchInput');
  barcodeBuffer = '';
  if (isScanModeActiveInModal) {
    feedback.textContent = 'SCAN MODE ACTIVE... (Press Esc to cancel)';
    feedback.classList.remove('hidden');
    scanBtn.textContent = '🔴 Cancel Scan';
    scanBtn.classList.add('active');
    searchInput.classList.add('scan-active'); // Add scan-active class
    searchInput.disabled = true;
  } else {
    feedback.classList.add('hidden');
    scanBtn.textContent = '📠 Scan Mode';
    scanBtn.classList.remove('active');
    searchInput.classList.remove('scan-active'); // Remove scan-active class
    searchInput.disabled = false;
    searchInput.focus(); // Refocus input when scan mode is deactivated
  }
}
function handleListNavigation(e) {
  if (isScanModeActiveInModal) return; // Skip navigation during scan mode
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Enter') return;

  const isInPicker = document.activeElement.closest('#productListInModal');
  const isInCart = document.activeElement.closest('#selectedProductsContainer');

  if (!isInPicker && !isInCart) return;

  e.preventDefault(); // Prevent default scrolling

  const items = isInPicker
    ? document.querySelectorAll('#productListInModal .picker-item')
    : document.querySelectorAll('#selectedProductsContainer .selected-item');

  if (items.length === 0) return;

  let currentIndex = -1;
  items.forEach((item, index) => {
    if (item === document.activeElement) currentIndex = index;
  });

  let newIndex;
  if (e.key === 'ArrowUp') {
    newIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
  } else if (e.key === 'ArrowDown') {
    newIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
  } else if (e.key === 'Enter') {
    const id = Number(document.activeElement.dataset.id);
    if (isInPicker) {
      focusedPickerItemId = id;
      addProductToSelection(id, 1, true);
    } else {
      focusedCartItemId = id;
      calculatorTargetProductId = id;
      calculatorInputBuffer = '';
      renderSelectedProducts();
      updateCalculatorDisplay();
    }
    return;
  } else {
    return;
  }

  const newItem = items[newIndex];
  const newId = Number(newItem.dataset.id);
  if (isInPicker) {
    focusedPickerItemId = newId;
    renderProductPicker(document.getElementById('productSearchInput').value.trim());
  } else {
    focusedCartItemId = newId;
    calculatorTargetProductId = newId;
    renderSelectedProducts();
    updateCalculatorDisplay();
  }
}
function handleModalKeyPress(e) {
  if (!isScanModeActiveInModal) return;
  if (e.key === 'Escape') {
    toggleScanModeInModal();
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    processModalBarcodeBuffer();
    return;
  }
  if (!/^\d$/.test(e.key)) {
    return;
  }
  e.preventDefault();
  barcodeBuffer += e.key;
  document.getElementById('scanFeedback').textContent = `Scanning: ${barcodeBuffer}`;
  clearTimeout(barcodeTimer);
  barcodeTimer = setTimeout(processModalBarcodeBuffer, SCAN_TIMEOUT_MS);
}

async function processModalBarcodeBuffer() {
  if (barcodeBuffer.length === 0) return;
  const scannedId = Number(barcodeBuffer);
  const feedback = document.getElementById('scanFeedback');
  barcodeBuffer = '';
  feedback.textContent = `Processing: ${scannedId}...`;
  await addProductToSelection(scannedId, 1, true);
  setTimeout(() => {
    if (isScanModeActiveInModal) {
      feedback.textContent = 'SCAN MODE ACTIVE...';
    }
  }, 1000);
}

/**
 * Adds a product to the order's selection map or updates its quantity.
 * It also sets the calculator to target this product.
 * @param {number} productId - The ID of the product to add.
 * @param {number} quantity - The quantity to set or add.
 * @param {boolean} increment - If true, adds to the existing quantity instead of overwriting.
 */
async function addProductToSelection(productId, quantity = 1, increment = false) {
  try {
    // 1. Fetch the product details from the database
    const product = await getProductById(productId);
    if (!product) {
      alert(`⚠️ Product with barcode "${productId}" not found.`);
      return; // Exit if the product doesn't exist
    }

    // 2. Check if the product is already in the order
    if (selectedProductsMap.has(productId)) {
      // If it exists, update its quantity
      const existingProduct = selectedProductsMap.get(productId);
      
      if (increment) {
        // Add to the current quantity (e.g., from scanner or "Add" button)
        existingProduct.quantity += quantity;
      } else {
        // Set a specific quantity (not used by default, but good to have)
        existingProduct.quantity = quantity;
      }
    } else {
      // If it's a new product, add it to the map with its details
      selectedProductsMap.set(productId, { ...product, quantity: quantity });
    }

    // 3. Update the calculator's state
    calculatorTargetProductId = productId; // Target this product
    calculatorInputBuffer = '';            // Clear any previous typing

    // 4. Re-render the UI to reflect all changes
    renderSelectedProducts();      // Update the list of selected products
    updateCalculatorDisplay();     // Update the calculator's display with the new target

  } catch (error) {
    console.error("Error adding product to selection:", error);
    alert("An error occurred while adding the product to your order.");
  }
}

function renderSelectedProducts() {
  const container = document.getElementById('selectedProductsContainer');
  const totalContainer = document.getElementById('orderTotal');
  container.innerHTML = '';
  let grandTotal = 0;
  if (selectedProductsMap.size === 0) {
    container.innerHTML = '<p>Your cart is empty.</p>';
    totalContainer.innerHTML = '';
    focusedCartItemId = null;
    return;
  }
  selectedProductsMap.forEach((data, id) => {
    const subtotal = data.price_sell * data.quantity;
    grandTotal += subtotal;
    const div = document.createElement('div');
    div.className = `selected-item ${id === focusedCartItemId ? 'focused' : ''}`;
    div.setAttribute('tabindex', '0');
    div.dataset.id = id;
    div.addEventListener('click', () => {
      focusedCartItemId = id;
      calculatorTargetProductId = id;
      calculatorInputBuffer = '';
      renderSelectedProducts();
      updateCalculatorDisplay();
    });
    div.innerHTML = `
      <span>${data.name} <span class="stock-info">(Stock: ${data.stock})</span></span>
      <div class="item-controls">
        <button class="qty-minus" data-id="${id}">-</button>
        <input type="number" min="1" value="${data.quantity}" data-id="${id}" class="quantity-input" />
        <button class="qty-plus" data-id="${id}">+</button>
        <span>x ${data.price_sell.toFixed(2)} = ${subtotal.toFixed(2)} DA</span>
        <button class="remove-item-btn" data-id="${id}">❌</button>
      </div>
    `;
    container.appendChild(div);
  });
  totalContainer.innerHTML = `<strong>Total: ${grandTotal.toFixed(2)} DA</strong>`;

  container.querySelectorAll('.quantity-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const id = Number(e.target.dataset.id);
      const newQuantity = parseInt(e.target.value, 10);
      if (newQuantity > 0) {
        selectedProductsMap.get(id).quantity = newQuantity;
      } else {
        selectedProductsMap.delete(id);
        if (focusedCartItemId === id) focusedCartItemId = null;
        if (calculatorTargetProductId === id) calculatorTargetProductId = null;
      }
      renderSelectedProducts();
      updateCalculatorDisplay();
    });
  });

  container.querySelectorAll('.qty-plus').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = Number(e.target.dataset.id);
      if (selectedProductsMap.has(id)) {
        selectedProductsMap.get(id).quantity += 1;
        focusedCartItemId = id;
        renderSelectedProducts();
        updateCalculatorDisplay();
      }
    });
  });

  container.querySelectorAll('.qty-minus').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = Number(e.target.dataset.id);
      if (selectedProductsMap.has(id)) {
        const product = selectedProductsMap.get(id);
        product.quantity -= 1;
        if (product.quantity <= 0) {
          selectedProductsMap.delete(id);
          if (focusedCartItemId === id) focusedCartItemId = null;
          if (calculatorTargetProductId === id) calculatorTargetProductId = null;
        }
        focusedCartItemId = id;
        renderSelectedProducts();
        updateCalculatorDisplay();
      }
    });
  });

  container.querySelectorAll('.remove-item-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = Number(e.target.dataset.id);
      selectedProductsMap.delete(id);
      if (focusedCartItemId === id) focusedCartItemId = null;
      if (calculatorTargetProductId === id) calculatorTargetProductId = null;
      renderSelectedProducts();
      updateCalculatorDisplay();
    });
  });

  if (focusedCartItemId) {
    const focusedItem = container.querySelector(`.selected-item[data-id="${focusedCartItemId}"]`);
    if (focusedItem) {
      focusedItem.focus();
      focusedItem.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
  }
}
async function handleProductSearch(e) {
  productPickerPage = 0;
  await renderProductPicker(e.target.value.trim());
}

async function renderProductPicker(search = '') {
  const container = document.getElementById('productListInModal');
  if (!container) {
    console.error('Product list container not found');
    return;
  }
  container.innerHTML = '<p>Loading...</p>';
  try {
    const offset = productPickerPage * productPickerLimit;
    console.log(`Fetching products: page=${productPickerPage}, offset=${offset}, limit=${productPickerLimit}, search=${search}`);
    const { products, total } = search
      ? { products: await searchProducts(search, { limit:productPickerLimit, offset }), total: await countProducts(search) }
      : { products: await getProducts({ limit: productPickerLimit, offset }), total: await countProducts() };
    console.log('Fetched:', { products: products.length, total });

    container.innerHTML = '';
    if (products.length === 0) {
      container.innerHTML = '<p>No products found.</p>';
      focusedPickerItemId = null;
      return; // Exit early to avoid rendering pagination
    }

    products.forEach(p => {
      const div = document.createElement('div');
      div.className = `picker-item ${p.id === focusedPickerItemId ? 'focused' : ''}`;
      div.setAttribute('tabindex', '0');
      div.dataset.id = p.id;
      div.innerHTML = `<span>${p.name} (${p.price_sell.toFixed(2)} DA)</span><button data-id="${p.id}">➕ Add</button>`;
      container.appendChild(div);
    });

    container.querySelectorAll('.picker-item').forEach(item => {
      item.addEventListener('click', () => {
        focusedPickerItemId = Number(item.dataset.id);
        renderProductPicker(search);
      });
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addProductToSelection(Number(item.dataset.id), 1, true);
        }
      });
    });

    container.querySelectorAll('button[data-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.target.dataset.id);
        focusedPickerItemId = id;
        addProductToSelection(id, 1, true);
      });
    });

    if (!focusedPickerItemId && products.length > 0) {
      focusedPickerItemId = products[0].id;
    }
    if (focusedPickerItemId) {
      const focusedItem = container.querySelector(`.picker-item[data-id="${focusedPickerItemId}"]`);
      if (focusedItem) {
        focusedItem.focus();
        focusedItem.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    }

    renderProductPickerPagination(total, search);
  } catch (error) {
    console.error("Failed to render product picker:", error);
    container.innerHTML = `<p>Error loading products: ${error.message}</p>`;
    focusedPickerItemId = null;
  }
}

function renderProductPickerPagination(totalCount, search) {
  console.log(`Rendering pagination: totalCount=${totalCount}, productPickerPage=${productPickerPage}, productPickerLimit=${productPickerLimit}`);
  const container = document.getElementById('productListInModal');
  const totalPages = Math.ceil(totalCount / productPickerLimit);
  console.log(`Total pages: ${totalPages}`);

  let pagination = document.getElementById('picker-pagination');
  if (pagination) pagination.remove();

  if (totalPages <= 1) {
    console.log('No pagination needed (totalPages <= 1)');
    return;
  }

  pagination = document.createElement('div');
  pagination.id = 'picker-pagination';
  pagination.className = 'pagination-controls';

  const prev = document.createElement('button');
  prev.textContent = '⬅️ Prev';
  prev.disabled = productPickerPage === 0;
  prev.onclick = () => {
    console.log('Prev clicked, new page:', productPickerPage - 1);
    productPickerPage--;
    renderProductPicker(search);
  };
  pagination.appendChild(prev);

  const pageInfo = document.createElement('span');
  pageInfo.textContent = ` ${productPickerPage + 1} / ${totalPages} `;
  pagination.appendChild(pageInfo);

  const next = document.createElement('button');
  next.textContent = 'Next ➡️';
  next.disabled = productPickerPage >= totalPages - 1;
  next.onclick = () => {
    console.log('Next clicked, new page:', productPickerPage + 1);
    productPickerPage++;
    renderProductPicker(search);
  };
  pagination.appendChild(next);

  container.appendChild(pagination);
}
// =================================================================
// MAIN LIST RENDERING AND MANAGEMENT (UPDATED)
// =================================================================

function updateSortButtonStyles() {
    const btnMap = {
        date: document.getElementById('sortByDateBtn'),
        price_sell: document.getElementById('sortByTotalBtn'),
        profit: document.getElementById('sortByProfitBtn'),
    };
    for (const key in btnMap) {
        const btn = btnMap[key];
        btn.style.fontWeight = 'normal';
        btn.textContent = btn.textContent.replace(/ [↓↑]/, '');
    }
    const activeBtn = btnMap[currentSort.field];
    if (activeBtn) {
        activeBtn.style.fontWeight = 'bold';
        const arrow = currentSort.direction === 'asc' ? ' ↑' : ' ↓';
        activeBtn.textContent += arrow;
    }
}

async function sortOrdersBy(field) {
  if (currentSort.field === field) {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.field = field;
    currentSort.direction = 'desc'; // Default to desc for new fields
  }
  currentPage = 0;
  await renderOrders();
}

/**
 * Main render function.
 */
async function renderOrders() {
  updateSortButtonStyles();
  await renderOrderList(); // This now directly calls the order list renderer
}

/**
 * Renders the list of orders with borrower logic.
 */
async function renderOrderList() {
  ordersList.innerHTML = '<li>Loading orders...</li>';
  try {
    const offset = currentPage * limit;
    const orders = await getOrdersWithTotal({ sortBy: currentSort.field, ascending: currentSort.direction === 'asc', limit, offset });
    ordersList.innerHTML = '';
    
    if (orders.length === 0 && currentPage === 0) { 
      ordersList.innerHTML = '<li>No orders found.</li>'; 
    } else {
      orders.forEach(order => {
        const div = document.createElement('div');
        div.className = `order-card ${order.has_borrower ? 'borrowed' : ''}`;
        
        const borrowerBadge = order.has_borrower 
          ? '<span class="borrowed-badge">Borrowed</span>' 
          : '';
        
        div.innerHTML = `
          <div class="order-header">
            <div>
              <span class="order-id">Order #${order.order_id}</span>
              ${borrowerBadge}
            </div>
            <span class="order-date">${new Date(order.created_at).toLocaleString()}</span>
          </div>
          
          <div class="order-stats">
            <div class="stat-item">
              <span class="stat-label">Total</span>
              <span class="stat-value">${(order.total_sell ?? 0).toFixed(2)} DA</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Profit</span>
              <span class="stat-value ${order.profit >= 0 ? 'positive' : 'negative'}">
                ${(order.profit ?? 0).toFixed(2)} DA
              </span>
            </div>
          </div>
          
          <div class="order-actions">
            <button class="btn-show-products" data-id="${order.order_id}">
              👁️ View Products
            </button>
            ${order.has_borrower ? '' : `<button class="btn-link-borrower" data-id="${order.order_id}">🔗 Link Borrower</button>`}
            <button class="btn-delete" data-id="${order.order_id}">
              🗑️ Delete
            </button>
          </div>
          
          <div id="products-in-order-${order.order_id}" class="products-container hidden">
            <!-- Products will be loaded here when clicked -->
          </div>
        `;
        ordersList.appendChild(div);
      });
    }
    
    attachActionButtonsToOrderItems();
    const total = await countOrders();
    renderMainPagination(total);
    
  } catch(error) { 
    console.error("Failed to render orders:", error); 
    ordersList.innerHTML = '<li>Error loading orders.</li>'; 
  }
}

/**
 * Attaches listeners to all action buttons on order items.
 */
function attachActionButtonsToOrderItems() {
  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.onclick = async (e) => {
      const id = Number(e.currentTarget.dataset.id);
      if (confirm(`Are you sure you want to delete order #${id}? This will restore product stock.`)) {
        try {
          await deleteOrder(id);
          await renderOrders();
        } catch (error) {
          console.error("Failed to delete order:", error);
          alert("Could not delete the order.");
        }
      }
    };
  });

  document.querySelectorAll('.btn-show-products').forEach(btn => {
    btn.onclick = (e) => {
      const id = Number(e.currentTarget.dataset.id);
      toggleProductDisplayForOrder(id, e.currentTarget);
    };
  });

  // NEW: Add listener for the link borrower buttons
  document.querySelectorAll('.btn-link-borrower').forEach(btn => {
    btn.onclick = (e) => {
        const id = Number(e.currentTarget.dataset.id);
        showBorrowerModal(id);
    };
  });
}

async function toggleProductDisplayForOrder(orderId, button) {
  const container = document.getElementById(`products-in-order-${orderId}`);
  if (!container) return;

  const isVisible = !container.classList.contains('hidden');
  if (isVisible) {
    container.classList.add('hidden');
    container.innerHTML = '';
    button.innerHTML = '<i>👁️</i> View Products';
  } else {
    container.innerHTML = '<div class="product-header">' +
      '<span class="product-name">Product</span>' +
      '<span class="product-qty">Qty</span>' +
      '<span class="product-price">Price</span>' +
      '<span class="product-subtotal">Subtotal</span>' +
      '</div>' +
      '<div class="products-list">Loading...</div>';
    
    container.classList.remove('hidden');
    button.innerHTML = '<i>🔼</i> Hide Products';
    
    try {
      const products = await getProductsInOrder(orderId, 100, 0);
      const productsList = container.querySelector('.products-list');
      
      if (products.length === 0) {
        productsList.innerHTML = '<div class="product-item">No products found</div>';
      } else {
        productsList.innerHTML = products.map(p => `
          <div class="product-item">
            <span class="product-name">${p.name}</span>
            <span class="product-qty">${p.quantity}</span>
            <span class="product-price">${p.price_sell.toFixed(2)} DA</span>
            <span class="product-subtotal">${p.subtotal_sell.toFixed(2)} DA</span>
          </div>
        `).join('');
      }
    } catch (error) {
      console.error("Failed to get products for order:", error);
      container.querySelector('.products-list').innerHTML = 
        '<div class="product-item">Error loading products</div>';
    }
  }
}

function renderMainPagination(totalCount) {
  let pagination = document.getElementById('main-pagination');
  if (pagination) pagination.remove();
  
  const totalPages = Math.ceil(totalCount / limit);
  if (totalPages <= 1) return;

  pagination = document.createElement('div');
  pagination.id = 'main-pagination';
  pagination.className = 'pagination-controls';

  const prev = document.createElement('button');
  prev.textContent = '⬅️ Prev';
  prev.disabled = currentPage === 0;
  prev.onclick = () => { currentPage--; renderOrders(); };
  pagination.appendChild(prev);

  const pageInfo = document.createElement('span');
  pageInfo.textContent = ` Page ${currentPage + 1} of ${totalPages} `;
  pagination.appendChild(pageInfo);

  const next = document.createElement('button');
  next.textContent = 'Next ➡️';
  next.disabled = currentPage >= totalPages - 1;
  next.onclick = () => { currentPage++; renderOrders(); };
  pagination.appendChild(next);

  ordersList.insertAdjacentElement('afterend', pagination);
}

// =================================================================
// STATISTICS MODAL (Unchanged)
// =================================================================

// =================================================================
// STATISTICS MODAL (Updated with role check)
// =================================================================

async function showStatsModal() {
  const modal = document.getElementById('statsModal');
  const body = document.getElementById('statsModalBody');
  modal.classList.remove('hidden');
  
  // Get user role from localStorage
  const role = localStorage.getItem("userRole");
  
  // Check if user is not owner
  if (role !== "owner") {
    body.innerHTML = `
      <div class="access-denied">
        <h2>Access Denied</h2>
        <p>Sorry, only the owner can view statistics.</p>
        <button onclick="document.getElementById('statsModal').classList.add('hidden')">
          OK
        </button>
      </div>
    `;
    return;
  }

  // If user is owner, show beautiful statistics
  body.innerHTML = `
    <div class="stats-container">
      <div class="stats-header">
        <h2>📊 Sales Statistics</h2>
        <p>Key performance indicators for your business</p>
      </div>
      <div class="stats-grid">
        <div class="stat-card">
          <h3>Total Orders</h3>
          <p>Loading...</p>
        </div>
        <div class="stat-card">
          <h3>Total Revenue</h3>
          <p>Loading...</p>
        </div>
        <div class="stat-card">
          <h3>Total Profit</h3>
          <p>Loading...</p>
        </div>
        <div class="stat-card">
          <h3>Average Profit</h3>
          <p>Loading...</p>
        </div>
      </div>
      <div class="stats-period">
        ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
      </div>
    </div>
  `;

  try {
    const stats = await getOrderStatistics();
    const statsGrid = body.querySelector('.stats-grid');
    
    statsGrid.innerHTML = `
      <div class="stat-card">
        <h3>Total Orders</h3>
        <p>${stats.total_orders}</p>
      </div>
      <div class="stat-card">
        <h3>Total Revenue</h3>
        <p>${stats.total_sell.toFixed(2)} DA</p>
      </div>
      <div class="stat-card">
        <h3>Total Cost</h3>
        <p>${stats.total_buy.toFixed(2)} DA</p>
      </div>
      <div class="stat-card">
        <h3>Total Profit</h3>
        <p class="${stats.total_profit >= 0 ? 'positive' : 'negative'}">
          ${stats.total_profit.toFixed(2)} DA
        </p>
      </div>
      <div class="stat-card">
        <h3>Avg. Profit/Order</h3>
        <p class="${stats.average_profit >= 0 ? 'positive' : 'negative'}">
          ${stats.average_profit.toFixed(2)} DA
        </p>
      </div>
      <div class="stat-card">
        <h3>Largest Order</h3>
        <p class="highlight">
          ${stats.largest_order_id ? `#${stats.largest_order_id}` : 'N/A'}
        </p>
      </div>
      <div class="stat-card">
        <h3>Borrowed Orders</h3>
        <p>${stats.with_borrower}</p>
      </div>
    `;
    
  } catch (error) {
    console.error("Failed to show statistics:", error);
    body.querySelector('.stats-grid').innerHTML = `
      <div class="stat-card">
        <h3>Error</h3>
        <p>Could not load statistics</p>
      </div>
    `;
  }

  document.getElementById('closeStatsModal').onclick = () => {
    modal.classList.add('hidden');
  };
}
function renderCalculator() {
  const calculator = document.getElementById('qtyCalculator');
  const header = document.getElementById('calcHeader');
  const display = document.getElementById('calcQtyDisplay');

  if (calculatorTargetProductId && selectedProductsMap.has(calculatorTargetProductId)) {
    const product = selectedProductsMap.get(calculatorTargetProductId);
    header.textContent = product.name;
    display.textContent = product.quantity;
    calculator.classList.remove('hidden'); // Show calculator if a product is targeted
  } else {
    // Hide the calculator if no valid product is selected
    header.textContent = 'No Product Selected';
    display.textContent = '0';
    calculator.classList.add('hidden');
  }
}

/**
 * Changes the quantity of the currently targeted product.
 * @param {number} change - The amount to change by (e.g., 1 or -1).
 */
function updateCalculatorQuantity(change) {
  if (!calculatorTargetProductId || !selectedProductsMap.has(calculatorTargetProductId)) {
    return; // Do nothing if no product is targeted
  }

  const product = selectedProductsMap.get(calculatorTargetProductId);
  const newQuantity = product.quantity + change;

  if (newQuantity <= 0) {
    // If quantity is 0 or less, remove the product
    selectedProductsMap.delete(calculatorTargetProductId);
    calculatorTargetProductId = null; // Unset the target
  } else {
    product.quantity = newQuantity;
  }

  // Refresh both the main list and the calculator display
  renderSelectedProducts();
  renderCalculator();
}