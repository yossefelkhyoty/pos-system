//renderer.js

const { ipcRenderer } = require('electron');

let isSaving = false;
let isLoading = false;
let justLoaded = false;
let autoSaveTimeout = null;
let autoSaveHandler = null;
let saveIndicatorTimeout = null;
let pendingSaveData = null;
let lastSaveTime = 0;

let saveQueue = [];
let isProcessingQueue = false;
const SAVE_DELAY = 1000; // تأخير 1 ثانية بين عمليات الحفظ


// إنشاء مؤشر الحفظ
function createSaveIndicator() {
  const indicator = document.createElement('div');
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
  `;
  document.body.appendChild(indicator);
  return indicator;
}

// عرض مؤشر الحفظ
function showSaveIndicator() {
  const indicator = document.getElementById('save-indicator') || createSaveIndicator();
  indicator.style.display = 'block';
  indicator.textContent = 'جاري الحفظ...';
  indicator.style.backgroundColor = '#2196F3';

  if (saveIndicatorTimeout) {
    clearTimeout(saveIndicatorTimeout);
  }
}

// إخفاء مؤشر الحفظ
function hideSaveIndicator(success) {
  const indicator = document.getElementById('save-indicator');
  if (indicator) {
    indicator.textContent = success ? '✓ تم الحفظ' : '✗ فشل في الحفظ';
    indicator.style.backgroundColor = success ? '#4CAF50' : '#F44336';

    if (saveIndicatorTimeout) {
      clearTimeout(saveIndicatorTimeout);
    }

    saveIndicatorTimeout = setTimeout(() => {
      indicator.style.display = 'none';
    }, 2000);
  }
}

// تعطيل/تمكين الحقول أثناء الحفظ
function setInputsDisabled(disabled) {
  const inputs = document.querySelectorAll('#transactionTable input, #transactionTable button');
  inputs.forEach(input => {
    // استثناءات: item + account + withdraw + notes
    if (
      !input.classList.contains('item') &&
      !input.classList.contains('account') &&
      !input.classList.contains('withdraw') &&
      !input.classList.contains('notes')
    ) {
      input.disabled = disabled;
    }
  });

  const addButton = document.querySelector('button[onclick="addRow()"]');
  if (addButton) {
    addButton.disabled = disabled;
  }
}


// إعداد مستمعات الإدخال
function setupInputListeners() {
  const inputs = document.querySelectorAll('#transactionTable input');

  inputs.forEach(input => {
    input.removeEventListener('input', handleInputEvent);
    input.removeEventListener('blur', handleBlurEvent);
    input.removeEventListener('keydown', handleKeyDown); // إضافة مستمع جديد


    input.addEventListener('input', handleInputEvent);
    input.addEventListener('blur', handleBlurEvent);
    input.addEventListener('keydown', handleKeyDown); // إضافة مستمع جديد

  });
}

// معالج حدث الضغط على المفاتيح
async function handleKeyDown(e) {
  // Auto-fill عند Enter في حقل الصنف
  if (e.target.classList.contains('item') && e.key === 'Enter') {
    e.preventDefault();
    const serialNumber = e.target.value.trim();
    if (serialNumber) {
      await autoFillProductFromSerialInMain(serialNumber, e.target.closest('tr'));
      // Focus على حقل الحساب بعد ملء البيانات
      const accountInput = e.target.closest('tr').querySelector('.account');
      if (accountInput) {
        setTimeout(() => accountInput.focus(), 100);
      }
    }
    return;
  }

  // إذا كان المستخدم يكتب في آخر صف، أضف صفًا جديدًا تلقائيًا
  autoAddRow(e.target);
}

// إضافة صف تلقائي عند الحاجة
// إضافة صف تلقائي عند الحاجة
function autoAddRow(currentInput) {
  const table = document.getElementById('transactionTable');
  const rows = table.getElementsByTagName('tr');
  const lastRow = rows[rows.length - 1];

  // التحقق إذا كان الحقل الحالي في آخر صف
  if (currentInput.closest('tr') === lastRow) {
    const inputs = lastRow.querySelectorAll('input');
    const hasData = Array.from(inputs).some(input => {
      if (input.type === 'number') {
        return parseFloat(input.value) > 0;
      }
      return input.value.trim() !== '';
    });

    // إذا كان هناك بيانات في آخر صف، أضف صفًا جديدًا
    if (hasData) {
      addRowSilent(); // استخدام دالة الإضافة الصامتة
    }
  }
}

// إضافة صف جديد بدون تركيز تلقائي
function addRowSilent() {
  const table = document.getElementById('transactionTable');
  const newRow = table.insertRow();
  newRow.className = 'fade-in';
  newRow.innerHTML = `
    <td><input type="text" class="item"></td>
    <td><input type="number" class="account" step="0.01"></td>
    <td><input type="number" class="withdraw" step="0.01"></td>
    <td><input type="text" class="notes"></td>
    <td><button onclick="deleteRow(this)">حذف</button></td>
  `;

  setupInputListeners();
}

// معالج حدث الإدخال - محسّن للأداء
function handleInputEvent(e) {
  if (e.target.classList.contains('account') || e.target.classList.contains('withdraw')) {
    e.target.dataset.tempValue = e.target.value;
    updateSummary();
  }

  // التحقق من الحاجة لإضافة صف جديد
  autoAddRow(e.target);

  // تأخير الحفظ التلقائي للسماح بالكتابة المستمرة
  debouncedAutoSave();
}
// معالج حدث فقدان التركيز
async function handleBlurEvent(e) {
  if (e.target.classList.contains('account') || e.target.classList.contains('withdraw')) {
    const value = parseFloat(e.target.value) || 0;
    e.target.value = value;
    updateSummary();
  }

  // Auto-fill بيانات المنتج من السيريال نمبر في حقل الصنف
  if (e.target.classList.contains('item')) {
    const serialNumber = e.target.value.trim();
    if (serialNumber && serialNumber.length >= 5) {
      await autoFillProductFromSerialInMain(serialNumber, e.target.closest('tr'));
    }
  }

  // حفظ فوري عند فقدان التركيز
  immediateAutoSave();
}

// تأخير الاستدعاء لتحسين الأداء
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

// الحفظ التلقائي مع تأخير
const debouncedAutoSave = debounce(() => {
  if (Date.now() - lastSaveTime > 1000) { // منع الحفظ المتكرر جداً
    prepareAutoSave();
  }
}, 800); // تأخير 800 مللي ثانية

// الحفظ الفوري
function immediateAutoSave() {
  prepareAutoSave();
}

// تجهيز البيانات للحفظ
function prepareAutoSave() {
  const date = document.getElementById('datePicker').value;
  if (!date || isSaving || isLoading || justLoaded) {
    return;
  }

  const rows = document.querySelectorAll('#transactionTable tr');
  const data = Array.from(rows).map(row => {
    const item = row.querySelector('.item')?.value.trim() || '';
    const account = parseFloat(row.querySelector('.account')?.value) || 0;
    const withdraw = parseFloat(row.querySelector('.withdraw')?.value) || 0;

    const notes = row.querySelector('.notes')?.value.trim() || '';
    return { item, account, withdraw, notes };
  }).filter(entry =>
    entry.item !== '' || entry.account !== 0 || entry.withdraw !== 0 || entry.notes !== ''
  );

  // إضافة طلب الحفظ إلى قائمة الانتظار
  saveQueue.push({ date, data });

  // معالجة قائمة الانتظار إذا لم تكن تعمل بالفعل
  if (!isProcessingQueue) {
    processSaveQueue();
  }
}

function processSaveQueue() {
  if (saveQueue.length === 0) {
    isProcessingQueue = false;
    return;
  }

  isProcessingQueue = true;
  const { date, data } = saveQueue.shift();

  // التأكد من وجود بيانات للحفظ
  if (data && data.length > 0) {
    executeAutoSave(date, data);
  }

  // معالجة العنصر التالي في قائمة الانتظار بعد تأخير
  setTimeout(processSaveQueue, SAVE_DELAY);
}


// تنفيذ الحفظ التلقائي
// في renderer.js - تعديل دالة executeAutoSave
function executeAutoSave(date, data) {
  if (isSaving) {
    // إذا كانت هناك عملية حفظ جارية، أعد العنصر إلى قائمة الانتظار
    saveQueue.unshift({ date, data });
    return;
  }

  isSaving = true;
  showSaveIndicator();
  setInputsDisabled(true);

  ipcRenderer.send('auto-save', { date, data });

  if (autoSaveHandler) {
    ipcRenderer.removeListener('auto-save-response', autoSaveHandler);
  }

  autoSaveHandler = (event, response) => {
    isSaving = false;
    setInputsDisabled(false);
    hideSaveIndicator(response.success);
    lastSaveTime = Date.now();

    if (response.success) {
      updateSummary();
    }
  };

  ipcRenderer.once('auto-save-response', autoSaveHandler);
}

// إضافة هذه الدالة لتفريغ ذاكرة التخزين المؤقت
function clearSaveQueue() {
  saveQueue = [];
  isProcessingQueue = false;
}

// البحث في البيانات
function searchData() {
  const itemQuery = document.getElementById('searchItem').value.trim();
  const notesQuery = document.getElementById('searchNotes').value.trim();
  const year = document.getElementById('filterYear').value;
  const month = document.getElementById('filterMonth').value;
  const day = document.getElementById('filterDay').value;

  if (!itemQuery && !notesQuery && !year && !month && !day) {
    document.getElementById('searchResults').innerHTML = '';
    return;
  }

  const filter = {};
  if (year) filter.year = year;
  if (month) filter.month = month;
  if (day) filter.day = day;

  ipcRenderer.send('search-data', {
    item: itemQuery,
    notes: notesQuery,
    filter
  });
}

// معالج نتائج البحث
ipcRenderer.on('search-results', (event, rows) => {
  const container = document.getElementById('searchResults');
  container.innerHTML = '';

  if (rows.length === 0) {
    container.innerHTML = '<div class="search-row">لا توجد نتائج</div>';
    return;
  }

  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  rows.forEach(row => {
    const date = new Date(row.date);
    const dayName = days[date.getDay()];

    const div = document.createElement('div');
    div.className = 'search-row fade-in';
    div.innerHTML = `
      <strong>التاريخ:</strong> ${row.date} (${dayName}) |
      <strong>الصنف:</strong> ${row.item} |
      <strong>الحساب:</strong> ${row.account} |
      <strong>السحب:</strong> ${row.withdraw} |
      <strong>الملاحظات:</strong> ${row.notes}
    `;
    container.appendChild(div);
  });
});

// مسح البحث
function clearSearch() {
  document.getElementById('searchItem').value = '';
  document.getElementById('searchNotes').value = '';
  document.getElementById('filterYear').value = '';
  document.getElementById('filterMonth').value = '';
  document.getElementById('filterDay').value = '';
  document.getElementById('searchResults').innerHTML = '';
}

// تحديث اسم اليوم
function updateDayName() {
  const dateInput = document.getElementById('datePicker').value;
  if (!dateInput) return;
  const date = new Date(dateInput);
  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  document.getElementById('dayName').textContent = `اليوم: ${days[date.getDay()]}`;
}

function setTodayDate() {
  const datePicker = document.getElementById('datePicker');
  if (datePicker) {
    datePicker.value = new Date().toISOString().split('T')[0];
    loadDataByDate();
  }
}

// تحميل البيانات حسب التاريخ
function loadDataByDate() {
  if (isLoading) return;

  isLoading = true;
  justLoaded = true;

  updateDayName();
  const date = document.getElementById('datePicker').value;
  ipcRenderer.send('load-data', date);

  setTimeout(() => {
    const table = document.getElementById('transactionTable');
    if (table.rows.length === 0) {
      addRow();
    }
    setupInputListeners();
  }, 500);
}

// معالج استجابة تحميل البيانات
ipcRenderer.on('load-data-response', (event, rows) => {
  const table = document.getElementById('transactionTable');

  while (table.rows.length > 0) {
    table.deleteRow(0);
  }

  isLoading = true;
  justLoaded = true;

  if (rows.length > 0) {
    rows.forEach(rowData => {
      addRowWithData(rowData);
    });
  } else {
    addRow();
  }

  setupInputListeners();
  updateSummary();

  setTimeout(() => {
    justLoaded = false;
    isLoading = false;
  }, 1000);
});

// إضافة صف ببيانات
function addRowWithData(rowData) {
  const table = document.getElementById('transactionTable');
  const newRow = table.insertRow();
  newRow.className = 'fade-in';

  // التحقق إذا كان منتج (بدلالة السيريال في الملاحظات)
  const isProduct = rowData.notes && rowData.notes.includes('سيريال:');

  newRow.innerHTML = `
    <td><input type="text" class="item" value="${rowData.item || ''}" ${isProduct ? 'readonly' : ''}></td>
    <td><input type="number" class="account" step="0.01" value="${rowData.account || 0}"></td>
    <td><input type="number" class="withdraw" step="0.01" value="${rowData.withdraw || 0}"></td>
    <td><input type="text" class="notes" value="${rowData.notes || ''}"></td>
    <td><button onclick="deleteRow(this)">حذف</button></td>
  `;

  if (isProduct) {
    const serialMatch = rowData.notes.match(/سيريال:\s*(\S+)/);
    if (serialMatch) {
      newRow.dataset.serialNumber = serialMatch[1];
      newRow.dataset.quantityDecreased = 'true'; // مفترض أنها نقصت بالفعل عند الإضافة لأول مرة
    }
  }
}

// إضافة صف جديد
// إضافة صف جديد (النسخة الأصلية - للاستخدام اليدوي)
function addRow() {
  const table = document.getElementById('transactionTable');
  const newRow = table.insertRow();
  newRow.className = 'fade-in';
  newRow.innerHTML = `
    <td><input type="text" class="item"></td>
    <td><input type="number" class="account" step="0.01"></td>
    <td><input type="number" class="withdraw" step="0.01"></td>
    <td><input type="text" class="notes"></td>
    <td><button onclick="deleteRow(this)">حذف</button></td>
  `;

  setupInputListeners();

  // التركيز تلقائيًا على حقل الصنف في الصف الجديد (فقط عند الإضافة اليدوية)
  setTimeout(() => {
    const inputs = newRow.getElementsByTagName('input');
    if (inputs.length > 0) {
      inputs[0].focus();
    }
  }, 100);
}

// حذف صف
async function deleteRow(button) {
  const table = document.getElementById('transactionTable');
  if (table.rows.length <= 1) {
    showNotification("لا يمكن حذف آخر صف متبقي!");
    return;
  }

  const row = button.parentNode.parentNode;

  // ✅ استرجاع بيانات المنتج من الصف
  const itemName = row.querySelector('.item')?.value.trim();
  const notes = row.querySelector('.notes')?.value.trim();

  const msg = itemName
    ? `هل أنت متأكد من حذف الصنف "${itemName}" من الصفحة الرئيسية؟`
    : 'هل أنت متأكد من حذف هذا الصنف من الصفحة الرئيسية؟';
  const confirmed = await appConfirm(msg, 'حذف صنف');
  if (!confirmed) return;

  // ✅ لو الصف مرتبط بمنتج من جدول المنتجات
  if (notes && notes.includes("سيريال:")) {
    const serialMatch = notes.match(/سيريال:\s*(\S+)/);
    if (serialMatch) {
      const serialNumber = serialMatch[1];

      // نجيب المنتج من قاعدة البيانات عن طريق السيريال
      ipcRenderer.invoke('get-products', { search: serialNumber })
        .then(result => {
          if (result.products.length > 0) {
            const product = result.products[0];

            // نرجع الكمية للمنتج
            ipcRenderer.invoke('increase-product-quantity', { id: product.id, amount: 1 })
              .then(() => updateNotificationBadge())
              .catch(err => console.error('Error increasing quantity:', err));
          }
        })
        .catch(err => console.error('Error finding product:', err));
    }
  }

  // ✅ حذف الصف من الواجهة
  row.classList.add('fade-out');
  setTimeout(() => {
    row.remove();
    updateSummary();
    immediateAutoSave();
  }, 300);
}


// تحديث الملخص
function updateSummary() {
  const accounts = document.querySelectorAll('.account');
  const withdraws = document.querySelectorAll('.withdraw');

  let totalAccount = 0;
  let totalWithdraw = 0;

  accounts.forEach(account => {
    totalAccount += parseFloat(account.value) || 0;
  });

  withdraws.forEach(withdraw => {
    totalWithdraw += parseFloat(withdraw.value) || 0;
  });

  const netIncome = totalAccount - totalWithdraw;
  const summaryElement = document.getElementById('summary');

  summaryElement.innerHTML = `
    <span>مجموع الحساب: <b>${totalAccount.toFixed(2)}</b></span> | 
    <span>مجموع السحب: <b>${totalWithdraw.toFixed(2)}</b></span> | 
    <span>صافي الدخل: <b style="color: ${netIncome >= 0 ? '#4fff58' : '#c62828'}">${netIncome.toFixed(2)}</b></span>
  `;
}

// حذف جميع البيانات
async function deleteAllData() {
  const result = await appSecureDelete(
    'أنت على وشك <strong>حذف كافة البيانات</strong> من البرنامج.<br>الرجاء كتابة "مسح كل البيانات" وإدخال كلمة مرور الأدمن للتأكيد:',
    'حذف شامل لكافة البيانات',
    { extra: 'اكتب: مسح كل البيانات', password: 'كلمة مرور الأدمن' }
  );

  if (!result) return;

  if (result.extra !== 'مسح كل البيانات') {
    showNotification("❌ عبارة التأكيد غير صحيحة", "danger");
    return;
  }

  const resultDelete = await ipcRenderer.invoke('secure-delete-all-main-data', result.password);
  if (resultDelete.success) {
    showNotification('تم حذف جميع البيانات بنجاح', 'success');
    loadDataByDate();
  } else {
    showNotification('❌ فشل: ' + resultDelete.error, 'danger');
  }
}

// معالج حذف جميع البيانات
ipcRenderer.on('all-data-deleted', () => {
  showNotification('تم حذف جميع البيانات بنجاح');
  loadDataByDate();
});

// حفظ البيانات يدوياً
function saveData() {
  immediateAutoSave();
  showNotification('جاري حفظ البيانات...');
}

// البحث (وظيفة مختصرة للاستدعاء من HTML)
function search() {
  searchData();
}

// إرفاق مستمعي الأحداث للحقول
function attachEventListenersToInputs() {
  setupInputListeners();
}


// البحث عن المنتجات من قاعدة البيانات
// البحث عن المنتجات من قاعدة البيانات
function setupMainSearch() {
  const searchInput = document.getElementById('searchProductMain');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const term = e.target.value.trim();
    const resultsContainer = document.getElementById('searchResultsMain');
    if (!resultsContainer) return;

    if (term) {
      console.log("Searching product for:", term);

      ipcRenderer.send('search-products-main', term);
    } else {
      resultsContainer.innerHTML = '';
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  setupMainSearch();
});



// استلام نتائج البحث
ipcRenderer.on('search-products-results', (event, products) => {
  const container = document.getElementById('searchResultsMain');
  container.innerHTML = '';

  if (products.length === 0) {
    container.innerHTML = '<div class="search-row">لا توجد نتائج</div>';
    return;
  }

  products.forEach(p => {
    const div = document.createElement('div');
    div.className = 'search-row';
    div.textContent = `${p.name} | السعر: ${p.price.toFixed(2)}  | الكمية: ${p.quantity}`;

    div.addEventListener('click', () => {
      addProductRow(p);
      container.innerHTML = '';
      document.getElementById('searchProductMain').value = '';
    });

    container.appendChild(div);
  });
});

// إضافة المنتج كصف جديد في الجدول الحالي
function addProductRow(product) {
  const table = document.getElementById('transactionTable');
  const rows = table.getElementsByTagName('tr');
  let targetRow;

  // التحقق إذا كان آخر صف فارغ تماماً لاستخدامه
  if (rows.length > 0) {
    const lastRow = rows[rows.length - 1];
    const inputs = lastRow.querySelectorAll('input');
    const isEmpty = Array.from(inputs).every(input => input.value.trim() === '' || (input.type === 'number' && parseFloat(input.value) === 0));

    if (isEmpty) {
      targetRow = lastRow;
    }
  }

  if (!targetRow) {
    targetRow = table.insertRow();
    targetRow.className = 'fade-in';
    targetRow.innerHTML = `
      <td><input type="text" class="item"></td>
      <td><input type="number" class="account" step="0.01"></td>
      <td><input type="number" class="withdraw" step="0.01"></td>
      <td><input type="text" class="notes"></td>
      <td><button onclick="deleteRow(this)">حذف</button></td>
    `;
  }

  targetRow.querySelector('.item').value = product.name;
  targetRow.querySelector('.item').readOnly = true;
  targetRow.querySelector('.account').value = product.price;
  targetRow.querySelector('.withdraw').value = "0.00";
  targetRow.querySelector('.notes').value = `سيريال: ${product.serial_number}`;

  targetRow.dataset.productId = product.id;
  targetRow.dataset.serialNumber = product.serial_number;
  targetRow.dataset.quantityDecreased = 'true';

  setupInputListeners();
  updateSummary();
  immediateAutoSave();

  // تقليل الكمية في قاعدة البيانات
  ipcRenderer.invoke('decrease-product-quantity', { id: product.id, amount: 1 })
    .then(() => checkLowStockNotification())
    .catch(err => console.error('Error decreasing quantity:', err));

  // إضافة صف فارغ جديد تلقائياً
  addRowSilent();
}

// التحقق من إشعارات انخفاض المخزون
async function checkLowStockNotification() {
  try {
    const lowStockProducts = await ipcRenderer.invoke('get-low-stock-products');

    if (lowStockProducts.length > 0) {
      showNotification(`⚠️ هناك ${lowStockProducts.length} منتجات وصلت للحد الأدنى من المخزون!`, "warning");
    }

    // تحديث شارة الجرس
    updateNotificationBadge();

  } catch (err) {
    console.error('Error checking low stock:', err);
  }
}


// Auto-fill بيانات المنتج من السيريال نمبر في الصفحة الرئيسية
async function autoFillProductFromSerialInMain(serialNumber, row) {
  try {
    // البحث عن المنتج بالرقم التسلسلي
    const product = await ipcRenderer.invoke('get-product-by-serial', serialNumber);

    if (product) {
      // المنتج موجود - ملء الحقول تلقائياً
      const itemInput = row.querySelector('.item');
      const accountInput = row.querySelector('.account');
      const notesInput = row.querySelector('.notes');

      if (itemInput) itemInput.value = product.name || serialNumber;
      if (accountInput) accountInput.value = product.price || 0;
      if (notesInput) notesInput.value = `سيريال: ${product.serial_number}`;

      // حفظ product_id في row dataset
      row.dataset.productId = product.id;
      row.dataset.serialNumber = product.serial_number;

      // تقليل الكمية في قاعدة البيانات (إذا لم يتم تقليلها من قبل)
      if (!row.dataset.quantityDecreased) {
        ipcRenderer.invoke('decrease-product-quantity', { id: product.id, amount: 1 })
          .then(() => {
            row.dataset.quantityDecreased = 'true';
            checkLowStockNotification();
          })
          .catch(err => console.error('Error decreasing quantity:', err));
      }

      // إظهار إشعار بصري
      if (itemInput) {
        itemInput.style.backgroundColor = '#d4edda';
        setTimeout(() => {
          itemInput.style.backgroundColor = '';
        }, 1000);
      }

      updateSummary();
      debouncedAutoSave();
    }
  } catch (error) {
    console.error('Error auto-filling product from serial:', error);
  }
}

// تحميل صفحة من القائمة
function loadPage(page) {

  ipcRenderer.send('load-page', page);
}
// تحديث شارة الإشعارات (الجرس)
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
  box.className = ""; // مسح الكلاسات القديمة
  box.classList.add(type);
  box.textContent = message;
  box.style.display = "block";

  setTimeout(() => {
    box.style.display = "none";
  }, 5000); // يختفي بعد 5 ثواني
}


// تحميل التنبيهات في صفحة alerts.html
async function loadAlertsPage() {
  const table = document.getElementById('alertsTable');
  if (!table) return;

  // 🟢 تفريغ إشعار الهيدر لما تفتح صفحة التنبيهات
  const alertBox = document.getElementById('globalNotification');
  if (alertBox) {
    alertBox.style.display = "none";
  }

  // 🟢 تفريغ شارة الجرس (badge) لما تفتح صفحة التنبيهات
  const badge = document.getElementById('notificationBadge');
  if (badge) {
    badge.textContent = '';
    badge.style.display = 'none';
  }

  try {
    const lowStockProducts = await ipcRenderer.invoke('get-low-stock-products');
    table.innerHTML = '';

    if (lowStockProducts.length === 0) {
      table.innerHTML = `<tr><td colspan="5">✅ لا توجد منتجات في حالة حرجة</td></tr>`;
      return;
    }

    lowStockProducts.forEach(p => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${p.serial_number}</td>
        <td>${p.name}</td>
        <td>${p.quantity}</td>
        <td>${p.min_quantity}</td>
        <td><button onclick="editProductInAlerts(${p.id})">تعديل</button></td>
      `;
      table.appendChild(row);
    });
  } catch (err) {
    console.error('Error loading alerts:', err);
  }
}


