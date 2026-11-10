// backend/src/ipc/dashboardIpc.js
const { ipcMain } = require('electron');

function registerDashboardIpc({ db }) {
  ipcMain.handle('get-dashboard-data', async (event, { startDate, endDate }) => {
    try {
      const stats = {};

      // 1. الإحصائيات الأساسية
      const prodRow = await db.get('SELECT COUNT(*) as count FROM products WHERE is_deleted = 0');
      stats.totalProducts = prodRow?.count || 0;

      const lowStockRow = await db.get('SELECT COUNT(*) as count FROM products WHERE quantity <= min_quantity AND is_deleted = 0');
      stats.lowStockProducts = lowStockRow?.count || 0;

      const custRow = await db.get('SELECT COUNT(*) as count FROM customers WHERE is_deleted = 0');
      stats.totalCustomers = custRow?.count || 0;

      // فلترة التاريخ
      let dateFilter = '';
      let dateParams = [];
      if (startDate && endDate) {
        dateFilter = ' AND date BETWEEN ? AND ?';
        dateParams = [startDate, endDate];
      }

      // 2. صافي الدخل من الصفحة الرئيسية ومن محفظة العملاء
      const mainNetRow = await db.get(
        `SELECT SUM(account - withdraw) as net FROM transactions WHERE is_deleted = 0 ${dateFilter}`,
        dateParams
      );
      const mainNet = mainNetRow?.net || 0;

      const walletNetRow = await db.get(
        `SELECT SUM(amount) as net FROM payments WHERE payment_method = 'wallet' AND is_deleted = 0 ${dateFilter}`,
        dateParams
      );
      const walletNet = walletNetRow?.net || 0;

      stats.netProfit = mainNet + walletNet;

      // 3. أرباح الفترات (اليوم، الأسبوع، الشهر، السنة)
      const now = new Date();
      const toLocalISO = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      };

      const todayDate = toLocalISO(now);

      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const weekDate = new Date(now);
      weekDate.setDate(diff);
      const startOfWeek = toLocalISO(weekDate);

      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const startOfYear = `${now.getFullYear()}-01-01`;

      const getPeriodProfit = async (start, end) => {
        const m = await db.get(
          `SELECT SUM(account - withdraw) as net FROM transactions WHERE is_deleted = 0 AND date BETWEEN ? AND ?`,
          [start, end]
        );
        const w = await db.get(
          `SELECT SUM(amount) as net FROM payments WHERE payment_method = 'wallet' AND is_deleted = 0 AND date BETWEEN ? AND ?`,
          [start, end]
        );
        return (m?.net || 0) + (w?.net || 0);
      };

      stats.dailyProfit = await getPeriodProfit(todayDate, todayDate);
      stats.weeklyProfit = await getPeriodProfit(startOfWeek, '2099-12-31');
      stats.monthlyProfit = await getPeriodProfit(startOfMonth, '2099-12-31');
      stats.yearlyProfit = await getPeriodProfit(startOfYear, '2099-12-31');

      // 4. تحليل المنتجات الأكثر والأقل مبيعاً (تم تحسينه وحل مشكلة N+1 Query لتسريع التحميل لحظياً)
      const products = await db.all(
        'SELECT id, name, serial_number, purchase_price, wholesale_price, price FROM products WHERE is_deleted = 0'
      );

      // استعلام مجمّع للمبيعات
      const salesAgg = await db.all(
        `SELECT product_id, SUM(quantity) as qty, SUM(total) as revenue 
         FROM customer_transactions 
         WHERE type = 'sale' AND is_deleted = 0 ${dateFilter} 
         GROUP BY product_id`,
        dateParams
      );
      const salesMap = new Map();
      salesAgg.forEach((r) => salesMap.set(r.product_id, { qty: r.qty || 0, revenue: r.revenue || 0 }));

      // استعلام مجمّع للمرتجعات
      const returnsAgg = await db.all(
        `SELECT product_id, SUM(quantity) as qty, SUM(ABS(total)) as total 
         FROM customer_transactions 
         WHERE type = 'return' AND is_deleted = 0 ${dateFilter} 
         GROUP BY product_id`,
        dateParams
      );
      const returnsMap = new Map();
      returnsAgg.forEach((r) => returnsMap.set(r.product_id, { qty: r.qty || 0, total: r.total || 0 }));

      const productPerformance = [];

      for (const p of products) {
        const custSales = salesMap.get(p.id) || { qty: 0, revenue: 0 };
        const custReturns = returnsMap.get(p.id) || { qty: 0, total: 0 };

        // مبيعات الصفحة الرئيسية إن وجدت بالسيريال
        let mainCount = 0;
        let mainRev = 0;
        if (p.serial_number) {
          const mainSaleRow = await db.get(
            `SELECT COUNT(*) as count, SUM(account) as revenue FROM transactions WHERE notes LIKE ? AND is_deleted = 0 ${dateFilter}`,
            [`%${p.serial_number}%`, ...dateParams]
          );
          mainCount = mainSaleRow?.count || 0;
          mainRev = mainSaleRow?.revenue || 0;
        }

        const totalQty = custSales.qty + mainCount - custReturns.qty;
        const totalRevenue = custSales.revenue + mainRev - custReturns.total;
        const costBasis = totalQty * (p.purchase_price || 0);
        const netProfit = totalRevenue - costBasis;

        if (totalQty > 0 || mainCount > 0 || custSales.qty > 0) {
          productPerformance.push({
            product_id: p.id,
            name: p.name,
            serial_number: p.serial_number,
            totalQuantity: totalQty,
            totalRevenue: totalRevenue,
            netProfit: netProfit,
            purchasePrice: p.purchase_price || 0,
            sellingPrice: p.price
          });
        }
      }

      stats.topProducts = [...productPerformance].sort((a, b) => b.totalQuantity - a.totalQuantity).slice(0, 3);
      stats.leastProducts = [...productPerformance].sort((a, b) => a.totalQuantity - b.totalQuantity).slice(0, 3);
      stats.productsProfit = [...productPerformance].sort((a, b) => b.netProfit - a.netProfit);
      stats.totalSales = productPerformance.reduce((sum, p) => sum + p.totalRevenue, 0);
      stats.productCosts = productPerformance.reduce((sum, p) => sum + p.totalQuantity * p.purchasePrice, 0);

      return stats;
    } catch (err) {
      console.error('Dashboard Error:', err);
      return {
        netProfit: 0,
        totalProducts: 0,
        lowStockProducts: 0,
        totalCustomers: 0,
        topProducts: [],
        leastProducts: [],
        productsProfit: [],
        totalSales: 0,
        productCosts: 0
      };
    }
  });

  ipcMain.handle('get-product-dashboard-details', async (event, { productId, startDate, endDate }) => {
    try {
      const product = await db.get('SELECT * FROM products WHERE id = ?', [productId]);
      if (!product) return null;

      let dateFilter = '';
      let dateParams = [];
      if (startDate && endDate) {
        dateFilter = ' AND date BETWEEN ? AND ?';
        dateParams = [startDate, endDate];
      }

      const custSales = await db.get(
        `SELECT SUM(quantity) as qty, SUM(total) as revenue FROM customer_transactions WHERE product_id = ? AND type = 'sale' AND is_deleted = 0 ${dateFilter}`,
        [productId, ...dateParams]
      );
      const mainSales = await db.get(
        `SELECT COUNT(*) as count, SUM(account) as revenue FROM transactions WHERE notes LIKE ? AND is_deleted = 0 ${dateFilter}`,
        [`%${product.serial_number}%`, ...dateParams]
      );
      const returns = await db.get(
        `SELECT SUM(quantity) as qty, SUM(ABS(total)) as total, COUNT(*) as returnCount FROM customer_transactions WHERE product_id = ? AND type = 'return' AND is_deleted = 0 ${dateFilter}`,
        [productId, ...dateParams]
      );

      const netCustQty = (custSales?.qty || 0) - (returns?.qty || 0);
      const totalQty = netCustQty + (mainSales?.count || 0);
      const totalRevenue = (custSales?.revenue || 0) + (mainSales?.revenue || 0) - (returns?.total || 0);
      const netProfit = totalRevenue - totalQty * (product.purchase_price || 0);

      return {
        quantityFromCustomers: netCustQty,
        quantityFromMain: mainSales?.count || 0,
        countFromMain: mainSales?.count || 0,
        returnCount: returns?.returnCount || 0,
        returnedQty: returns?.qty || 0,
        totalQuantity: totalQty,
        totalRevenue: totalRevenue,
        netProfit: netProfit
      };
    } catch (err) {
      console.error('Product Details Error:', err);
      return null;
    }
  });
}

module.exports = registerDashboardIpc;

