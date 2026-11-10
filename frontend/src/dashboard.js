// dashboard.js
const { ipcRenderer } = require('electron');

let currentPeriod = 'month';
let currentStartDate = null;
let currentEndDate = null;

// تحميل بيانات الداشبورد
async function loadDashboardData() {
  const period = document.getElementById('periodFilter').value;
  currentPeriod = period;

  let startDate, endDate;
  const now = new Date();

  // دالة مساعدة للحصول على التاريخ المحلي بصيغة YYYY-MM-DD
  const getLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayStr = getLocalDateString(now);

  if (period === 'today') {
    startDate = endDate = todayStr;
  } else if (period === 'week') {
    const dayOfWeek = now.getDay(); // 0 (Sun) to 6 (Sat)
    // حساب بداية الأسبوع (الاثنين)
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const start = new Date(now);
    start.setDate(diff);
    startDate = getLocalDateString(start);

    // نهاية الأسبوع (الأحد)
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    endDate = getLocalDateString(end);
  } else if (period === 'month') {
    startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    // نهاية الشهر
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${lastDay}`;
  } else if (period === 'last_month') {
    const lastMonthDate = new Date();
    lastMonthDate.setMonth(now.getMonth() - 1);
    const year = lastMonthDate.getFullYear();
    const month = lastMonthDate.getMonth();
    startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    endDate = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;
  } else if (period === 'year') {
    startDate = `${now.getFullYear()}-01-01`;
    endDate = `${now.getFullYear()}-12-31`;
  } else if (period === 'all') {
    startDate = '2000-01-01';
    endDate = '2099-12-31';
  }

  // إظهار/إخفاء حقول التاريخ المخصص
  const customDatesDiv = document.getElementById('customDates');
  if (period === 'custom') {
    customDatesDiv.style.display = 'flex';
  } else {
    customDatesDiv.style.display = 'none';
  }

  if (period === 'custom') {
    startDate = document.getElementById('customStartDate').value;
    endDate = document.getElementById('customEndDate').value;
    if (!startDate || !endDate) return;
  }

  currentStartDate = startDate;
  currentEndDate = endDate;

  try {
    const dashboardData = await ipcRenderer.invoke('get-dashboard-data', {
      startDate,
      endDate
    });

    updateDashboard(dashboardData);
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    showNotification('حدث خطأ في تحميل البيانات', 'error');
  }
}

// تحديث الداشبورد بالبيانات
function updateDashboard(data) {
  // تحديث الإحصائيات الرئيسية
  document.getElementById('netProfit').textContent = data.netProfit.toFixed(2);
  document.getElementById('totalSales').textContent = data.totalSales.toFixed(2);
  document.getElementById('productCosts').textContent = data.productCosts.toFixed(2);
  document.getElementById('productNetProfit').textContent = (data.totalSales - data.productCosts).toFixed(2);

  // إحصائيات عامة
  document.getElementById('totalProducts').textContent = data.totalProducts;
  document.getElementById('lowStockProducts').textContent = data.lowStockProducts;
  document.getElementById('totalCustomers').textContent = data.totalCustomers;

  // تحديث تفاصيل الربح الزمني (أرباح المحل)
  document.getElementById('dailyProfit').textContent = `${data.dailyProfit.toFixed(2)} جنيه`;
  document.getElementById('weeklyProfit').textContent = `${data.weeklyProfit.toFixed(2)} جنيه`;
  document.getElementById('monthlyProfit').textContent = `${data.monthlyProfit.toFixed(2)} جنيه`;
  document.getElementById('yearlyProfit').textContent = `${data.yearlyProfit.toFixed(2)} جنيه`;

  // تحديث قائمة أكثر المنتجات مبيعاً
  displayTopProducts(data.topProducts, 'topProductsList');

  // تحديث قائمة أقل المنتجات مبيعاً
  displayLeastProducts(data.leastProducts, 'leastProductsList');

  // تحديث صافي الربح من المنتجات
  displayProductsProfit(data.productsProfit, 'productsProfitList');
}

function displayTopProducts(products, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (products.length === 0) {
    container.innerHTML = '<p class="no-data">لم يتم بيع أي منتجات في هذه الفترة</p>';
    return;
  }
  products.forEach((product, index) => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.onclick = () => showProductDetails(product);
    card.innerHTML = `
      <div class="product-rank">${index + 1}</div>
      <div class="product-info">
        <h4>${product.name}</h4>
        <div class="product-stats">
          <span>الكمية: <strong>${product.totalQuantity}</strong></span>
          <span>المكسب: <strong style="color: #10b981;">${product.netProfit.toFixed(2)} جنيه</strong></span>
        </div>
      </div>
      <div class="product-arrow">🔍</div>
    `;
    container.appendChild(card);
  });
}

function displayLeastProducts(products, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (products.length === 0) {
    container.innerHTML = '<p class="no-data">لا توجد بيانات</p>';
    return;
  }
  products.forEach((product, index) => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.onclick = () => showProductDetails(product);
    card.innerHTML = `
      <div class="product-rank">${index + 1}</div>
      <div class="product-info">
        <h4>${product.name}</h4>
        <div class="product-stats">
          <span>الكمية: <strong>${product.totalQuantity}</strong></span>
          <span>المكسب: <strong style="color: #ef4444;">${product.netProfit.toFixed(2)} جنيه</strong></span>
        </div>
      </div>
      <div class="product-arrow">🔍</div>
    `;
    container.appendChild(card);
  });
}

function displayProductsProfit(products, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (products.length === 0) {
    container.innerHTML = '<p class="no-data">لا توجد بيانات</p>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'dashboard-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>المنتج</th>
        <th>الكمية</th>
        <th>إجمالي البيع</th>
        <th>تكلفة الشراء</th>
        <th>صافي الربح</th>
      </tr>
    </thead>
    <tbody id="productsProfitTableBody"></tbody>
  `;
  container.appendChild(table);

  const tbody = document.getElementById('productsProfitTableBody');
  products.forEach(p => {
    const row = document.createElement('tr');
    row.onclick = () => showProductDetails(p);
    row.style.cursor = 'pointer';
    const cost = p.totalQuantity * p.purchasePrice;
    row.innerHTML = `
      <td>${p.name}</td>
      <td>${p.totalQuantity}</td>
      <td>${p.totalRevenue.toFixed(2)}</td>
      <td>${cost.toFixed(2)}</td>
      <td style="font-weight: bold; color: ${p.netProfit >= 0 ? '#10b981' : '#ef4444'}">
        ${p.netProfit.toFixed(2)}
      </td>
    `;
    tbody.appendChild(row);
  });
}

async function showProductDetails(product) {
  try {
    const details = await ipcRenderer.invoke('get-product-dashboard-details', {
      productId: product.product_id,
      startDate: currentStartDate,
      endDate: currentEndDate
    });

    if (!details) return;

    document.getElementById('modalProductName').textContent = product.name;
    document.getElementById('productDetailsContent').innerHTML = `
      <div class="details-grid">
        <div class="detail-item">
          <span class="detail-label">👥 الكمية المباعة من العملاء (الصافي):</span>
          <span class="detail-value">${details.quantityFromCustomers} قطعة</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">🏠 الكمية المباعة من الرئيسية:</span>
          <span class="detail-value">${details.quantityFromMain} قطعة</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">💰 سعر الجملة الحالي:</span>
          <span class="detail-value">${product.purchasePrice.toFixed(2)} جنيه</span>
        </div>
        <div class="detail-item total-row">
          <span class="detail-label">📊 إجمالي الربح من هذا المنتج:</span>
          <span class="detail-value" style="color: #10b981;">${details.netProfit.toFixed(2)} جنيه</span>
        </div>
        <div class="detail-summary">
          <span>إجمالي البيع: ${details.totalRevenue.toFixed(2)} جنيه</span>
          <span>تكلُفة الجملة: ${(details.totalQuantity * product.purchasePrice).toFixed(2)} جنيه</span>
          <span style="font-weight: bold; border-top: 1px solid #ddd; padding-top: 5px; margin-top: 5px; display: block;">
            صافي الربح: ${details.netProfit.toFixed(2)} جنيه
          </span>
        </div>
      </div>
    `;

    document.getElementById('productModal').classList.remove('hidden');
  } catch (error) {
    console.error('Error loading product details:', error);
  }
}

function closeProductModal() {
  document.getElementById('productModal').classList.add('hidden');
}

function scrollToSection(id) {
  document.getElementById(id).scrollIntoView({ behavior: 'smooth' });
}

function loadPage(page) {
  ipcRenderer.send('load-page', page);
}

function showNotification(message, type = "info") {
  const box = document.getElementById("globalNotification");
  if (!box) return;
  box.className = "alert " + type;
  box.textContent = message;
  box.classList.remove('hidden');
  setTimeout(() => box.classList.add('hidden'), 5000);
}

window.addEventListener('DOMContentLoaded', () => {
  loadDashboardData();
  updateNotificationBadge(); // تحديث شارة التنبيهات

  // تحديث دوري للإشعارات كل 30 ثانية
  setInterval(updateNotificationBadge, 30000);

  // شريط التمرير
  document.getElementById('scrollTopBtn').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  document.getElementById('scrollBottomBtn').onclick = () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
});

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