function editProduct(productId) {
  ipcRenderer.send('open-product-edit', productId);
}

// ✅ تعديل المنتج مباشرة من صفحة التنبيهات
async function editProductInAlerts(productId) {
  try {
    const product = await ipcRenderer.invoke('get-product-by-id', parseInt(productId));
    if (!product) {
      showNotification('❌ المنتج غير موجود', 'error');
      return;
    }

    // تعبئة النموذج
    document.getElementById('editAlertProductId').value = product.id;
    document.getElementById('editAlertSerialNumber').value = product.serial_number;
    document.getElementById('editAlertProductName').value = product.name;
    document.getElementById('editAlertPrice').value = product.price;
    document.getElementById('editAlertWholesalePrice').value = product.wholesale_price;
    document.getElementById('editAlertPurchasePrice').value = product.purchase_price || 0;
    document.getElementById('editAlertQuantity').value = product.quantity;
    document.getElementById('editAlertMinQuantity').value = product.min_quantity;
    document.getElementById('editAlertCategory').value = product.category || '';

    // إظهار النافذة
    document.getElementById('editAlertModal').classList.remove('hidden');
  } catch (err) {
    console.error('Error loading product:', err);
    showNotification('❌ خطأ في تحميل المنتج', 'error');
  }
}

function closeAlertEditModal() {
  const modal = document.getElementById('editAlertModal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

// ✅ حفظ التعديلات من صفحة التنبيهات
function setupAlertEditForm() {
  const editAlertForm = document.getElementById('editAlertProductForm');
  if (!editAlertForm) return;

  // إزالة أي مستمعات قديمة
  const newForm = editAlertForm.cloneNode(true);
  editAlertForm.parentNode.replaceChild(newForm, editAlertForm);

  newForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const product = {
      id: parseInt(document.getElementById('editAlertProductId').value),
      serial_number: document.getElementById('editAlertSerialNumber').value,
      name: document.getElementById('editAlertProductName').value,
      price: parseFloat(document.getElementById('editAlertPrice').value),
      wholesale_price: parseFloat(document.getElementById('editAlertWholesalePrice').value),
      purchase_price: parseFloat(document.getElementById('editAlertPurchasePrice').value),
      quantity: parseInt(document.getElementById('editAlertQuantity').value),
      min_quantity: parseInt(document.getElementById('editAlertMinQuantity').value),
      category: document.getElementById('editAlertCategory').value
    };

    try {
      const result = await ipcRenderer.invoke('update-product', product);
      if (result.success) {
        closeAlertEditModal();
        loadAlertsPage(); // إعادة تحميل القائمة
        showNotification('✅ تم تحديث المنتج بنجاح', 'success');
      } else {
        showNotification('❌ فشل في تحديث المنتج', 'error');
      }
    } catch (err) {
      console.error('Error updating product:', err);
      showNotification('❌ خطأ: ' + (err.message || err), 'error');
    }
  });
}


