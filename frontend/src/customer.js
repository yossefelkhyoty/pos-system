//customer.js
const { ipcRenderer } = require('electron');

const urlParams = new URLSearchParams(window.location.search);
const customerId = parseInt(urlParams.get('id'));
let saveIndicatorTimeout = null;
let totalSales = 0;
let totalReturns = 0;
let totalPayments = 0;
let currentMonth = new Date().getMonth() + 1;
let currentYear = new Date().getFullYear();

// PORMET Fix: Centralized auto-save system (matching renderer.js)
let isSaving = false;
let isProcessingQueue = false;
let saveQueue = [];
const SAVE_DELAY = 1000;
let autoSaveTimeout = null;

// PORMET Fix 3: Avoid double loading with flag
let isMonthDataLoading = false;

// PORMET Fix 6: Debounced functions for performance
const debouncedUpdateSummary = debounce(updateSummary, 800);
const debouncedUpdateBalance = debounce(updateBalanceRealtime, 1000);

// PORMET Fix 7: Inventory update timers map
const inventoryUpdateTimers = new Map();

// PORMET Fix 8: Product search cache
const productCache = new Map();

// PORMET Fix 4: Updated focus handling with per-row counters
let isInputFocused = false;

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// PORMET Fix 5: Fixed getRowId with proper precedence and stable IDs
function getRowId(row) {
    return row.dataset.trxId ? row.dataset.trxId : ('new_' + (row.dataset.creationId || row.dataset.creationTime || Date.now()));
}

