// products.js
const { ipcRenderer } = require('electron');

let products = [];
let editingProductId = null;
let categories = [];

// تمييز الزر النشط في شريط التنقل
function highlightActiveNavButton() {
  // الحصول على اسم الصفحة الحالية
  const currentPage = window.location.pathname.split('/').pop() || 'customers.html';

  // إزالة التمييز من جميع الأزرار
  const navButtons = document.querySelectorAll('nav button');
  navButtons.forEach(button => button.classList.remove('active'));

  // إضافة التمييز للزر المناسب
  const activeButton = document.querySelector(`nav button[onclick*="${currentPage}"]`);
  if (activeButton) {
    activeButton.classList.add('active');
  }

}

document.addEventListener('DOMContentLoaded', async () => {
  // لو في id في الرابط → حمّل المنتج للتعديل مباشرة
  const params = new URLSearchParams(window.location.search);
  const productId = params.get('id');
  if (productId) {
    await loadProductById(productId);
  }

  await loadProducts(); // تأكد من تحميل المنتجات أولاً
  highlightActiveNavButton();
  setupEventListeners();
  setupQRScanner(); // إعداد QR Scanner
  updateNotificationBadge(); // تحديث شارة التنبيهات

  // إعداد حالة الاتصال
  setupConnectionStatus();

  // تحديث دوري للإشعارات كل 30 ثانية
  setInterval(updateNotificationBadge, 30000);

  // إعداد الاقتراحات التلقائية للتصنيفات
  const categoryInput = document.getElementById('category');
  if (categoryInput) {
    const categoryDatalist = document.createElement('datalist');
    categoryDatalist.id = 'categorySuggestions';
    document.body.appendChild(categoryDatalist);
    categoryInput.setAttribute('list', 'categorySuggestions');

    const updateCategorySuggestions = () => {
      categoryDatalist.innerHTML = '';
      const uniqueCategories = [...new Set(categories)]; // إزالة التكرارات
      uniqueCategories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        categoryDatalist.appendChild(option);
      });
    };

    updateCategorySuggestions();

    // تحديث تلقائي باستخدام setInterval (نسخة احتياطية)
    let lastCategories = JSON.stringify(categories);
    setInterval(() => {
      if (lastCategories !== JSON.stringify(categories)) {
        updateCategorySuggestions();
        lastCategories = JSON.stringify(categories);
      }
    }, 1000);

    // خيار أفضل: استخدام MutationObserver لو كانت العناصر ديناميكية
    // const observer = new MutationObserver(updateCategorySuggestions);
    // observer.observe(categoryDatalist, { childList: true });
  }
});



function setupEventListeners() {
  const form = document.getElementById('productForm');
  if (form) {
    form.addEventListener('submit', handleProductSubmit);
  }

  // إعداد Auto-fill لحقل السيريال نمبر
  const serialInput = document.getElementById('serialNumber');
  if (serialInput) {
    // عند إدخال سيريال نمبر والضغط Enter أو عند فقدان التركيز
    serialInput.addEventListener('blur', async () => {
      const serialNumber = serialInput.value.trim();
      if (serialNumber) {
        await autoFillProductFromSerial(serialNumber);
      }
    });

    // عند الضغط Enter في حقل السيريال
    serialInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const serialNumber = serialInput.value.trim();
        if (serialNumber) {
          await autoFillProductFromSerial(serialNumber);
          // Focus على حقل الاسم بعد ملء البيانات
          const nameInput = document.getElementById('productName');
          if (nameInput) {
            nameInput.focus();
          }
        }
      }
    });
  }
}

// ✅ تحميل كل المنتجات
async function loadProducts() {
  try {
    const response = await ipcRenderer.invoke('get-products');
    products = response.products;

    // ✅ ترتيب المنتجات: Low Stock أولاً (المنتجات التي قاربت أن تنتهي)
    products.sort((a, b) => {
      const aIsLowStock = a.quantity <= a.min_quantity;
      const bIsLowStock = b.quantity <= b.min_quantity;

      // إذا كان واحد Low Stock والآخر لا، Low Stock يأتي أولاً
      if (aIsLowStock && !bIsLowStock) return -1;
      if (!aIsLowStock && bIsLowStock) return 1;

      // إذا كانا كلاهما Low Stock أو كلاهما لا، قارن الكمية
      if (aIsLowStock && bIsLowStock) {
        return a.quantity - b.quantity; // الأقل كمية أولاً
      }

      // إذا كانا كلاهما غير Low Stock، ترتيب عادي حسب الاسم
      return a.name.localeCompare(b.name);
    });

    // استخراج الفئات الفريدة
    categories = [...new Set(products.map(p => p.category).filter(Boolean))];
    populateCategoryFilter();

    renderProductsTable();
    checkLowStock();
  } catch (error) {
    console.error('Error loading products:', error);
  }
}