// تمييز الزر النشط في شريط التنقل
function highlightActiveNavButton() {
  // الحصول على اسم الصفحة الحالية
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  // إزالة التمييز من جميع الأزرار
  const navButtons = document.querySelectorAll('nav button');
  navButtons.forEach(button => button.classList.remove('active'));

  // إضافة التمييز للزر المناسب
  const activeButton = document.querySelector(`nav button[onclick*="${currentPage}"]`);
  if (activeButton) {
    activeButton.classList.add('active');
  }
}

function adjustDatePickerPosition() {
  const datePicker = document.getElementById('datePicker');
  if (!datePicker) return;

  // وضعه في الزاوية اليمنى مع تباعد مناسب
  datePicker.style.position = 'absolute';
  datePicker.style.top = '100px';
  datePicker.style.right = '20px';
  datePicker.style.left = 'auto'; // إلغاء الموضع الأيسر إذا كان موجوداً
  datePicker.style.width = '160px';
  datePicker.style.fontSize = '0.9rem';
  datePicker.style.padding = '6px';
}

// عند تحميل أي صفحة
window.onload = () => {
  const today = new Date();
  const datePicker = document.getElementById('datePicker');
  if (datePicker) {
    datePicker.value = today.toISOString().split('T')[0];
  }

  // فلترة التاريخ في البحث
  if (document.getElementById('filterYear')) {
    document.getElementById('filterYear').value = '';
    document.getElementById('filterMonth').value = '';
    document.getElementById('filterDay').value = '';
  }

  // مستمعات البحث في الصفحة الرئيسية
  ['searchItem', 'searchNotes', 'filterYear', 'filterMonth', 'filterDay']
    .forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.removeEventListener('input', searchData);
        element.addEventListener('input', searchData);
      }
    });

  // تحميل بيانات اليوم لو الصفحة الرئيسية
  if (datePicker) {
    loadDataByDate();
    createSaveIndicator();
  }

  adjustDatePickerPosition();


  // تحديث شارة الإشعارات في النافبار
  updateNotificationBadge();

  // تحميل التنبيهات لو كنت في alerts.html
  loadAlertsPage();

  // إعداد نموذج تعديل التنبيهات
  setupAlertEditForm();

  highlightActiveNavButton();

  // تحديث دوري للإشعارات كل 30 ثانية
  setInterval(updateNotificationBadge, 30000);
};