// ========== إنشاء مؤشر الحفظ ==========
// PORMET Fix 9: Singleton pattern for save indicator
function createSaveIndicator() {
    let indicator = document.getElementById('save-indicator');
    if (indicator) return indicator;

    indicator = document.createElement('div');
    indicator.id = 'save-indicator';
    indicator.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #2196F3;
        color: white;
        padding: 10px 15px;
        border-radius: 4px;
        z-index: 1000;
        display: none;
        font-family: 'Tajawal', sans-serif;
        transition: opacity 0.3s ease;
    `;
    document.body.appendChild(indicator);
    return indicator;
}

function showSaveIndicator(text = 'جاري الحفظ...', color = '#2196F3') {
    const indicator = document.getElementById('save-indicator') || createSaveIndicator();
    indicator.style.display = 'block';
    indicator.textContent = text;
    indicator.style.backgroundColor = color;
    indicator.style.opacity = '1';

    if (saveIndicatorTimeout) clearTimeout(saveIndicatorTimeout);

    if (color !== '#2196F3') {
        saveIndicatorTimeout = setTimeout(() => {
            indicator.style.opacity = '0';
            setTimeout(() => {
                indicator.style.display = 'none';
            }, 300);
        }, 2000);
    }
}

function hideSaveIndicator() {
    const indicator = document.getElementById('save-indicator');
    if (indicator) {
        indicator.style.opacity = '0';
        setTimeout(() => {
            indicator.style.display = 'none';
        }, 300);
    }
}

// PORMET Fix: Centralized auto-save system (copied from renderer.js)
function scheduleAutoSave(row) {
    if (!saveQueue.includes(row)) {
        saveQueue.push(row);
    }

    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(processSaveQueue, SAVE_DELAY);
}

// PORMET Fix: Unified queue processor (matching renderer.js logic)
async function processSaveQueue() {
    if (isProcessingQueue || saveQueue.length === 0) return;

    isProcessingQueue = true;
    isSaving = true;
    showSaveIndicator('💾 جاري الحفظ...', '#2196F3');

    while (saveQueue.length > 0) {
        const row = saveQueue.shift();
        const data = extractTransactionData(row);

        if (!data) {
            console.warn('Invalid transaction data, skipping...');
            continue;
        }

        try {
            if (row.dataset.trxId) {
                // Update existing transaction
                await ipcRenderer.invoke('update-customer-transaction', {
                    id: row.dataset.trxId,
                    ...data
                });
            } else {
                // Add new transaction
                const result = await ipcRenderer.invoke('add-customer-transaction', {
                    customer_id: customerId,
                    ...data
                });

                if (result.success && result.id) {
                    row.dataset.trxId = result.id;
                    // Remove creation markers
                    delete row.dataset.creationId;
                    delete row.dataset.creationTime;
                }
            }
        } catch (error) {
            console.error('AutoSave error:', error);
            // Continue processing queue even if one save fails
            continue;
        }
    }

    hideSaveIndicator();
    showSaveIndicator('✓ تم الحفظ بنجاح', '#4CAF50');

    isSaving = false;
    isProcessingQueue = false;

    // Update summaries after successful save
    debouncedUpdateSummary();
    debouncedUpdateBalance();
}

function extractTransactionData(row) {
    const itemInput = row.querySelector('.item-input') || row.querySelector('.item');
    const quantityInput = row.querySelector('.quantity');
    const priceInput = row.querySelector('.price');
    const notesInput = row.querySelector('.notes');
    const dateInput = row.querySelector('.date');
    const timeInput = row.querySelector('.time');
    const type = row.dataset.type || 'sale';

    if (!itemInput || !quantityInput || !priceInput) {
        return null;
    }

    const item = (itemInput.value || '').trim();
    const quantity = Number(quantityInput.value) || 0;
    const price = Number(priceInput.value) || 0;
    const notes = notesInput ? notesInput.value.trim() : '';
    const date = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];

    // تحويل الوقت من 12 إلى 24 ساعة للحفظ
    const timeValue = timeInput ? timeInput.value.trim() : '';
    let time24 = null;
    if (timeValue) {
        time24 = formatTimeTo24Hour(timeValue) || timeValue;
    }

    if (!item || quantity <= 0 || price <= 0) {
        return null;
    }

    const total = quantity * price;

    return {
        item,
        quantity,
        price,
        total: type === 'return' ? -total : total,
        type,
        notes,
        date,
        time: time24,
        product_id: row.dataset.productId || null
    };
}

// ========== تحميل بيانات العميل ==========
function loadCustomerData() {
    ipcRenderer.send('get-customer-account', customerId);
}

// PORMET Fix 6: Debounced balance update
async function updateBalanceRealtime() {
    try {
        const totalBalance = await ipcRenderer.invoke('get-customer-total-balance', customerId);
        const customerSummary = document.getElementById('customerSummary');
        if (customerSummary) {
            customerSummary.textContent = `الرصيد الحالي: ${Number(totalBalance).toFixed(2)}`;
        }
        updateSummary();
    } catch (err) {
        console.error('Error updating balance:', err);
    }
}

ipcRenderer.on('customer-account-data', async (event, { customer }) => {
    if (customer) {
        document.getElementById('customerName').textContent = `👤 ${customer.name}`;
        await updateBalanceRealtime();

        // تعيين الشهر والسنة الحاليين في الاختيارات تلقائياً
        const now = new Date();
        const monthPicker = document.getElementById('monthPicker');
        const yearPicker = document.getElementById('yearPicker');
        if (monthPicker) monthPicker.value = now.getMonth() + 1;
        if (yearPicker) yearPicker.value = now.getFullYear();

        // الافتراضي هو تحميل آخر يومين عمل (للسرعة)
        loadRecentData();
    }
});

let currentViewMode = 'recent'; // 'recent' or 'month'

function loadRecentData() {
    currentViewMode = 'recent';

    // تحديث شكل الأزرار
    document.getElementById('view-mode-recent').classList.add('active');
    document.getElementById('view-mode-all').classList.remove('active');
    // إبقاء أدوات التحكم ظاهرة بناءً على طلب المستخدم
    document.getElementById('monthControls').style.display = 'flex';
    document.getElementById('currentMonthName').textContent = 'آخر يومي عمل';

    ipcRenderer.send('get-customer-transactions-recent', { customerId });
    loadPaymentHistory();
}

function loadTodayData() {
    currentViewMode = 'today';
    document.getElementById('view-mode-today').classList.add('active');
    document.getElementById('view-mode-recent').classList.remove('active');
    document.getElementById('view-mode-all').classList.remove('active');

    document.getElementById('currentMonthName').textContent = 'اليوم';

    ipcRenderer.send('get-customer-transactions-today', { customerId });
}

function loadYearData() {
    currentViewMode = 'year';
    document.getElementById('view-mode-today').classList.remove('active');
    document.getElementById('view-mode-recent').classList.remove('active');
    document.getElementById('view-mode-all').classList.add('active');

    const year = document.getElementById('yearPicker').value;
    document.getElementById('currentMonthName').textContent = `سنة ${year}`;

    ipcRenderer.send('get-customer-transactions-by-year', { customerId, year });
}

// PORMET Fix 3: Guarded loadMonthData to prevent double loading
function loadMonthData() {
    if (isMonthDataLoading) return;
    isMonthDataLoading = true;
    currentViewMode = 'month';

    // تحديث شكل الأزرار
    document.getElementById('view-mode-recent').classList.remove('active');
    document.getElementById('view-mode-all').classList.add('active');
    document.getElementById('monthControls').style.display = 'flex';

    const month = document.getElementById('monthPicker').value;
    const year = document.getElementById('yearPicker').value;
    currentMonth = parseInt(month);
    currentYear = parseInt(year);

    // تحديث اسم الشهر
    updateMonthName();

    // تحميل المعاملات
    ipcRenderer.send('get-customer-transactions-by-month', {
        customerId,
        month: currentMonth,
        year: currentYear
    });

    // تحميل المدفوعات
    loadPaymentHistory();

    setTimeout(() => {
        const table = document.getElementById('customerTransactionTable');
        const rows = table.querySelectorAll('tr');
        if (rows.length === 0) {
            const emptyRow = addRow();
            emptyRow.classList.add('auto-added-row');
        }
        // Reset loading flag
        isMonthDataLoading = false;
    }, 500);
}

// جعل الدوال متاحة للـ HTML
window.loadRecentData = loadRecentData;
window.loadMonthData = loadMonthData;
window.loadTodayData = loadTodayData;
window.loadYearData = loadYearData;

// ========== تحديث اسم الشهر المعروض ==========
function updateMonthName() {
    const monthNames = [
        'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];

    const month = document.getElementById('monthPicker').value;
    const monthName = monthNames[parseInt(month) - 1];

    document.getElementById('currentMonthName').textContent = monthName;
}

// ========== تحميل تاريخ المدفوعات ==========
async function loadPaymentHistory() {
    try {
        const month = document.getElementById('monthPicker').value;
        const year = document.getElementById('yearPicker').value;

        const payments = await ipcRenderer.invoke('get-customer-payments-by-month', {
            customerId,
            month: parseInt(month),
            year: parseInt(year)
        });

        const tbody = document.getElementById('paymentHistoryBody');
        tbody.innerHTML = '';

        if (payments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">لا توجد مدفوعات لهذا الشهر</td></tr>';
            return;
        }

        payments.forEach(payment => {
            const row = tbody.insertRow();
            // عرض الوقت بصيغة 12 ساعة
            const timeDisplay = payment.time ? formatTimeTo12Hour(payment.time) : '-';
            row.innerHTML = `
                <td>${payment.date}</td>
                <td>${timeDisplay}</td>
                <td>${Number(payment.amount).toFixed(2)}</td>
                <td>${payment.payment_method === 'wallet' ? 'محفظة إلكترونية' : 'نقدي'}</td>
                <td>${payment.notes || ''}</td>
                <td>
                    <button onclick="editPayment(${payment.id})" class="btn-small">✏️ تعديل</button>
                    <button onclick="deletePayment(${payment.id}, ${payment.amount}, '${payment.date}', '${payment.payment_method}', '${payment.notes || ''}')" class="btn-small btn-danger">🗑 حذف</button>
                </td>
            `;
        });
    } catch (err) {
        console.error('Error loading payment history:', err);
    }
}

// ========== إضافة صف عادي (مُحسَّن) ==========
function addRow(data = {}) {
    const table = document.getElementById('customerTransactionTable');
    const tbody = table.querySelector('tbody') || table;

    // ⭐⭐ استخدام الدالة المحسنة بدل insertRow المباشر
    const row = createRowFragment(data);
    tbody.appendChild(row);

    debouncedUpdateSummary();
    return row;
}

// ========== إضافة صف تلقائي عند الكتابة ==========
function setupAutoAddRow(row) {
    const inputs = row.querySelectorAll('input[type="text"], input[type="number"], input[type="date"]');

    inputs.forEach(input => {
        // عند التركيز على الحقل (Focus)
        input.addEventListener('focus', () => {
            autoAddNewRow(row);
        });

        // عند البدء في الكتابة (Input)
        input.addEventListener('input', () => {
            autoAddNewRow(row);
        });
    });
}

function autoAddNewRow(currentRow) {
    const table = document.getElementById('customerTransactionTable');
    const rows = table.querySelectorAll('tr');
    const lastRow = rows[rows.length - 1];

    // إذا الصف الحالي هو الأخير، ضيف صف جديد
    if (currentRow === lastRow) {
        // تحقق إذا الصف الجديد موجود بالفعل
        const nextRow = currentRow.nextElementSibling;
        if (!nextRow || !nextRow.classList.contains('auto-added-row')) {
            const newRow = addRow(); // إضافة صف جديد فاضي
            newRow.classList.add('auto-added-row'); // علامة أن الصف مضاف تلقائياً

            // إعداد المستمعات للصف الجديد
            setupAutoAddRow(newRow);

            // تلوين خفيف للصف المضاف تلقائياً
            newRow.style.backgroundColor = '#f8f9fa';

            showSaveIndicator('✓ تم إضافة صف جديد', '#4CAF50');
        }
    }
}

// ========== إضافة صف مرتجع (مُحسَّن) ==========
function addReturnRow(data = {}) {
    const table = document.getElementById('customerTransactionTable');
    const tbody = table.querySelector('tbody') || table;

    // ⭐⭐ استخدام الدالة المحسنة بدل insertRow المباشر
    const row = createReturnRowFragment(data);
    tbody.appendChild(row);

    debouncedUpdateSummary();
    return row;
}

// PORMET Fix 8: Cached product search
function searchProductCached(searchTerm, row) {
    if (searchTerm.length < 2) return;

    if (productCache.has(searchTerm)) {
        const products = productCache.get(searchTerm);
        if (products && products.length > 0) {
            const product = products[0];
            updateRowWithProduct(product, row);
        }
        return;
    }

    clearTimeout(searchProductCached.timer);
    searchProductCached.timer = setTimeout(() => {
        ipcRenderer.invoke('search-products', searchTerm)
            .then(products => {
                productCache.set(searchTerm, products);
                if (products && products.length > 0) {
                    const product = products[0]; // نأخذ أول نتيجة
                    updateRowWithProduct(product, row);
                } else {
                    showSaveIndicator('✗ لم يتم العثور على المنتج', '#F44336');
                    resetProductRow(row);
                }
            })
            .catch(err => {
                console.error('Error searching product:', err);
                showSaveIndicator('✗ خطأ في البحث عن المنتج', '#F44336');
            });
    }, 500);
}

// ========== البحث عن منتج (بالسيريال أو الاسم) ==========
function searchProduct(searchTerm, row) {
    searchProductCached(searchTerm, row);
}

function updateRowWithProduct(product, row) {
    row.querySelector('.item-input').value = product.name;
    row.querySelector('.price').value = product.wholesale_price;
    row.querySelector('.quantity').value = 1;
    row.querySelector('.total').textContent = `-${product.wholesale_price.toFixed(2)}`;

    // حفظ بيانات المنتج في الصف
    const oldProductId = row.dataset.productId;
    row.dataset.productId = product.id;
    row.dataset.serialNumber = product.serial_number;
    row.dataset.oldQty = '1'; // حفظ oldQty لتتبع التغييرات

    // تحديث المخزون فقط إذا كان المنتج جديد (لم يتم ملء البيانات من قبل)
    // لكن لا نضيف الكمية هنا لأن autoFillProductFromSerialInCustomer سيتعامل معها
    // أو إذا تم استدعاء updateRowWithProduct مباشرة (ليس من autoFill)
    // نتحقق من أن initialQuantity غير موجودة لتجنب الإضافة المزدوجة
    if (!oldProductId || oldProductId != product.id) {
        if (!row.dataset.initialQuantity) {
            const type = row.dataset.type || 'sale';
            const quantity = 1;
            if (type === 'return') {
                scheduleInventoryUpdate(product.id, quantity);
            } else {
                scheduleInventoryUpdate(product.id, -quantity);
            }
            row.dataset.initialQuantity = quantity.toString();
        }
    }

    // حفظ الصف تلقائياً
    scheduleAutoSave(row);

    showSaveIndicator('✓ تم تحميل المنتج', '#4CAF50');
}

function resetProductRow(row) {
    row.querySelector('.price').value = '';
    row.querySelector('.quantity').value = 1;
    row.querySelector('.total').textContent = '-0.00';
    row.dataset.productId = '';
    row.dataset.serialNumber = '';
}

// Auto-fill بيانات المنتج من السيريال نمبر في صفحة العميل
async function autoFillProductFromSerialInCustomer(serialNumber, row) {
    try {
        // البحث عن المنتج بالرقم التسلسلي
        const product = await ipcRenderer.invoke('get-product-by-serial', serialNumber);

        if (product) {
            // المنتج موجود - ملء الحقول تلقائياً
            const itemInput = row.querySelector('.item') || row.querySelector('.item-input');
            const priceInput = row.querySelector('.price');
            const quantityInput = row.querySelector('.quantity');
            const type = row.dataset.type || 'sale';

            if (itemInput) itemInput.value = product.name || serialNumber;
            if (priceInput) priceInput.value = product.wholesale_price || product.price || 0;

            // حفظ بيانات المنتج في الصف
            const oldProductId = row.dataset.productId;
            row.dataset.productId = product.id;
            row.dataset.serialNumber = product.serial_number;

            // تحديث الإجمالي
            if (quantityInput && priceInput) {
                const quantity = Number(quantityInput.value) || 1;
                const price = Number(priceInput.value) || 0;
                const totalCell = row.querySelector('.total');
                if (totalCell) {
                    const total = quantity * price;
                    if (type === 'return') {
                        totalCell.textContent = `-${total.toFixed(2)}`;
                    } else {
                        totalCell.textContent = total.toFixed(2);
                    }
                }
            }

            // تحديث المخزون إذا تغير المنتج
            if (oldProductId && oldProductId != product.id) {
                // إرجاع الكمية للمنتج القديم
                const oldQuantity = Number(quantityInput?.value) || 1;
                const oldType = row.dataset.type || 'sale';
                if (oldType === 'return') {
                    scheduleInventoryUpdate(parseInt(oldProductId), -oldQuantity);
                } else {
                    scheduleInventoryUpdate(parseInt(oldProductId), oldQuantity);
                }
            }

            // تقليل الكمية في قاعدة البيانات (للمبيعات) أو زيادتها (للمرتجع)
            // فقط إذا كان المنتج جديد (لم يتم ملء البيانات من قبل)
            if (!oldProductId || oldProductId != product.id) {
                const quantity = Number(quantityInput?.value) || 1;
                if (type === 'return') {
                    // للمرتجع: نزيد الكمية
                    scheduleInventoryUpdate(product.id, quantity);
                } else {
                    // للمبيعات: نقلل الكمية
                    scheduleInventoryUpdate(product.id, -quantity);
                }

                // حفظ الكمية الأولية في dataset لتتبع التغييرات
                row.dataset.initialQuantity = quantity.toString();
                row.dataset.oldQty = quantity.toString(); // تحديث oldQty أيضاً
            }

            // إظهار إشعار بصري
            if (itemInput) {
                itemInput.style.backgroundColor = '#d4edda';
                setTimeout(() => {
                    itemInput.style.backgroundColor = '';
                }, 1000);
            }

            showSaveIndicator('✓ تم تحميل المنتج', '#4CAF50');
            scheduleAutoSave(row);
            debouncedUpdateSummary();
        }
    } catch (error) {
        console.error('Error auto-filling product from serial:', error);
    }
}

// PORMET Fix 7: Optimized inventory update with debounce
function scheduleInventoryUpdate(productId, change) {
    clearTimeout(inventoryUpdateTimers.get(productId));
    const timeout = setTimeout(() => {
        ipcRenderer.send('update-product-quantity', { productId, change });
        inventoryUpdateTimers.delete(productId);
    }, 800);
    inventoryUpdateTimers.set(productId, timeout);
}

// ========== عرض الاقتراحات التلقائية ==========
function showProductSuggestions(searchTerm, row) {
    if (productCache.has(searchTerm)) {
        const products = productCache.get(searchTerm);
        displayProductSuggestions(products, row);
        return;
    }

    clearTimeout(showProductSuggestions.timer);
    showProductSuggestions.timer = setTimeout(() => {
        ipcRenderer.invoke('search-products', searchTerm)
            .then(products => {
                productCache.set(searchTerm, products);
                displayProductSuggestions(products, row);
            })
            .catch(err => {
                console.error('Error getting suggestions:', err);
            });
    }, 500);
}

function displayProductSuggestions(products, row) {
    if (products && products.length > 0) {
        // إنشاء قائمة الاقتراحات
        const datalist = document.getElementById('productSuggestions') || createSuggestionsDatalist();
        datalist.innerHTML = '';

        products.forEach(product => {
            const option = document.createElement('option');
            option.value = `${product.serial_number} - ${product.name}`;
            option.dataset.productId = product.id;
            option.dataset.serial = product.serial_number;
            option.dataset.price = product.wholesale_price;
            option.dataset.name = product.name;
            datalist.appendChild(option);
        });

        // عند اختيار اقتراح
        const itemInput = row.querySelector('.item-input');
        itemInput.addEventListener('change', function () {
            const selectedValue = this.value;
            const selectedOption = Array.from(datalist.options).find(opt =>
                opt.value === selectedValue
            );

            if (selectedOption) {
                const product = {
                    id: selectedOption.dataset.productId,
                    serial_number: selectedOption.dataset.serial,
                    name: selectedOption.dataset.name,
                    wholesale_price: parseFloat(selectedOption.dataset.price)
                };
                updateRowWithProduct(product, row);
            }
        });
    }
}

// دالة مساعدة لطباعة استيكر من بيانات الصف
function printStickerFromRow(btn) {
    const row = btn.closest('tr');

    // الحصول على السيريال أو توليد واحد عشوائي إذا لم يوجد
    let serial = row.dataset.serialNumber || (row.querySelector('.item-input') || row.querySelector('.item'))?.value || '';
    if (!serial || serial.trim() === '') {
        serial = 'SN-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        row.dataset.serialNumber = serial; // حفظه في الصف
    }

    const product = {
        name: row.querySelector('.item-input')?.value || row.querySelector('.item')?.value || 'منتج',
        wholesale_price: row.querySelector('.price')?.value || 0,
        serial_number: serial,
        quantity: row.querySelector('.quantity')?.value || 1
    };

    if (typeof printBarcodeSticker === 'function') {
        printBarcodeSticker(product);
    } else {
        console.error('printBarcodeSticker function not found');
    }
}

// PORMET Fix 9: Singleton pattern for suggestions
function createSuggestionsDatalist() {
    let datalist = document.getElementById('productSuggestions');
    if (datalist) return datalist;

    datalist = document.createElement('datalist');
    datalist.id = 'productSuggestions';
    document.body.appendChild(datalist);
    return datalist;
}

// ========== حذف صف ==========
// ========== حذف صف ==========
async function deleteRow(btn) {
    const row = btn.closest('tr');
    const itemName = (row.querySelector('.item')?.value || row.querySelector('.item-input')?.value || '').trim();

    const msg = itemName
        ? `هل أنت متأكد من حذف الصنف "${itemName}" من صفحة العميل؟`
        : 'هل أنت متأكد من حذف هذا الصنف من صفحة العميل؟';
    const confirmed = await appConfirm(msg, 'حذف صنف');
    if (!confirmed) return;

    const productId = row.dataset.productId;
    const qty = parseFloat(row.querySelector('.quantity').value) || 1;
    const trxId = row.dataset.trxId;
    const type = row.dataset.type;

    if (productId) {
        // تحديث المخزون حسب نوع الصف
        let change = 0;
        if (type === 'return') {
            // للمرتجعات: ننقص الكمية من المخزون (نعكس الإضافة السابقة)
            change = -qty;
        } else {
            // للمبيعات: نزيد الكمية في المخزون (نعكس الخصم السابق)
            change = qty;
        }

        scheduleInventoryUpdate(productId, change);
    }

    if (trxId) {
        ipcRenderer.send('delete-customer-transaction', parseInt(trxId));
    }

    row.remove();
    debouncedUpdateSummary();
    debouncedUpdateBalance();
    showSaveIndicator('✓ تم الحذف', '#4CAF50');
}

// ========== البحث عن منتجات ==========
function setupProductSearch() {
    const searchInput = document.getElementById('searchProductCustomer');
    if (!searchInput) return;

    searchInput.addEventListener('input', debounce((e) => {
        const term = e.target.value.trim();
        if (term) {
            ipcRenderer.send('search-products-main', term);
        } else {
            document.getElementById('searchResultsCustomer').innerHTML = '';
        }
    }, 300));

    ipcRenderer.on('search-products-results', (event, products) => {
        const container = document.getElementById('searchResultsCustomer');
        if (!container) return;

        container.innerHTML = '';

        if (products.length === 0) {
            container.innerHTML = '<div class="search-row">لا توجد نتائج</div>';
            return;
        }

        products.forEach(p => {
            const div = document.createElement('div');
            div.className = 'search-row';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';

            const infoSpan = document.createElement('span');
            infoSpan.textContent = `${p.name} | السعر: ${p.wholesale_price} | الكمية: ${p.quantity}`;
            infoSpan.style.cursor = 'pointer';
            infoSpan.style.flex = '1';

            const printBtn = document.createElement('button');
            printBtn.textContent = '🖨️';
            printBtn.title = 'طباعة استيكر باركود';
            printBtn.className = 'btn-small';
            printBtn.style.marginRight = '10px';
            printBtn.onclick = (e) => {
                e.stopPropagation();
                printBarcodeSticker(p);
            };

            div.appendChild(infoSpan);
            div.appendChild(printBtn);

            infoSpan.addEventListener('click', () => {
                // البحث عن صف موجود بنفس المنتج في نفس التاريخ
                const today = new Date().toISOString().split('T')[0];
                const existingRow = Array.from(document.querySelectorAll('#customerTransactionTable tr[data-product-id="' + p.id + '"]'))
                    .find(row => row.querySelector('.date').value === today && row.dataset.type === 'sale');

                if (existingRow) {
                    // زود الكمية
                    const qtyInput = existingRow.querySelector('.quantity');
                    let qty = parseFloat(qtyInput.value) || 0;
                    qty += 1;
                    qtyInput.value = qty;

                    // حدّث الإجمالي
                    const price = parseFloat(existingRow.querySelector('.price').value) || 0;
                    existingRow.querySelector('.total').textContent = (qty * price).toFixed(2);

                    // احفظ التعديل
                    scheduleAutoSave(existingRow);
                } else {
                    // أضف صف جديد
                    const row = addRow({
                        product_id: p.id,
                        item: p.name,
                        price: p.wholesale_price,
                        quantity: 1,
                        date: today
                    });
                    scheduleAutoSave(row);
                }

                // خصم من المخزون
                scheduleInventoryUpdate(p.id, -1);

                container.innerHTML = '';
                searchInput.value = '';
            });

            container.appendChild(div);
        });
    });
}

// ========== تحويل الوقت من 24 ساعة إلى 12 ساعة ==========
function formatTimeTo12Hour(time24) {
    if (!time24) return null;

    // إذا كان الوقت بصيغة 12 ساعة بالفعل (يحتوي على AM/PM)
    if (time24.includes('AM') || time24.includes('PM')) {
        return time24;
    }

    // تحويل من 24 ساعة إلى 12 ساعة
    const [hours, minutes] = time24.split(':');
    const h = parseInt(hours);
    const m = minutes || '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    const formattedHour = h12.toString().padStart(2, '0');

    return `${formattedHour}:${m} ${ampm}`;
}

// ========== تحويل الوقت من 12 ساعة إلى 24 ساعة (للحفظ في قاعدة البيانات) ==========
function formatTimeTo24Hour(time12) {
    if (!time12) return null;

    // إذا كان الوقت بصيغة 24 ساعة بالفعل
    if (!time12.includes('AM') && !time12.includes('PM')) {
        return time12;
    }

    // تحويل من 12 ساعة إلى 24 ساعة
    const timeParts = time12.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!timeParts) return null;

    let hours = parseInt(timeParts[1]);
    const minutes = timeParts[2];
    const ampm = timeParts[3].toUpperCase();

    if (ampm === 'PM' && hours !== 12) {
        hours += 12;
    } else if (ampm === 'AM' && hours === 12) {
        hours = 0;
    }

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

// ========== الحصول على الوقت الحالي بصيغة 12 ساعة ==========
function getCurrentTime12Hour() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    const formattedHour = h12.toString().padStart(2, '0');
    const formattedMinutes = minutes.toString().padStart(2, '0');

    return `${formattedHour}:${formattedMinutes} ${ampm}`;
}

// ========== إضافة دفعة ==========
function addPayment() {
    const amountInput = document.getElementById('paymentAmount');
    const timeInput = document.getElementById('paymentTime');
    const methodSelect = document.getElementById('paymentMethod');
    const notesInput = document.getElementById('paymentNotes');

    const amount = Number(amountInput.value) || 0;
    let time = timeInput.value.trim() || null;
    const method = methodSelect.value;
    const notes = notesInput.value || '';

    if (amount <= 0) {
        showSaveIndicator('✗ يرجى إدخال مبلغ صحيح', '#F44336');
        amountInput.focus();
        return;
    }

    // تحويل الوقت من 12 ساعة إلى 24 ساعة للحفظ
    let time24 = time ? formatTimeTo24Hour(time) : null;

    // إذا لم يتم التحويل بنجاح، استخدم الوقت الأصلي
    if (time && !time24) {
        // محاولة إصلاح التنسيق
        time24 = time;
    }

    const payment = {
        customer_id: customerId,
        amount,
        payment_method: method,
        date: new Date().toISOString().split('T')[0],
        time: time24, // نحفظ بصيغة 24 ساعة في قاعدة البيانات
        notes
    };

    ipcRenderer.invoke('add-payment', payment)
        .then(res => {
            if (res.success) {
                showSaveIndicator('✓ تم تسجيل الدفع', '#4CAF50');

                // إذا كان دفع نقدي، أضف للصفحة الرئيسية
                if (method === 'cash') {
                    const customerName = document.getElementById('customerName').textContent.replace('👤 ', '');
                    ipcRenderer.send('add-main-transaction', {
                        date: payment.date,
                        item: `${customerName} - دفع`,
                        account: amount,
                        withdraw: 0,
                        notes: notes || 'دفع نقدي'
                    });
                }

                // مسح الحقول وإعادة تعيين الوقت الحالي
                amountInput.value = '';
                timeInput.value = getCurrentTime12Hour();
                notesInput.value = '';
                amountInput.focus(); // التركيز على حقل المبلغ

                debouncedUpdateSummary();
                debouncedUpdateBalance();
                loadPaymentHistory();
            } else {
                showSaveIndicator('✗ فشل في تسجيل الدفع', '#F44336');
            }
        })
        .catch(err => {
            console.error("Error adding payment:", err);
            showSaveIndicator('✗ خطأ في تسجيل الدفع', '#F44336');
        });
}

// ========== تعديل دفعة ==========
function editPayment(paymentId) {
    // الحصول على بيانات الدفعة الحالية
    ipcRenderer.invoke('get-payment-by-id', paymentId)
        .then(payment => {
            if (!payment) {
                showSaveIndicator('✗ لم يتم العثور على الدفعة', '#F44336');
                return;
            }

            // إنشاء نافذة التعديل
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 2000;
            `;

            modal.innerHTML = `
                <div style="background: white; padding: 20px; border-radius: 10px; width: 400px;">
                    <h2>تعديل الدفعة</h2>
                    <div style="margin-bottom: 15px;">
                        <label>المبلغ:</label>
                        <input type="number" id="editPaymentAmount" value="${payment.amount}" step="0.01" style="width: 100%; padding: 8px;">
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label>الوقت (مثال: 02:30 PM):</label>
                        <input type="text" id="editPaymentTime" value="${payment.time ? formatTimeTo12Hour(payment.time) : ''}" placeholder="مثال: 02:30 PM" maxlength="8" style="width: 100%; padding: 8px;">
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label>طريقة الدفع:</label>
                        <select id="editPaymentMethod" style="width: 100%; padding: 8px;">
                            <option value="cash" ${payment.payment_method === 'cash' ? 'selected' : ''}>نقدي (يدوي)</option>
                            <option value="wallet" ${payment.payment_method === 'wallet' ? 'selected' : ''}>محفظة إلكترونية</option>
                        </select>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label>ملاحظات:</label>
                        <input type="text" id="editPaymentNotes" value="${payment.notes || ''}" style="width: 100%; padding: 8px;">
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <button onclick="saveEditedPayment(${paymentId})" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 5px;">💾 حفظ</button>
                        <button onclick="closeEditModal()" style="padding: 10px 20px; background: #F44336; color: white; border: none; border-radius: 5px;">❌ إلغاء</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // جعل الدوال متاحة
            window.saveEditedPayment = function (paymentId) {
                const amount = parseFloat(document.getElementById('editPaymentAmount').value) || 0;
                let time = document.getElementById('editPaymentTime').value.trim() || null;
                const method = document.getElementById('editPaymentMethod').value;
                const notes = document.getElementById('editPaymentNotes').value;

                if (amount <= 0) {
                    showSaveIndicator('✗ يرجى إدخال مبلغ صحيح', '#F44336');
                    return;
                }

                // تحويل الوقت من 12 ساعة إلى 24 ساعة للحفظ
                let time24 = time ? formatTimeTo24Hour(time) : null;
                if (time && !time24) {
                    time24 = time; // إذا فشل التحويل، استخدم الوقت الأصلي
                }

                const updatedPayment = {
                    id: paymentId,
                    amount: amount,
                    payment_method: method,
                    time: time24, // نحفظ بصيغة 24 ساعة
                    notes: notes,
                    date: payment.date // الحفاظ على التاريخ الأصلي
                };

                ipcRenderer.invoke('update-payment', updatedPayment)
                    .then(result => {
                        if (result.success) {
                            showSaveIndicator('✓ تم تعديل الدفعة', '#4CAF50');
                            closeEditModal();
                            loadPaymentHistory();
                            debouncedUpdateSummary();
                            debouncedUpdateBalance();

                            // إذا تم تغيير المبلغ وكان الدفع نقدي، نحدث الصفحة الرئيسية
                            if (method === 'cash' && amount !== payment.amount) {
                                const customerName = document.getElementById('customerName').textContent.replace('👤 ', '');
                                const difference = amount - payment.amount;

                                if (difference !== 0) {
                                    ipcRenderer.send('add-main-transaction', {
                                        date: new Date().toISOString().split('T')[0],
                                        item: `${customerName} - تعديل دفعة`,
                                        account: difference > 0 ? difference : 0,
                                        withdraw: difference < 0 ? Math.abs(difference) : 0,
                                        notes: `تعديل دفعة من ${payment.amount} إلى ${amount}`
                                    });
                                }
                            }
                        } else {
                            showSaveIndicator('✗ فشل في تعديل الدفعة', '#F44336');
                        }
                    });
            };

            window.closeEditModal = function () {
                document.body.removeChild(modal);
            };
        })
        .catch(err => {
            console.error('Error getting payment:', err);
            showSaveIndicator('✗ خطأ في تحميل بيانات الدفعة', '#F44336');
        });
}

// ========== حذف دفعة ==========
function deletePayment(paymentId, amount, paymentDate, paymentMethod, notes) {
    const today = new Date().toISOString().split('T')[0];
    const isSameDay = paymentDate === today;

    // حذف الدفعة أولاً
    ipcRenderer.invoke('delete-payment', paymentId)
        .then(result => {
            if (result.success) {
                // إذا كانت الدفعة نقدية، نتعامل مع الصفحة الرئيسية
                if (paymentMethod === 'cash') {
                    const customerName = document.getElementById('customerName').textContent.replace('👤 ', '');

                    if (isSameDay) {
                        // إذا كان نفس اليوم، نضيف سحب بنفس المبلغ
                        ipcRenderer.send('add-main-transaction', {
                            date: today,
                            item: `${customerName} - حذف دفعة`,
                            account: 0,
                            withdraw: amount,
                            notes: `حذف دفعة نقدية - ${notes || 'بدون ملاحظات'}`
                        });
                    } else {
                        // إذا كان يوم مختلف، نضيف سحب بالمبلغ الكامل
                        ipcRenderer.send('add-main-transaction', {
                            date: today,
                            item: `${customerName} - حذف دفعة سابقة`,
                            account: 0,
                            withdraw: amount,
                            notes: `حذف دفعة نقدية من ${paymentDate} - ${notes || 'بدون ملاحظات'}`
                        });
                    }
                }

                showSaveIndicator('✓ تم حذف الدفعة', '#4CAF50');
                loadPaymentHistory();
                debouncedUpdateSummary();
                debouncedUpdateBalance();
            } else {
                showSaveIndicator('✗ فشل في حذف الدفعة', '#F44336');
            }
        })
        .catch(err => {
            console.error('Error deleting payment:', err);
            showSaveIndicator('✗ خطأ في حذف الدفعة', '#F44336');
        });
}

// PORMET Fix 6: Debounced updateSummary
async function updateSummary() {
    try {
        const rows = document.querySelectorAll('#customerTransactionTable tr');
        totalSales = 0;
        totalReturns = 0;

        rows.forEach(row => {
            const quantity = Number(row.querySelector('.quantity')?.value) || 0;
            const price = Number(row.querySelector('.price')?.value) || 0;
            const type = row.dataset.type;
            const total = quantity * price;

            if (type === 'return') {
                totalReturns += total;
            } else {
                totalSales += total;
            }
        });

        // الحصول على إجمالي المدفوعات
        const payments = await ipcRenderer.invoke('get-customer-payments', customerId);
        const totalPayments = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

        const netAmount = totalSales - totalReturns - totalPayments;

        const totalSalesEl = document.getElementById('totalSales');
        const totalReturnsEl = document.getElementById('totalReturns');
        const totalPaymentsEl = document.getElementById('totalPayments'); // تحتاج لإضافة هذا العنصر في HTML
        const netAmountEl = document.getElementById('netAmount');

        if (totalSalesEl) totalSalesEl.textContent = totalSales.toFixed(2);
        if (totalReturnsEl) totalReturnsEl.textContent = totalReturns.toFixed(2);
        if (totalPaymentsEl) totalPaymentsEl.textContent = totalPayments.toFixed(2);
        if (netAmountEl) netAmountEl.textContent = netAmount.toFixed(2);
    } catch (err) {
        console.error("Error updating summary:", err);
    }
}

// ========== Setup Listeners ==========
function setupListeners(row) {
    const qtyInput = row.querySelector('.quantity');
    const priceInput = row.querySelector('.price');

    // البحث عن حقل الإدخال المناسب
    const itemInput = row.querySelector('.item-input') || row.querySelector('.item');

    const notesInput = row.querySelector('.notes');
    const dateInput = row.querySelector('.date');
    const timeInput = row.querySelector('.time');
    // استخدام dataset لتخزين oldQty لتكون قابلة للوصول من أي مكان
    if (!row.dataset.oldQty) {
        row.dataset.oldQty = (Number(qtyInput.value) || 1).toString();
    }
    let oldQty = Number(row.dataset.oldQty) || 1;

    const updateTotal = () => {
        const quantity = Number(qtyInput.value) || 1;
        const price = Number(priceInput.value) || 0;
        const totalCell = row.querySelector('.total');
        const type = row.dataset.type;
        const total = quantity * price;

        if (type === 'return') {
            totalCell.textContent = `-${total.toFixed(2)}`;
        } else {
            totalCell.textContent = total.toFixed(2);
        }
        debouncedUpdateSummary();
        debouncedUpdateBalance();
    };

    [qtyInput, priceInput, notesInput, dateInput, timeInput].forEach(input => {
        if (!input) return;

        input.addEventListener('focus', () => {
            isInputFocused = true;
        });

        input.addEventListener('blur', () => {
            // تأخير بسيط علشان نتأكد أن المستخدم خلص
            setTimeout(() => {
                isInputFocused = false;
            }, 500);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' || e.key === 'Enter') {
                isInputFocused = false;
            }
        });
    });

    if (itemInput) {
        itemInput.addEventListener('focus', () => {
            isInputFocused = true;
        });

        itemInput.addEventListener('blur', () => {
            setTimeout(() => {
                isInputFocused = false;
            }, 100);
        });

        itemInput.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' || e.key === 'Enter') {
                isInputFocused = false;
            }
        });
    }

    if (qtyInput) {
        qtyInput.addEventListener('input', () => {
            const newQty = Number(qtyInput.value) || 1;
            const productId = row.dataset.productId;
            const type = row.dataset.type;

            if (productId) {
                const diff = newQty - oldQty;
                if (diff !== 0) {
                    // تحديث المخزون حسب نوع الصف
                    let change = 0;
                    if (type === 'return') {
                        change = diff;
                    } else {
                        change = -diff;
                    }

                    scheduleInventoryUpdate(productId, change);
                    oldQty = newQty;
                    row.dataset.oldQty = newQty.toString(); // حفظ القيمة الجديدة في dataset
                }
            }

            updateTotal();

            // PORMET Fix: Use centralized auto-save
            scheduleAutoSave(row);
        });
    }

    if (priceInput) {
        priceInput.addEventListener('input', () => {
            updateTotal();

            // تحقق أولاً إذا البيانات كافية للحفظ
            const price = Number(priceInput.value) || 0;
            const itemName = (itemInput?.value || '').trim();

            // إذا مفيش سعر أو مفيش اسم منتج، ما تبدأش تايمر حفظ
            if (price <= 0 || !itemName) {
                return;
            }

            // PORMET Fix: Use centralized auto-save
            scheduleAutoSave(row);
        });
    }

    if (itemInput && !itemInput.classList.contains('item-input')) {
        // فقط لحقول item العادية (ليس item-input)
        itemInput.addEventListener('change', async () => {
            const itemName = (itemInput.value || '').trim();
            if (!itemName) {
                showSaveIndicator('✗ يرجى إدخال اسم الصنف', '#F44336');
                return;
            }

            // Auto-fill بيانات المنتج من السيريال نمبر
            await autoFillProductFromSerialInCustomer(itemName, row);

            const price = Number(priceInput.value) || 0;
            if (price <= 0) {
                priceInput.focus();
                showSaveIndicator('الرجاء إدخال السعر لحفظ الصنف', '#FFC107');
                return;
            }
            scheduleAutoSave(row);
        });

        // أيضاً عند blur
        itemInput.addEventListener('blur', async () => {
            const itemName = (itemInput.value || '').trim();
            if (itemName) {
                await autoFillProductFromSerialInCustomer(itemName, row);
            }
        });

        // أيضاً عند Enter
        itemInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const itemName = (itemInput.value || '').trim();
                if (itemName) {
                    await autoFillProductFromSerialInCustomer(itemName, row);
                    // Focus على حقل السعر بعد ملء البيانات
                    if (priceInput) {
                        setTimeout(() => priceInput.focus(), 100);
                    }
                }
            }
        });
    }

    if (notesInput) {
        notesInput.addEventListener('change', () => {
            scheduleAutoSave(row);
        });
    }

    if (dateInput) {
        dateInput.addEventListener('change', () => {
            scheduleAutoSave(row);
        });
    }

    if (timeInput) {
        // تنسيق الوقت أثناء الكتابة (نفس منطق حقل الدفع)
        timeInput.addEventListener('input', function (e) {
            let value = this.value.replace(/\D/g, '');
            if (value.length >= 1) {
                value = value.substring(0, 4);
                if (value.length === 1 || value.length === 2) {
                    this.value = value + ':';
                } else if (value.length === 3) {
                    this.value = value.substring(0, 2) + ':' + value.substring(2);
                } else if (value.length === 4) {
                    this.value = value.substring(0, 2) + ':' + value.substring(2) + ' ';
                    const hours = parseInt(value.substring(0, 2));
                    this.value += (hours >= 12 ? 'PM' : 'AM');
                }
            }
            scheduleAutoSave(row);
        });

        timeInput.addEventListener('change', () => {
            scheduleAutoSave(row);
        });
    }

    setupAutoAddRow(row);
}

// PORMET Fix 1: Add stable creation ID when creating rows
function createRowFragment(data = {}) {
    const row = document.createElement('tr');

    row.dataset.trxId = data.id || '';
    row.dataset.productId = data.product_id || '';
    row.dataset.serialNumber = data.serial_number || '';
    row.dataset.type = 'sale';

    // PORMET Fix 1: Add stable creation ID
    if (!data.id) {
        row.dataset.creationId = crypto.randomUUID();
        row.dataset.creationTime = Date.now().toString();
    }

    const qtyVal = data.quantity || 1;
    const priceVal = data.price !== undefined ? data.price : '';
    const totalVal = (Number(qtyVal) * Number(priceVal)) || 0;
    const dateVal = data.date || new Date().toISOString().split('T')[0];
    const timeVal = data.time ? formatTimeTo12Hour(data.time) : getCurrentTime12Hour();

    row.innerHTML = `
        <td><input type="date" class="date" value="${dateVal}"></td>
        <td><input type="text" class="time" value="${timeVal}" placeholder="مثال: 02:30 PM" maxlength="8" style="width: 90px; text-align: center;"></td>
        <td><input type="text" class="item" value="${(data.item || '').replace(/"/g, '&quot;')}" placeholder="اسم المنتج"></td>
        <td><input type="number" class="quantity" value="${qtyVal}" min="1"></td>
        <td><input type="number" class="price" value="${priceVal}" step="0.01" placeholder="السعر"></td>
        <td class="total">${totalVal.toFixed(2)}</td>
        <td><span class="type-badge sale">مبيعات</span></td>
        <td><input type="text" class="notes" value="${(data.notes || '').replace(/"/g, '&quot;')}" placeholder="ملاحظات"></td>
        <td>
            <div style="display: flex; gap: 10px; align-items: center; justify-content: center;">
                <input type="checkbox" class="row-select" style="width: 30px; height: 30px; cursor: pointer; margin: 0;">
                <button onclick="deleteRow(this)" class="btn-delete" style="margin: 0; padding: 5px; font-size: 16px;width: 40px; height: 40px;">🗑</button>
            </div>
        </td>
    `;

    setupListeners(row);
    return row;
}

// ========== إنشاء صف مرتجع في الذاكرة ==========
function createReturnRowFragment(data = {}) {
    const row = document.createElement('tr');

    row.dataset.trxId = data.id || '';
    row.dataset.productId = data.product_id || '';
    row.dataset.type = 'return';
    row.dataset.serialNumber = data.serial_number || '';

    // PORMET Fix 1: Add stable creation ID
    if (!data.id) {
        row.dataset.creationId = crypto.randomUUID();
        row.dataset.creationTime = Date.now().toString();
    }

    const qtyVal = data.quantity || 1;
    const priceVal = data.price || 0;
    const totalVal = (Number(qtyVal) * Number(priceVal)) || 0;
    const dateVal = data.date || new Date().toISOString().split('T')[0];
    const timeVal = data.time ? formatTimeTo12Hour(data.time) : getCurrentTime12Hour();

    row.innerHTML = `
        <td><input type="date" class="date" value="${dateVal}"></td>
        <td><input type="text" class="time" value="${timeVal}" placeholder="مثال: 02:30 PM" maxlength="8" style="width: 90px; text-align: center;"></td>
        <td>
            <input type="text" class="item-input" 
                   value="${data.item || data.serial_number || ''}" 
                   placeholder="أدخل السيريال أو اسم المنتج"
                   list="productSuggestions">
        </td>
        <td><input type="number" class="quantity" value="${qtyVal}" min="1"></td>
        <td><input type="number" class="price" value="${priceVal}" step="0.01" placeholder="سعر المرتجع"></td>
        <td class="total">-${totalVal.toFixed(2)}</td>
        <td><span class="type-badge return">مرتجع</span></td>
        <td>
            <input type="text" class="notes" value="${(data.notes || '').replace(/"/g, '&quot;')}" placeholder="ملاحظات">
        </td>
        <td>
            <div style="display: flex; gap: 8px; align-items: center; justify-content: center;">
                <input type="checkbox" class="row-select" style="width: 20px; height: 20px; cursor: pointer; margin: 0;">
                <button onclick="deleteRow(this)" class="btn-delete" style="margin: 0; padding: 5px; font-size: 16px;">🗑</button>
            </div>
        </td>
    `;

    row.style.backgroundColor = '#FFA07A';
    setupReturnRowListeners(row);
    return row;
}

// PORMET Fix 6: Use document fragment for bulk operations
function addMultipleRows(rowsData = []) {
    const table = document.getElementById('customerTransactionTable');
    const tbody = table.querySelector('tbody') || table;

    if (rowsData.length === 0) return;

    const fragment = document.createDocumentFragment();

    rowsData.forEach(data => {
        let row;
        if (data.type === 'return') {
            row = createReturnRowFragment(data);
        } else {
            row = createRowFragment(data);
        }
        if (row) {
            fragment.appendChild(row);
        }
    });

    tbody.appendChild(fragment);
    debouncedUpdateSummary();
}

// PORMET Fix 6: Use document fragment for loading transactions
ipcRenderer.on('customer-transactions-month-data', (event, { transactions, isRecent, dates }) => {
    const table = document.getElementById('customerTransactionTable');
    const tbody = table.querySelector('tbody') || table;

    if (isRecent && dates && dates.length > 0) {
        document.getElementById('currentMonthName').textContent = `آخر يومي عمل (${dates.join(' | ')})`;
    } else if (event.isToday) {
        document.getElementById('currentMonthName').textContent = 'اليوم';
    }

    // ⭐⭐ استخدام DocumentFragment لتحسين الأداء
    const fragment = document.createDocumentFragment();

    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = '';
        debouncedUpdateSummary();
        return;
    }

    transactions.forEach(t => {
        let row;
        if (t.type === 'return') {
            row = createReturnRowFragment(t); // إنشاء الصف في الذاكرة
        } else {
            row = createRowFragment(t); // إنشاء الصف في الذاكرة
        }
        if (row) {
            fragment.appendChild(row);
        }
    });

    // ⭐⭐ تحديث DOM مرة واحدة فقط
    tbody.innerHTML = '';
    tbody.appendChild(fragment);

    debouncedUpdateSummary();
});

// ========== إعداد المستمعات للصف المرتجع ==========
function setupReturnRowListeners(row) {
    const itemInput = row.querySelector('.item-input');

    if (itemInput) {
        itemInput.addEventListener('change', function () {
            const inputValue = (this.value || "").trim();
            if (inputValue) {
                searchProduct(inputValue, row);
            }
        });

        itemInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                const inputValue = (this.value || "").trim();
                if (inputValue) {
                    searchProduct(inputValue, row);
                    e.preventDefault();
                }
            }
        });

        itemInput.addEventListener('input', debounce(function () {
            const inputValue = (this.value || "").trim();
            if (inputValue.length > 1) {
                showProductSuggestions(inputValue, row);
            }
        }, 300));
    }

    setupListeners(row);
}

// ========== عند فتح الصفحة ==========
document.addEventListener('DOMContentLoaded', () => {
    const currentDate = new Date();
    const monthPicker = document.getElementById('monthPicker');
    const yearPicker = document.getElementById('yearPicker');

    if (monthPicker) monthPicker.value = currentDate.getMonth() + 1;
    if (yearPicker) yearPicker.value = currentDate.getFullYear();

    document.getElementById('monthPicker').addEventListener('change', loadMonthData);
    document.getElementById('yearPicker').addEventListener('change', loadMonthData);

    createSaveIndicator();
    loadCustomerData();
    setupProductSearch();

    // تحميل بيانات الشهر الحالي
    loadRecentData();

    // التمرير لقسم الملخص تلقائياً عند الفتح ليكون في منتصف الشاشة
    setTimeout(() => {
        const summaryElement = document.getElementById('summary');
        if (summaryElement) {
            summaryElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 400);

    // إعداد بحث المعاملات (فلترة الصنف)
    const filterInput = document.getElementById('filterTransactionInput');
    if (filterInput) {
        filterInput.addEventListener('input', () => {
            filterTransactions();
        });
        // دعم مفتاح Enter للبحث
        filterInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                filterTransactions();
            }
        });
    }

    // إعداد حقول الدفع: Enter key ووقت افتراضي
    const paymentAmountInput = document.getElementById('paymentAmount');
    const paymentTimeInput = document.getElementById('paymentTime');
    const paymentMethodSelect = document.getElementById('paymentMethod');
    const paymentNotesInput = document.getElementById('paymentNotes');

    // تعيين الوقت الحالي تلقائياً
    if (paymentTimeInput) {
        paymentTimeInput.value = getCurrentTime12Hour();

        // إضافة placeholder ومساعدة في الإدخال
        paymentTimeInput.addEventListener('input', function (e) {
            let value = this.value.replace(/\D/g, ''); // إزالة كل شيء ما عدا الأرقام

            if (value.length >= 1) {
                value = value.substring(0, 4); // الحد الأقصى 4 أرقام

                // تنسيق الوقت أثناء الكتابة
                if (value.length === 1) {
                    this.value = value + ':';
                } else if (value.length === 2) {
                    this.value = value + ':';
                } else if (value.length === 3) {
                    this.value = value.substring(0, 2) + ':' + value.substring(2);
                } else if (value.length === 4) {
                    this.value = value.substring(0, 2) + ':' + value.substring(2) + ' ';

                    // إضافة AM/PM تلقائياً
                    const hours = parseInt(value.substring(0, 2));
                    if (hours >= 12) {
                        setTimeout(() => {
                            this.value = this.value.trim() + ' PM';
                        }, 100);
                    } else {
                        setTimeout(() => {
                            this.value = this.value.trim() + ' AM';
                        }, 100);
                    }
                }
            }
        });
    }

    // إضافة event listeners للـ Enter key على جميع حقول الدفع
    if (paymentAmountInput) {
        paymentAmountInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                // إذا كان المبلغ صحيح، انتقل للوقت، وإلا أضف الدفعة مباشرة
                const amount = Number(paymentAmountInput.value) || 0;
                if (amount > 0) {
                    paymentTimeInput.focus();
                } else {
                    addPayment(); // محاولة إضافة (ستظهر رسالة خطأ)
                }
            }
        });
    }

    if (paymentTimeInput) {
        paymentTimeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                paymentMethodSelect.focus();
            }
        });
    }

    if (paymentMethodSelect) {
        paymentMethodSelect.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                paymentNotesInput.focus();
            }
        });
    }

    if (paymentNotesInput) {
        paymentNotesInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addPayment();
            }
        });
    }
});

// وظائف التنقل
function loadPage(page) {
    ipcRenderer.send('load-page', page);
}

// تحديث شارة الإشعارات
async function updateNotificationBadge() {
    try {
        const lowStockProducts = await ipcRenderer.invoke('get-low-stock-products');
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            if (lowStockProducts.length > 0) {
                badge.textContent = lowStockProducts.length;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }
    } catch (err) {
        console.error('Error updating badge:', err);
    }
}

function showNotification(message, type = "info") {
    const box = document.getElementById("globalNotification");
    box.className = "";
    box.classList.add(type);
    box.textContent = message;
    box.style.display = "block";

    setTimeout(() => {
        box.style.display = "none";
    }, 5000);
}

function highlightActiveNavButton() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navButtons = document.querySelectorAll('nav button');
    navButtons.forEach(button => button.classList.remove('active'));

    const activeButton = document.querySelector(`nav button[onclick*="${currentPage}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }
}