// ✅ تحميل منتج واحد للتعديل
async function loadProductById(id) {
  try {
    const product = await ipcRenderer.invoke('get-product-by-id', parseInt(id));
    if (product) {
      document.getElementById('serialNumber').value = product.serial_number;
      document.getElementById('productName').value = product.name;
      document.getElementById('price').value = product.price;
      document.getElementById('wholesalePrice').value = product.wholesale_price;
      document.getElementById('quantity').value = product.quantity;
      document.getElementById('minQuantity').value = product.min_quantity;
      document.getElementById('category').value = product.category;
      editingProductId = product.id;
    }
  } catch (err) {
    console.error('Error loading product by id:', err);
  }
}

// ✅ تحديث فلتر الفئات
function populateCategoryFilter() {
  const categoryFilter = document.getElementById('categoryFilter');
  if (!categoryFilter) return;

  categoryFilter.innerHTML = '<option value="">جميع الفئات</option>';

  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    categoryFilter.appendChild(option);
  });
}

// ✅ رسم جدول المنتجات
function renderProductsTable() {
  const table = document.getElementById('productsTable');
  if (!table) return;

  table.innerHTML = '';

  products.forEach(product => {
    const row = document.createElement('tr');
    row.className = product.quantity <= product.min_quantity ? 'low-stock' : '';

    row.innerHTML = `
      <td>${product.serial_number}</td>
      <td>${product.name}</td>
      <td>${product.price.toFixed(2)}</td>
      <td>${product.wholesale_price.toFixed(2)}</td>
      <td>${product.purchase_price ? product.purchase_price.toFixed(2) : '-'}</td> <!-- ✅ هنا -->

      <td class="${product.quantity <= product.min_quantity ? 'text-danger' : ''}">
        ${product.quantity}
      </td>
      <td>${product.category}</td>
      <td>
        <button onclick="printBarcodeStickerUI(${product.id})" title="باركود">🖨️</button>
        <button onclick="editProduct(${product.id})" title="تعديل">✏️</button>
        <button onclick="deleteProduct(${product.id}, '${product.name.replace(/'/g, "\\'")}')" class="danger" title="حذف">🗑️</button>
        <button onclick="openMoreOptions(${product.id})" class="btn-small">مزيد ▾</button>
      </td>
    `;

    table.appendChild(row);
  });
}

// ✅ عرض تحذير لو في مخزون قليل
function checkLowStock() {
  const lowStockProducts = products.filter(p => p.quantity <= p.min_quantity);
  const alert = document.getElementById('lowStockAlert');

  if (alert) {
    if (lowStockProducts.length > 0) {
      alert.classList.remove('hidden');
      alert.textContent = `⚠️ هناك ${lowStockProducts.length} منتج وصل للحد الأدنى من المخزون`;
    } else {
      alert.classList.add('hidden');
    }
  }
}

// ✅ إضافة أو تحديث منتج
async function handleProductSubmit(e) {
  e.preventDefault();

  let serialNumber = document.getElementById('serialNumber').value.trim();
  if (!serialNumber) {
    let isUnique = false;
    while (!isUnique) {
      serialNumber = Math.floor(100000 + Math.random() * 900000).toString();
      isUnique = !products.some(p => p.serial_number === serialNumber);
    }
  }

  const product = {
    serial_number: serialNumber,
    name: document.getElementById('productName').value,
    price: parseFloat(document.getElementById('price').value),
    wholesale_price: parseFloat(document.getElementById('wholesalePrice').value),
    purchase_price: parseFloat(document.getElementById('purchasePrice').value), // ✅ الجديد
    quantity: parseInt(document.getElementById('quantity').value),
    min_quantity: parseInt(document.getElementById('minQuantity').value),
    category: document.getElementById('category').value
  };

  try {
    if (editingProductId) {
      product.id = editingProductId;
      const result = await ipcRenderer.invoke('update-product', product);
      if (result.success) {
        showNotification("✅ تم تحديث المنتج بنجاح", "success");
        editingProductId = null;

        // تحديث المنتج في القائمة مباشرة بدلاً من إعادة التحميل الكامل
        const index = products.findIndex(p => p.id === product.id);
        if (index !== -1) {
          products[index] = { ...products[index], ...product };
          renderProductsTable();
        }
      }
    } else {
      const result = await ipcRenderer.invoke('add-product', product);
      if (result.success) {
        showNotification("✅ تم إضافة المنتج بنجاح", "success");
        // إضافة المنتج الجديد إلى القائمة مباشرة
        product.id = result.id;
        products.push(product);
        renderProductsTable();
      }
    }

    document.getElementById('productForm').reset();
    checkLowStock();
  } catch (err) {
    showNotification('❌ خطأ: ' + err.error, "error");
  }
}