let connectionStatus = document.getElementById('connection-status');
if (!connectionStatus) {
  connectionStatus = document.createElement('div');
  connectionStatus.id = 'connection-status';
  connectionStatus.style.cssText = `
    position: fixed;
    bottom: 10px;
    left: 10px;
    padding: 5px 10px;
    border-radius: 3px;
    font-size: 12px;
    z-index: 1000;
  `;
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

// زر الصعود للأعلى
document.getElementById("scrollTopBtn").addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// زر النزول لأسفل
document.getElementById("scrollBottomBtn").addEventListener("click", () => {
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
});

// بوكس الاستلام
function toggleReceptionModal() {
  const modal = document.getElementById('receptionModal');
  if (modal.style.display === 'flex') {
    modal.style.display = 'none';
  } else {
    modal.style.display = 'flex';
    // تفريغ الحقول عند الفتح
    document.getElementById('personName').value = '';
    document.getElementById('faultDesc').value = '';
    document.getElementById('faultExtra').value = '';
    document.getElementById('devicePassword').value = '';
    // تاريخ اليوم تلقائياً
    document.getElementById('receiveDate').value = new Date().toISOString().split('T')[0];
  }
}

function printReceptionSticker() {
  const data = {
    personName: document.getElementById('personName').value || '---',
    fault: document.getElementById('faultDesc').value || '---',
    faultExtra: document.getElementById('faultExtra').value || '---',
    password: document.getElementById('devicePassword').value || '---',
    receiveDate: document.getElementById('receiveDate').value
  };

  if (typeof printReceiptSticker === 'function') {
    printReceiptSticker(data);
    toggleReceptionModal(); // غلق البوكس بعد الطباعة
  } else {
    console.error('printReceiptSticker function not found');
  }
}

window.toggleReceptionModal = toggleReceptionModal;
window.printReceptionSticker = printReceptionSticker;
