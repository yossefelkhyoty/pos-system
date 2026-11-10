//customers.js

const { ipcRenderer } = require('electron');

// إضافة عميل
document.getElementById('customerForm').addEventListener('submit', (e) => {
  e.preventDefault();

  const customer = {
    name: document.getElementById('customerName').value,
    phone: document.getElementById('customerPhone').value,
    notes: '', // ملاحظات تم إزالتها من الواجهة
    date: new Date().toISOString().split('T')[0]
  };

  ipcRenderer.send('add-customer', customer);
});

// تأكيد إضافة العميل
ipcRenderer.on('customer-added', (event, result) => {
  if (result.success) {
    showNotification('✅ تم إضافة العميل بنجاح');
    document.getElementById('customerForm').reset();
    loadCustomers();
  } else {
    showNotification('❌ فشل: ' + result.error);
  }
});

// تحميل العملاء
function loadCustomers(search = '', searchByPhone = '') {
  ipcRenderer.send('get-customers', { search, searchByPhone });
}

// البحث بالاسم
function searchCustomers() {
  const term = document.getElementById('searchCustomers').value.trim();
  document.getElementById('searchCustomerPhone').value = ''; // مسح البحث بالهاتف
  loadCustomers(term, '');
}


// البحث برقم الهاتف
function searchCustomersByPhone() {
  const phone = document.getElementById('searchCustomerPhone').value.trim();
  document.getElementById('searchCustomers').value = ''; // مسح البحث بالاسم
  loadCustomers('', phone); // تمرير معامل الهاتف
}
// مسح البحث
function clearSearch() {
  document.getElementById('searchCustomers').value = '';
  document.getElementById('searchCustomerPhone').value = '';
  loadCustomers();
}

// حذف عميل
let customerToDelete = null;

async function deleteCustomer(id, name) {
  const result = await appSecureDelete(
    `أنت على وشك حذف العميل <strong>"${name}"</strong> وكل بياناته والتاريخ الخاص به.<br>الرجاء إدخال اسم العميل وكلمة مرور الأدمن للتأكيد:`,
    'تأمين حذف عميل',
    { extra: 'اسم العميل', password: 'كلمة مرور الأدمن' }
  );

  if (!result) return;

  if (result.extra !== name) {
    showNotification('❌ اسم العميل غير متطابق بصورة صحيحة', 'error');
    return;
  }

  // التحقق من الباسورد وحذف العميل
  const deleteResult = await ipcRenderer.invoke('secure-delete-customer', {
    id: id,
    password: result.password
  });

  if (deleteResult.success) {
    showNotification('✅ تم حذف العميل بنجاح');
    loadCustomers();
  } else {
    showNotification('❌ فشل: ' + deleteResult.error, 'error');
  }
}

// معالج حذف العميل
ipcRenderer.on('customer-deleted', (event, result) => {
  if (result.success) {
    showNotification('✅ تم حذف العميل بنجاح');
    loadCustomers();
  } else {
    showNotification('❌ فشل في حذف العميل: ' + result.error);
  }
});