// ✅ تعبئة النموذج للتعديل
function editProduct(id) {
  const product = products.find(p => p.id === id);
  if (product) {
    document.getElementById('editProductId').value = product.id;
    document.getElementById('editSerialNumber').value = product.serial_number;
    document.getElementById('editProductName').value = product.name;
    document.getElementById('editPrice').value = product.price;
    document.getElementById('editWholesalePrice').value = product.wholesale_price;
    document.getElementById('editPurchasePrice').value = product.purchase_price;
    document.getElementById('editQuantity').value = product.quantity;
    document.getElementById('editMinQuantity').value = product.min_quantity;
    document.getElementById('editCategory').value = product.category || '';

    // إظهار النافذة
    document.getElementById('editModal').classList.remove('hidden');
  }
}


function closeEditModal() {
  document.getElementById('editModal').classList.add('hidden');
}

document.getElementById('editProductForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  let serialNumber = document.getElementById('editSerialNumber').value.trim();
  if (!serialNumber) {
    let isUnique = false;
    while (!isUnique) {
      serialNumber = Math.floor(100000 + Math.random() * 900000).toString();
      isUnique = !products.some(p => p.serial_number === serialNumber);
    }
  }

  const product = {
    id: parseInt(document.getElementById('editProductId').value),
    serial_number: serialNumber,
    name: document.getElementById('editProductName').value,
    price: parseFloat(document.getElementById('editPrice').value),
    wholesale_price: parseFloat(document.getElementById('editWholesalePrice').value),
    purchase_price: parseFloat(document.getElementById('editPurchasePrice').value),
    quantity: parseInt(document.getElementById('editQuantity').value),
    min_quantity: parseInt(document.getElementById('editMinQuantity').value),
    category: document.getElementById('editCategory').value
  };

  try {
    const result = await ipcRenderer.invoke('update-product', product);
    if (result.success) {
      closeEditModal();
      loadProducts();
      showNotification("✅ تم تحديث المنتج بنجاح");
    } else {
      showNotification("❌ فشل في تحديث المنتج");
    }
  } catch (err) {
    showNotification("❌ خطأ: " + err.message);
  }
});


// ✅ حذف منتج بكلمة سر واسم المنتج
async function deleteProduct(id, name) {
  const result = await appSecureDelete(
    `أنت على وشك حذف المنتج <strong>"${name}"</strong>.<br>الرجاء إدخال اسم المنتج وكلمة مرور الأدمن للتأكيد:`,
    'تأمين حذف المنتج',
    { extra: 'اسم المنتج', password: 'كلمة مرور الأدمن' }
  );

  if (!result) return;

  if (result.extra !== name) {
    showNotification("❌ اسم المنتج غير متطابق", "error");
    return;
  }

  try {
    const deleteResult = await ipcRenderer.invoke('secure-delete-product', { id, password: result.password });
    if (deleteResult.success) {
      showNotification("✅ تم حذف المنتج بنجاح", "success");
      loadProducts();
    } else {
      showNotification("❌ فشل: " + deleteResult.error, "error");
    }
  } catch (error) {
    showNotification("❌ خطأ: " + error.message, "error");
  }
}


// ✅ بحث بالاسم أو السيريال
function searchProducts() {
  const searchTerm = document.getElementById('searchProducts').value.toLowerCase();
  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm) ||
    product.serial_number.toLowerCase().includes(searchTerm)
  );
  renderFilteredProducts(filteredProducts);
}