// زر الصعود للأعلى
document.getElementById("scrollTopBtn").addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
});

// زر النزول لأسفل
document.getElementById("scrollBottomBtn").addEventListener("click", () => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
});

// إعداد حالة الاتصال
function setupConnectionStatus() {
    let connectionStatus = document.getElementById('connection-status');
    if (!connectionStatus) {
        connectionStatus = document.createElement('div');
        connectionStatus.id = 'connection-status';
        connectionStatus.className = 'connection-status';
        document.body.appendChild(connectionStatus);
    }

    // استمع لتغييرات حالة الاتصال
    ipcRenderer.on('connection-status', (event, { online }) => {
        if (connectionStatus) {
            if (online) {
                connectionStatus.textContent = '🟢 متصل';
                connectionStatus.className = 'connection-status online';
            } else {
                connectionStatus.textContent = '🔴 غير متصل';
                connectionStatus.className = 'connection-status offline';
            }
        }
    });
}

// تحديث الجرس وتفعيل الزر النشط عند التحميل
window.addEventListener('load', () => {
    updateNotificationBadge();
    highlightActiveNavButton();
    setupConnectionStatus();
    // تحديث دوري للإشعارات كل 30 ثانية
    setInterval(updateNotificationBadge, 30000);
});

// Make functions globally available
window.editPayment = editPayment;
window.deletePayment = deletePayment;
window.addPayment = addPayment;
window.addRow = addRow;
window.addReturnRow = addReturnRow;
window.deleteRow = deleteRow;
window.loadPage = loadPage;