// استلام العملاء وعرضهم
ipcRenderer.on('customers-data', async (event, { customers }) => {
  const tbody = document.getElementById('customersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (customers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="no-customers">لا يوجد عملاء</td></tr>';
    return;
  }

  // ترتيب العملاء أبجدياً حسب الاسم
  customers.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  let counter = 1;
  for (const customer of customers) {
    try {
      // احصل على الرصيد الكلي للعميل
      const totalBalance = await ipcRenderer.invoke('get-customer-total-balance', customer.id);

      const row = document.createElement('tr');
      row.style.cursor = 'pointer';
      row.innerHTML = `
        <td>${counter++} <small style="color:#888; font-size: 0.8em;">(ID: ${customer.id})</small></td>
        <td class="customer-name">${customer.name}</td>
        <td>${customer.phone || 'غير محدد'}</td>
        <td>${customer.date}</td>
        <td class="${totalBalance > 0 ? 'text-danger' : ''}">
          ${Number(totalBalance).toFixed(2)} ج
        </td>
        <td class="customer-actions">
          <button onclick="openCustomerAccount(${customer.id})" class="btn-primary btn-small">
            فتح
          </button>
          <button onclick='openEditCustomer(${JSON.stringify(customer)})' class="btn-small">
            ✏️
          </button>
          <button onclick="deleteCustomer(${customer.id}, '${customer.name.replace(/'/g, "\\'")}')" class="btn-small btn-danger">
            🗑
          </button>
        </td>
      `;

      row.addEventListener('click', (e) => {
        if (!e.target.matches('button')) {
          openCustomerAccount(customer.id);
        }
      });

      tbody.appendChild(row);
    } catch (err) {
      console.error('Error loading customer balance:', err);
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${counter++} <small style="color:#888; font-size: 0.8em;">(ID: ${customer.id})</small></td>
        <td class="customer-name">${customer.name}</td>
        <td>${customer.phone || 'غير محدد'}</td>
        <td>${customer.date}</td>
        <td>جاري التحميل...</td>
        <td class="customer-actions">
          <button onclick="openCustomerAccount(${customer.id})" class="btn-primary btn-small">
            فتح
          </button>
        </td>
      `;
      tbody.appendChild(row);
    }
  }
});

// فتح حساب العميل
function openCustomerAccount(customerId) {
  window.location.href = `customer.html?id=${customerId}`;
}

// فتح نافذة تعديل
async function forceSyncCustomer(id) {
  const confirmed = await appConfirm('هل تريد إجبار مزامنة كافة بيانات هذا العميل مع السحابة الآن؟', 'مزامنة شاملة');
  if (!confirmed) return;

  try {
    showNotification('⏳ جاري تحضير البيانات للمزامنة...', 'info');
    const result = await ipcRenderer.invoke('force-sync-customer', id);
    if (result.success) {
      showNotification('🚀 بدأت المزامنة الشاملة بنجاح - يرجى مراقبة شريط التحميل', 'success');
    } else {
      showNotification('❌ فشل تحضير البيانات: ' + result.error, 'danger');
    }
  } catch (err) {
    console.error('Force sync error:', err);
    showNotification('❌ حدث خطأ أثناء طلب المزامنة', 'danger');
  }
}

async function pullFromSupabase() {
  const confirmed = await appConfirm(
    'سيتم تحديث البيانات المحلية بالبيانات الموجودة على Supabase (السحابة).\n\nاستخدم هذا إذا كانت بيانات الموقع صحيحة والتطبيق ناقص.\n\nهل تريد المتابعة؟',
    'جلب من السحابة'
  );
  if (!confirmed) return;

  try {
    showNotification('⏳ جاري جلب البيانات من السحابة...', 'info');
    const result = await ipcRenderer.invoke('pull-from-supabase');
    if (result.success) {
      const summary = Object.entries(result.stats).map(([t, n]) => `${t}: ${n}`).join(' | ');
      showNotification(`✅ تم جلب البيانات بنجاح (${summary})`, 'success');
      loadCustomers();
    } else {
      showNotification('❌ فشل جلب البيانات: ' + result.error, 'danger');
    }
  } catch (err) {
    console.error('Pull from Supabase error:', err);
    showNotification('❌ حدث خطأ أثناء جلب البيانات', 'danger');
  }
}

async function forceSyncAllCustomers() {
  const confirmed = await appConfirm('🚨 هل أنت متأكد من مزامنة كافة بيانات جميع العملاء (ربما يستغرق وقتاً طويلاً)؟', 'مزامنة شاملة لكافة العملاء');
  if (!confirmed) return;

  try {
    showNotification('⏳ جاري تحضير بيانات كافة العملاء...', 'info');
    const result = await ipcRenderer.invoke('force-sync-all-customers');
    if (result.success) {
      showNotification('🚀 بدأت عملية المزامنة للجميع - يرجى الانتظار والمتابعة', 'success');
    } else {
      showNotification('❌ فشل تحضير البيانات الشاملة: ' + result.error, 'danger');
    }
  } catch (err) {
    console.error('Force Sync All Error:', err);
    showNotification('❌ حدث خطأ أثناء طلب المزامنة الشاملة', 'danger');
  }
}

// استماع لتقدم المزامنة من الـ backend
ipcRenderer.on('sync-progress', (event, { progress, message }) => {
  const box = document.getElementById("globalNotification");
  if (!box) return;

  box.className = "notification-box info";
  box.style.display = "block";

  if (progress < 100) {
    box.innerHTML = `
            <div style="text-align: right; margin-bottom: 5px;">${message}</div>
            <div style="width: 100%; background: #eee; height: 10px; border-radius: 5px; overflow: hidden;">
                <div style="width: ${progress}%; background: #2196F3; height: 100%; transition: width 0.3s;"></div>
            </div>
            <div style="text-align: left; font-size: 10px; margin-top: 5px;">${progress}%</div>
        `;
  } else {
    box.textContent = "✅ " + message;
    setTimeout(() => {
      box.style.display = "none";
    }, 3000);
  }
});

function openEditCustomer(customer) {
  document.getElementById('editCustomerId').value = customer.id;
  document.getElementById('editCustomerName').value = customer.name;
  document.getElementById('editCustomerPhone').value = customer.phone || '';
  document.getElementById('editCustomerNotes').value = customer.notes || '';
  document.getElementById('editCustomerModal').style.display = 'flex';
}

// غلق النافذة
function closeEditModal() {
  document.getElementById('editCustomerModal').style.display = 'none';
}

// حفظ التعديلات
function saveCustomerEdit() {
  const id = document.getElementById('editCustomerId').value;
  const updatedCustomer = {
    id,
    name: document.getElementById('editCustomerName').value,
    phone: document.getElementById('editCustomerPhone').value,
    notes: document.getElementById('editCustomerNotes').value
  };

  ipcRenderer.send('update-customer', updatedCustomer);
  closeEditModal();
}

// استلام تأكيد التحديث
ipcRenderer.on('customer-updated', (event, result) => {
  if (result.success) {
    showNotification('✅ تم تعديل العميل بنجاح');
    loadCustomers();
  } else {
    showNotification('❌ فشل التعديل: ' + result.error);
  }
});

// 🟢 دوال التنقل والإشعارات
function loadPage(page) {
  ipcRenderer.send('load-page', page);
}

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
  if (!box) return;

  box.className = "notification-box";
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

// 🟡 دوال دمج البيانات من نسخة احتياطية
let currentBackupPath = '';

async function startCustomerMerge() {
  try {
    const filePath = await ipcRenderer.invoke('select-backup-file');
    if (!filePath) return;

    currentBackupPath = filePath;
    const result = await ipcRenderer.invoke('get-customers-from-backup', filePath);

    if (result.success) {
      const tbody = document.getElementById('backupCustomersBody');
      tbody.innerHTML = '';
      document.getElementById('backupPathDisplay').textContent = filePath;

      result.customers.forEach(cust => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${cust.id}</td>
          <td>${cust.name}</td>
          <td>${cust.phone || '-'}</td>
          <td>${cust.date}</td>
          <td>
            <button onclick="executeMerge(${cust.id}, '${cust.name}')" class="btn-primary btn-small">دمج</button>
          </td>
        `;
        tbody.appendChild(row);
      });

      document.getElementById('mergeCustomerModal').style.display = 'flex';
    } else {
      showNotification('❌ ' + result.error, 'danger');
    }
  } catch (err) {
    console.error('Merge start error:', err);
    showNotification('❌ فشل بدء عملية الدمج', 'danger');
  }
}