// ✅ فلترة حسب الفئة
function filterProducts() {
  const category = document.getElementById('categoryFilter').value;

  const filteredProducts = products.filter(product =>
    category === '' || product.category === category
  );

  renderFilteredProducts(filteredProducts);
}

// ✅ عرض المنتجات المفلترة
function renderFilteredProducts(filteredProducts) {
  const table = document.getElementById('productsTable');
  if (!table) return;

  table.innerHTML = '';

  filteredProducts.forEach(product => {
    const row = document.createElement('tr');
    row.className = product.quantity <= product.min_quantity ? 'low-stock' : '';

    row.innerHTML = `
      <td>${product.serial_number}</td>
      <td>${product.name}</td>
      <td>${product.price.toFixed(2)}</td>
      <td>${product.wholesale_price.toFixed(2)}</td>
      <td>${product.purchase_price ? product.purchase_price.toFixed(2) : '-'}</td> <!-- ✅ -->
      <td class="${product.quantity <= product.min_quantity ? 'text-danger' : ''}">
        ${product.quantity}
      </td>
      <td>${product.category}</td>
      <td>
        <button onclick="printBarcodeStickerUI(${product.id})" title="باركود">🖨️</button>
        <button onclick="editProduct(${product.id})" title="تعديل">✏️</button>
        <button onclick="deleteProduct(${product.id})" class="danger" title="حذف">🗑️</button>
        <button onclick="openMoreOptions(${product.id})" class="btn-small">مزيد ▾</button>
      </td>
    `;

    table.appendChild(row);
  });
}

// ✅ تحميل صفحة جديدة
function loadPage(page) {
  ipcRenderer.send('load-page', page);
}