function filterTransactions() {
    const term = (document.getElementById('filterTransactionInput')?.value || "").toLowerCase().trim();
    const rows = document.querySelectorAll('#customerTransactionTable tr');

    rows.forEach(row => {
        const itemInput = row.querySelector('.item') || row.querySelector('.item-input');
        const notesInput = row.querySelector('.notes');

        const itemName = (itemInput ? itemInput.value : '').toLowerCase();
        const notes = (notesInput ? notesInput.value : '').toLowerCase();

        if (itemName.includes(term) || notes.includes(term)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });

    if (term) {
        showSaveIndicator(`🔍 تم العثور على النتائج`, '#2196F3');
    }
}

function clearTransactionFilter() {
    const input = document.getElementById('filterTransactionInput');
    if (input) {
        input.value = '';
        filterTransactions();
        showSaveIndicator(`✓ تم استعادة كافة البيانات`, '#4CAF50');
    }
}

window.filterTransactions = filterTransactions;
window.clearTransactionFilter = clearTransactionFilter;

function toggleSelectAllRows(checked) {
    const checkboxes = document.querySelectorAll('.row-select');
    checkboxes.forEach(cb => cb.checked = checked);
}

function printSelectedReceipt() {
    const rows = document.querySelectorAll('#customerTransactionTable tr');
    const selectedRows = Array.from(rows).filter(row => row.querySelector('.row-select:checked'));

    if (selectedRows.length === 0) {
        showNotification('⚠️ يرجى تحديد بعض العناصر أولاً', 'warning');
        return;
    }

    const items = [];
    let totalPrice = 0;

    selectedRows.forEach(row => {
        const itemInput = row.querySelector('.item') || row.querySelector('.item-input');
        const qtyInput = row.querySelector('.quantity');
        const priceInput = row.querySelector('.price');
        const totalCell = row.querySelector('.total');

        const itemName = itemInput.value || '';
        const quantity = Number(qtyInput.value) || 0;
        const price = Number(priceInput.value) || 0;
        const totalText = totalCell.textContent.replace('-', '');
        const totalValue = Number(totalText) || (quantity * price);
        const isReturn = row.dataset.type === 'return';

        items.push({
            name: itemName,
            qty: quantity,
            price: price,
            total: isReturn ? -totalValue : totalValue
        });

        totalPrice += (isReturn ? -totalValue : totalValue);
    });

    const today = new Date();
    const dateStr = today.getFullYear() + '/' +
        String(today.getMonth() + 1).padStart(2, '0') + '/' +
        String(today.getDate()).padStart(2, '0');
    let hours = today.getHours();
    const minutes = String(today.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';

    hours = hours % 12;
    hours = hours ? hours : 12;

    const timeStr = `${hours}:${minutes} ${ampm}`;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                @media print {
                    @page { 
                        margin: 0; 
                        size: 72mm auto;
                    }
                    body { 
                        margin: 0 !important; 
                        padding: 0 !important; 
                    }
                }
                
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                html, body {
                    width: 72mm;
                    max-width: 72mm;
                    margin: 0;
                    padding: 0;
                }
                
                body {
                    font-family: 'Segoe UI', 'Arial', 'Tahoma', sans-serif;
                    padding: 5mm 2mm;
                    text-align: center;
                    direction: rtl;
                    background: white;
                    color: #000;
                }
                
                .header { 
                    font-size: 28px; 
                    font-weight: 800; 
                    margin-bottom: 2mm;
                    text-align: center;
                    border-bottom: 2px solid #000;
                    padding-bottom: 2mm;
                }
                
                .customer-name {
                    font-size: 20px;
                    font-weight: 700;
                    margin: 2mm 0;
                    text-decoration: underline;
                }

                .date-time { 
                    display: flex;
                    justify-content: space-between;
                    font-size: 14px; 
                    font-weight: 600; 
                    margin-bottom: 3mm;
                    padding: 0 2mm;
                }
                
                .line { 
                    border-top: 2px solid #000; 
                    width: 100%; 
                    margin: 2mm 0;
                }
                
                .item-container { 
                    width: 100%; 
                    margin-bottom: 4mm; 
                    padding: 2mm 1mm; 
                    border: 1px solid #eee;
                    border-radius: 4px;
                    text-align: right;
                }
                
                .item-name { 
                    display: block; 
                    font-size: 18px; 
                    font-weight: 800;
                    margin-bottom: 2mm; 
                    color: #000;
                    border-bottom: 1px solid #ddd;
                    padding-bottom: 1mm;
                }
                
                .item-details { 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center;
                    font-size: 16px;
                    font-weight: 700;
                    width: 100%;
                }
                
                .total-section { 
                    font-size: 24px; 
                    margin-top: 5mm; 
                    background: #000; 
                    color: #fff;
                    padding: 4mm; 
                    width: 100%; 
                    border-radius: 6px;
                    text-align: center;
                    font-weight: 900;
                }
                
                .footer {
                    margin-top: 6mm;
                    padding-top: 4mm;
                    border-top: 1px dashed #000;
                    font-size: 14px;
                    font-weight: 700;
                }
            </style>
        </head>
        <body>
            <div class="header">الجداوي فون</div>
            <div class="customer-name">العميل: ${document.getElementById('customerName').textContent.replace('👤 ', '')}</div>
            <div class="date-time">
                <span>التاريخ: ${dateStr}</span>
                <span>الوقت: ${timeStr}</span>
            </div>
            <div class="line"></div>
            ${items.map(item => `
                <div class="item-container">
                    <span class="item-name">${item.name}</span>
                    <div class="item-details">
                        <span>الكمية: ${item.qty} × ${item.price.toFixed(2)}</span>
                        <span>${item.total.toFixed(2)} ج</span>
                    </div>
                </div>
            `).join('')}
            <div class="total-section">الإجمالي: ${totalPrice.toFixed(2)} جنيه</div>
            <div class="footer">
                شكراً لزيارتكم 🙏<br>
                نتمنى لكم يوماً سعيداً
            </div>
            <script>
                window.onload = function() {
                    setTimeout(() => {
                        window.print();
                        setTimeout(() => window.close(), 500);
                    }, 300);
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}



window.toggleSelectAllRows = toggleSelectAllRows;
window.printSelectedReceipt = printSelectedReceipt;

// دالة طباعة بيانات العميل والمحل
function printCustomerInfoSticker() {
    const customerName = document.getElementById('customerName').textContent.replace('👤 ', '').trim();
    const shopName = document.getElementById('shopNameInput').value.trim();

    // حفظ البيانات للمرة القادمة
    localStorage.setItem('savedShopName', shopName);

    if (typeof printCustomerSticker === 'function') {
        printCustomerSticker(customerName, '', shopName);
    } else {
        console.error('printCustomerSticker function not found');
    }
}
window.printCustomerInfoSticker = printCustomerInfoSticker;
async function forceSyncThisCustomer() {
    const confirmed = await appConfirm('هل تريد إجبار مزامنة كافة بيانات هذا العميل مع السحابة الآن؟', 'مزامنة شاملة');
    if (!confirmed) return;

    try {
        showSaveIndicator('⏳ جاري تحضير البيانات للمزامنة...', '#2196F3');
        const result = await ipcRenderer.invoke('force-sync-customer', customerId);
        if (result.success) {
            showSaveIndicator('🚀 بدأت المزامنة الشاملة بنجاح - يرجى مراقبة شريط التحميل', '#4CAF50');
        } else {
            showSaveIndicator('❌ فشل تحضير البيانات: ' + result.error, '#F44336');
        }
    } catch (err) {
        console.error('Force sync error:', err);
        showSaveIndicator('❌ حدث خطأ أثناء طلب المزامنة', '#F44336');
    }
}
window.forceSyncThisCustomer = forceSyncThisCustomer;

// استماع لتقدم المزامنة
ipcRenderer.on('sync-progress', (event, { progress, message }) => {
    const indicator = document.getElementById('save-indicator') || createSaveIndicator();
    indicator.style.display = 'block';
    indicator.style.opacity = '1';

    if (progress < 100) {
        indicator.innerHTML = `
            <div style="text-align: right; margin-bottom: 5px; font-size: 12px;">${message}</div>
            <div style="width: 200px; background: rgba(255,255,255,0.3); height: 8px; border-radius: 4px; overflow: hidden;">
                <div style="width: ${progress}%; background: #fff; height: 100%; transition: width 0.3s;"></div>
            </div>
            <div style="text-align: left; font-size: 10px; margin-top: 5px;">${progress}%</div>
        `;
        indicator.style.backgroundColor = '#2196F3';
    } else {
        indicator.textContent = "✅ " + message;
        indicator.style.backgroundColor = '#4CAF50';
        setTimeout(() => {
            indicator.style.opacity = '0';
            setTimeout(() => { indicator.style.display = 'none'; }, 300);
        }, 3000);
    }
});

// تحميل البيانات المحفوظة عند فتح الصفحة
document.addEventListener('DOMContentLoaded', () => {
    const savedName = localStorage.getItem('savedShopName');
    // إذا كان الاسم هو "احمد" (الافتراضي القديم)، لا تضعه واترك الحقل فارغاً للمستخدم
    if (savedName && savedName !== 'احمد' && document.getElementById('shopNameInput')) {
        document.getElementById('shopNameInput').value = savedName;
    }
});