function closeMergeModal() {
  document.getElementById('mergeCustomerModal').style.display = 'none';
}

async function executeMerge(sourceId, name) {
  const confirmed = await appConfirm(`هل أنت متأكد من دمج بيانات "${name}" وكل تاريخه؟`, 'تأكيد الدمج');
  if (!confirmed) return;

  try {
    showNotification('⏳ جاري الدمج والمزامنة...', 'info');
    const result = await ipcRenderer.invoke('execute-customer-merge', {
      backupPath: currentBackupPath,
      sourceCustomerId: sourceId
    });

    if (result.success) {
      showNotification('✅ تم الدمج بنجاح وجاري المزامنة مع السحاب', 'success');
      closeMergeModal();
      loadCustomers();
    } else {
      showNotification('❌ فشل الدمج: ' + result.error, 'danger');
    }
  } catch (err) {
    console.error('Merge execution error:', err);
    showNotification('❌ خطأ أثناء عملية الدمج', 'danger');
  }
}

// 🟢 عند تحميل الصفحة
window.addEventListener('load', () => {
  // تحميل العملاء
  loadCustomers();

  // تحديث الجرس وتفعيل الزر النشط
  updateNotificationBadge();
  highlightActiveNavButton();

  // إعداد حالة الاتصال
  setupConnectionStatus();
});

// تحديث دوري للإشعارات
setInterval(updateNotificationBadge, 30000); // كل 30 ثانية