// ✅ عرض QR Code للمنتج
async function showQRCode(productId) {
  const product = products.find(p => p.id == productId);
  if (!product) return;

  // إغلاق أي مودال قديم
  closeQRModal();

  // إنشاء modal لعرض QR Code
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'qrModal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 400px;">
      <span class="close-btn" onclick="closeQRModal()" style="float: left; cursor: pointer; font-size: 24px;">&times;</span>
      <h2>QR Code - ${product.name}</h2>
      <div style="text-align: center; padding: 20px;">
        <div id="qrcode" style="display: inline-block; margin: 20px 0; background: white; padding: 10px; border-radius: 5px;"></div>
        <p style="margin-top: 15px; font-weight: bold;">السيريال: ${product.serial_number}</p>
        <p>${product.name}</p>
      </div>
      <div class="modal-actions">
        <button onclick="printQRSticker(${productId})">🖨️ طباعة استيكر</button>
        <button onclick="closeQRModal()">إغلاق</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const qrDiv = document.getElementById('qrcode');

  // محاولة استخدام المكتبة أولاً
  if (typeof QRCode !== 'undefined') {
    new QRCode(qrDiv, {
      text: product.serial_number,
      width: 200,
      height: 200,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  } else {
    // fallback لـ API لو المكتبة ما حملتش
    const qrImage = document.createElement('img');
    qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(product.serial_number)}`;
    qrImage.style.maxWidth = '100%';
    qrDiv.appendChild(qrImage);
  }
}

function closeQRModal() {
  const modal = document.getElementById('qrModal');
  if (modal) {
    modal.remove();
  }
}

// ✅ طباعة QR Code كاستيكر
function printQRSticker(productId) {
  const product = products.find(p => p.id == productId);
  if (!product) return;

  const printWindow = window.open('', '_blank');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>استيكر - ${product.name}</title>
      <style>
        @media print {
          @page {
            size: 38mm 25mm;
            margin: 0;
          }
          body { margin: 0; padding: 0; }
        }
        body {
          font-family: 'Arial', sans-serif;
          text-align: center;
          padding: 1mm;
          margin: 0;
          width: 38mm;
          height: 25mm;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          box-sizing: border-box;
          overflow: hidden;
        }
        #qrcode {
          margin-bottom: 1mm;
        }
        #qrcode img {
          width: 18mm;
          height: 18mm;
        }
        .product-name {
          font-size: 12px;
          font-weight: bold;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          width: 100%;
          text-align: center;
        }
        .serial {
          font-size: 11px;
          font-weight: bold;
          color: #000;
          margin-top: 0.5mm;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div id="qrcode"></div>
      <div class="product-name">${product.name}</div>
      <div class="serial">${product.serial_number}</div>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
      <script>
        window.onload = function() {
          if (typeof QRCode !== 'undefined') {
            new QRCode(document.getElementById("qrcode"), {
              text: "${product.serial_number}",
              width: 70,
              height: 70
            });
            setTimeout(() => {
              window.print();
              window.close();
            }, 500);
          } else {
            // Fallback to API if library fails in print window
            const img = document.createElement('img');
            img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=' + encodeURIComponent("${product.serial_number}");
            document.getElementById("qrcode").appendChild(img);
            img.onload = function() {
              setTimeout(() => {
                window.print();
                window.close();
              }, 500);
            };
          }
        };
      </script>
    </body>
    </html>
  `);

  printWindow.document.close();
}
// إضافة هذه الدالة إلى كل من products.js و customers.js
function showNotification(message, type = "info") {
  // إنصراف إذا لم يكن هناك عنصر للإشعارات
  if (!document.getElementById('globalNotification')) return;

  const notification = document.getElementById('globalNotification');
  notification.textContent = message;
  notification.className = `alert ${type}`;
  notification.style.display = 'block';

  setTimeout(() => {
    notification.style.display = 'none';
  }, 3000);
}

// ✅ طباعة باركود كاستيكر
function printBarcodeStickerUI(productId) {
  const product = products.find(p => p.id == productId);
  if (!product) return;

  if (typeof printBarcodeSticker === 'function') {
    printBarcodeSticker(product);
  } else {
    console.error('printBarcodeSticker function not found');
  }
}

// ✅ طباعة استيكر مدمج
function printCombinedStickerUI(productId) {
  const product = products.find(p => p.id == productId);
  if (!product) return;

  if (typeof printCombinedSticker === 'function') {
    printCombinedSticker(product);
  } else {
    console.error('printCombinedSticker function not found');
  }
}

// ========== QR Scanner Functions ==========

// إعداد QR Scanner
function setupQRScanner() {
  const qrInput = document.getElementById('qrScannerInput');
  if (!qrInput) return;

  // جعل الـ Input دائماً في حالة focus
  qrInput.focus();

  // إعادة Focus عند النقر في أي مكان في الصفحة (ما عدا input آخر)
  document.addEventListener('click', (e) => {
    // إذا لم يكن النقر على input آخر أو modal
    if (!e.target.closest('input') && !e.target.closest('.modal') && !e.target.closest('button')) {
      setTimeout(() => qrInput.focus(), 100);
    }
  });

  // معالجة Enter (Scan)
  qrInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const serialNumber = qrInput.value.trim();

      if (!serialNumber) {
        showNotification('❌ يرجى إدخال رقم سيريال', 'error');
        return;
      }

      await handleQRScan(serialNumber);

      // مسح الـ Input بعد Scan
      qrInput.value = '';
      qrInput.focus();
    }
  });

  // إعادة Focus تلقائياً بعد كل تغيير
  qrInput.addEventListener('blur', () => {
    setTimeout(() => {
      // إذا لم يكن focus على input آخر في النموذج
      if (document.activeElement.tagName !== 'INPUT' || document.activeElement.id === 'qrScannerInput') {
        qrInput.focus();
      }
    }, 100);
  });
}

// معالجة QR Scan - تحويل الكود إلى بيانات المنتج
async function handleQRScan(serialNumber) {
  try {
    // البحث عن المنتج بالرقم التسلسلي
    const product = await ipcRenderer.invoke('get-product-by-serial', serialNumber);

    if (product) {
      // المنتج موجود - ملء الحقول تلقائياً في النموذج
      fillProductForm(product);
      showNotification(`✅ تم تحميل بيانات المنتج: ${product.name}`, 'success');

      // Focus على حقل الكمية لإضافة الكمية الجديدة
      const quantityInput = document.getElementById('quantity');
      if (quantityInput) {
        quantityInput.focus();
        quantityInput.select();
      }
    } else {
      // المنتج غير موجود - ملء حقل السيريال فقط
      const serialInput = document.getElementById('serialNumber');
      if (serialInput) {
        serialInput.value = serialNumber;
        serialInput.focus();
        showNotification(`⚠️ المنتج غير موجود - يرجى إضافة بيانات المنتج`, 'warning');

        // Focus على حقل اسم المنتج
        const nameInput = document.getElementById('productName');
        if (nameInput) {
          setTimeout(() => nameInput.focus(), 200);
        }
      }
    }
  } catch (error) {
    console.error('Error handling QR scan:', error);
    showNotification('❌ خطأ في معالجة QR Code: ' + error.message, 'error');
  }
}

// Auto-fill بيانات المنتج من السيريال نمبر (عند الكتابة في حقل السيريال)
async function autoFillProductFromSerial(serialNumber) {
  try {
    // البحث عن المنتج بالرقم التسلسلي
    const product = await ipcRenderer.invoke('get-product-by-serial', serialNumber);

    if (product) {
      // المنتج موجود - ملء الحقول تلقائياً (بدون تغيير السيريال)
      const nameInput = document.getElementById('productName');
      const priceInput = document.getElementById('price');
      const wholesalePriceInput = document.getElementById('wholesalePrice');
      const purchasePriceInput = document.getElementById('purchasePrice');
      const quantityInput = document.getElementById('quantity');
      const minQuantityInput = document.getElementById('minQuantity');
      const categoryInput = document.getElementById('category');

      if (nameInput) nameInput.value = product.name || '';
      if (priceInput) priceInput.value = product.price || 0;
      if (wholesalePriceInput) wholesalePriceInput.value = product.wholesale_price || 0;
      if (purchasePriceInput) purchasePriceInput.value = product.purchase_price || 0;
      if (quantityInput) quantityInput.value = product.quantity || 1;
      if (minQuantityInput) minQuantityInput.value = product.min_quantity || 1;
      if (categoryInput) categoryInput.value = product.category || '';

      // إزالة حالة التعديل (إن وجدت)
      editingProductId = null;

      // إظهار إشعار بصري خفيف
      const nameField = document.getElementById('productName');
      if (nameField) {
        nameField.style.backgroundColor = '#d4edda';
        setTimeout(() => {
          nameField.style.backgroundColor = '';
        }, 1000);
      }
    }
  } catch (error) {
    console.error('Error auto-filling product from serial:', error);
  }
}

// ملء النموذج ببيانات المنتج
function fillProductForm(product) {
  if (!product) return;

  const serialInput = document.getElementById('serialNumber');
  const nameInput = document.getElementById('productName');
  const priceInput = document.getElementById('price');
  const wholesalePriceInput = document.getElementById('wholesalePrice');
  const purchasePriceInput = document.getElementById('purchasePrice');
  const quantityInput = document.getElementById('quantity');
  const minQuantityInput = document.getElementById('minQuantity');
  const categoryInput = document.getElementById('category');

  if (serialInput) serialInput.value = product.serial_number || '';
  if (nameInput) nameInput.value = product.name || '';
  if (priceInput) priceInput.value = product.price || 0;
  if (wholesalePriceInput) wholesalePriceInput.value = product.wholesale_price || 0;
  if (purchasePriceInput) purchasePriceInput.value = product.purchase_price || 0;
  if (quantityInput) quantityInput.value = product.quantity || 1;
  if (minQuantityInput) minQuantityInput.value = product.min_quantity || 1;
  if (categoryInput) categoryInput.value = product.category || '';

  // إزالة حالة التعديل (إن وجدت)
  editingProductId = null;
}

// ✅ وظيفة تحديث شارة التنبيهات (الجرس الاحمر)
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

// ==========More Options Modal Functions ==========
function openMoreOptions(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  const modal = document.getElementById('moreOptionsModal');
  const body = document.getElementById('moreOptionsBody');
  const title = document.getElementById('moreOptionsTitle');

  title.textContent = `خيارات إضافية: ${product.name}`;
  body.innerHTML = `
    <button onclick="showQRCode(${product.id}); closeMoreOptionsModal();">📱 عرض QR Code</button>
    <button onclick="printQRSticker(${product.id}); closeMoreOptionsModal();">🖨️ طباعة استيكر QR</button>
    <button onclick="printCombinedStickerUI(${product.id}); closeMoreOptionsModal();">🖨️ طباعة استيكر مدمج</button>
  `;

  modal.classList.remove('hidden');
}

function closeMoreOptionsModal() {
  const modal = document.getElementById('moreOptionsModal');
  if (modal) modal.classList.add('hidden');
}
