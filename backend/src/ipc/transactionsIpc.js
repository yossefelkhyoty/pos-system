// backend/src/ipc/transactionsIpc.js
const { ipcMain, BrowserWindow } = require('electron');

let isAutoSaving = false;

function registerTransactionsIpc({ db, syncManager }) {
  // ====================================================================
  // 1. معاملات الصفحة الرئيسية (كشف الخزينة اليومي - محلي فقط)
  // ====================================================================

  // حفظ تلقائي لبيانات الصفحة الرئيسية
  ipcMain.on('auto-save', async (event, { date, data }) => {
    if (isAutoSaving) {
      event.reply('auto-save-response', { success: false, error: 'يتم معالجة طلب آخر حالياً' });
      return;
    }

    isAutoSaving = true;

    try {
      await db.run('BEGIN TRANSACTION');
      await db.run('DELETE FROM transactions WHERE date = ?', [date]);

      const filtered = (data || []).filter((entry) => entry.item || entry.account || entry.withdraw || entry.notes);

      if (filtered.length > 0) {
        const now = new Date().toISOString();
        for (const entry of filtered) {
          await db.run(
            `INSERT INTO transactions (date, time, item, account, withdraw, notes, last_modified) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [date, entry.time || null, entry.item, entry.account || 0, entry.withdraw || 0, entry.notes || '', now]
          );
        }
      }

      await db.run('COMMIT');
      event.reply('auto-save-response', { success: true, message: `تم الحفظ بنجاح` });
    } catch (err) {
      try {
        await db.run('ROLLBACK');
      } catch (_) {}
      console.error('Auto-save error:', err);
      event.reply('auto-save-response', { success: false, error: err.message });
    } finally {
      isAutoSaving = false;
    }
  });

  // إضافة معاملة فردية في الصفحة الرئيسية
  ipcMain.on('add-main-transaction', async (event, transaction) => {
    try {
      const now = new Date().toISOString();
      await db.run(
        `INSERT INTO transactions (date, item, account, withdraw, notes, last_modified) VALUES (?, ?, ?, ?, ?, ?)`,
        [transaction.date, transaction.item, transaction.account || 0, transaction.withdraw || 0, transaction.notes || '', now]
      );
    } catch (err) {
      console.error('Error adding main transaction:', err);
    }
  });

  // تحميل معاملات تاريخ محدد للصفحة الرئيسية
  ipcMain.on('load-data', async (event, date) => {
    try {
      const rows = await db.all('SELECT * FROM transactions WHERE date = ? ORDER BY id ASC', [date]);
      event.reply('load-data-response', rows || []);
    } catch (err) {
      event.reply('load-data-response', []);
    }
  });

  // مسح جميع بيانات الصفحة الرئيسية
  ipcMain.on('delete-all-data', async (event) => {
    try {
      await db.run('DELETE FROM transactions');
      event.reply('delete-all-response', { success: true, message: 'تم حذف جميع البيانات بنجاح' });
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) win.webContents.send('all-data-deleted');
      });
    } catch (err) {
      event.reply('delete-all-response', { success: false, error: err.message });
    }
  });

  // حذف جميع بيانات الصفحة الرئيسية بأمر الأدمن وكلمة المرور
  ipcMain.handle('secure-delete-all-main-data', async (event, password) => {
    try {
      const admin = await db.get("SELECT password FROM users WHERE username = 'admin'");
      if (!admin || admin.password !== password) {
        return { success: false, error: 'كلمة مرور الأدمن غير صحيحة' };
      }

      await db.run('DELETE FROM transactions');
      await db.run("DELETE FROM offline_sync_queue WHERE table_name = 'transactions'");
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // البحث في الصفحة الرئيسية
  ipcMain.on('search-data', async (event, { item, notes, filter }) => {
    try {
      let query = 'SELECT * FROM transactions WHERE 1=1';
      const params = [];

      if (item) {
        query += ' AND item LIKE ?';
        params.push(`%${item}%`);
      }
      if (notes) {
        query += ' AND notes LIKE ?';
        params.push(`%${notes}%`);
      }

      const { year, month, day } = filter || {};
      if (year) {
        query += " AND strftime('%Y', date) = ?";
        params.push(year.toString());
      }
      if (month) {
        query += " AND CAST(strftime('%m', date) AS INTEGER) = ?";
        params.push(parseInt(month));
      }
      if (day) {
        query += " AND CAST(strftime('%d', date) AS INTEGER) = ?";
        params.push(parseInt(day));
      }

      query += ' ORDER BY date DESC, id ASC';
      const rows = await db.all(query, params);
      event.reply('search-results', rows || []);
    } catch (err) {
      event.reply('search-results', []);
    }
  });

  // ====================================================================
  // 2. معاملات فواتير ومرتجعات العملاء (customer_transactions)
  // ====================================================================

  // إضافة معاملة عميل
  ipcMain.handle('add-customer-transaction', async (event, transaction) => {
    try {
      const now = new Date().toISOString();
      const res = await db.run(
        `INSERT INTO customer_transactions (customer_id, date, time, item, price, quantity, total, type, product_id, notes, last_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          transaction.customer_id,
          transaction.date,
          transaction.time || null,
          transaction.item,
          transaction.price,
          transaction.quantity,
          transaction.total,
          transaction.type || 'sale',
          transaction.product_id || null,
          transaction.notes,
          now
        ]
      );

      syncManager.addToSyncQueue('customer_transactions', {
        ...transaction,
        id: res.id,
        last_modified: now
      }, 'insert');

      return { success: true, id: res.id };
    } catch (err) {
      console.error('Error adding customer transaction:', err);
      return { success: false, error: err.message };
    }
  });

  // تحديث معاملة عميل
  ipcMain.handle('update-customer-transaction', async (event, transaction) => {
    try {
      const now = new Date().toISOString();
      await db.run(
        `UPDATE customer_transactions
         SET item = ?, price = ?, quantity = ?, total = ?, notes = ?, date = ?, time = ?, type = ?, last_modified = ?
         WHERE id = ?`,
        [
          transaction.item,
          transaction.price,
          transaction.quantity,
          transaction.total,
          transaction.notes,
          transaction.date,
          transaction.time || null,
          transaction.type,
          now,
          transaction.id
        ]
      );

      syncManager.addToSyncQueue('customer_transactions', {
        ...transaction,
        last_modified: now
      }, 'update');

      return { success: true };
    } catch (err) {
      console.error('Error updating customer transaction:', err);
      return { success: false, error: err.message };
    }
  });

  // حذف معاملة عميل
  ipcMain.on('delete-customer-transaction', async (event, transactionId) => {
    try {
      const now = new Date().toISOString();
      await db.run('UPDATE customer_transactions SET is_deleted = 1, last_modified = ? WHERE id = ?', [now, transactionId]);

      const row = await db.get('SELECT * FROM customer_transactions WHERE id = ?', [transactionId]);
      if (row) {
        syncManager.addToSyncQueue('customer_transactions', row, 'delete');
      }

      event.reply('customer-transaction-deleted', { success: true });
    } catch (err) {
      event.reply('customer-transaction-deleted', { success: false, error: err.message });
    }
  });

  // البحث في معاملات العميل
  ipcMain.handle('search-customer-transactions', async (event, { customerId, item, notes, filter }) => {
    try {
      let query = 'SELECT * FROM customer_transactions WHERE customer_id = ? AND is_deleted = 0';
      const params = [customerId];

      if (item) {
        query += ' AND item LIKE ?';
        params.push(`%${item}%`);
      }
      if (notes) {
        query += ' AND notes LIKE ?';
        params.push(`%${notes}%`);
      }

      const { year, month, day } = filter || {};
      if (year) {
        query += " AND strftime('%Y', date) = ?";
        params.push(year.toString());
      }
      if (month) {
        query += " AND CAST(strftime('%m', date) AS INTEGER) = ?";
        params.push(parseInt(month));
      }
      if (day) {
        query += " AND CAST(strftime('%d', date) AS INTEGER) = ?";
        params.push(parseInt(day));
      }

      query += ' ORDER BY date DESC, time DESC, id ASC';
      return await db.all(query, params);
    } catch (err) {
      return [];
    }
  });

  // جلب معاملات العميل لشهر محدد
  ipcMain.on('get-customer-transactions-by-month', async (event, { customerId, month, year }) => {
    try {
      const monthStr = String(month).padStart(2, '0');
      const yearStr = String(year);
      const rows = await db.all(
        `SELECT * FROM customer_transactions WHERE customer_id = ? AND is_deleted = 0 AND strftime('%m', date) = ? AND strftime('%Y', date) = ? ORDER BY date ASC, id ASC`,
        [customerId, monthStr, yearStr]
      );
      event.reply('customer-transactions-month-data', { transactions: rows || [] });
    } catch (err) {
      event.reply('customer-transactions-month-data', { transactions: [] });
    }
  });

  // جلب معاملات العميل لسنة محددة
  ipcMain.on('get-customer-transactions-by-year', async (event, { customerId, year }) => {
    try {
      const yearStr = String(year);
      const rows = await db.all(
        `SELECT * FROM customer_transactions WHERE customer_id = ? AND is_deleted = 0 AND strftime('%Y', date) = ? ORDER BY date ASC, id ASC`,
        [customerId, yearStr]
      );
      event.reply('customer-transactions-month-data', { transactions: rows || [] });
    } catch (err) {
      event.reply('customer-transactions-month-data', { transactions: [] });
    }
  });

  // جلب معاملات العميل اليوم
  ipcMain.on('get-customer-transactions-today', async (event, { customerId }) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const rows = await db.all(
        `SELECT * FROM customer_transactions WHERE customer_id = ? AND date = ? AND is_deleted = 0 ORDER BY date ASC, id ASC`,
        [customerId, today]
      );
      event.reply('customer-transactions-month-data', { transactions: rows || [], isToday: true });
    } catch (err) {
      event.reply('customer-transactions-month-data', { transactions: [] });
    }
  });

  // جلب معاملات العميل لآخر يومين عمل
  ipcMain.on('get-customer-transactions-recent', async (event, { customerId }) => {
    try {
      const dateRows = await db.all(
        'SELECT DISTINCT date FROM customer_transactions WHERE customer_id = ? AND is_deleted = 0 ORDER BY date DESC LIMIT 2',
        [customerId]
      );

      if (!dateRows || dateRows.length === 0) {
        event.reply('customer-transactions-month-data', { transactions: [] });
        return;
      }

      const dates = dateRows.map((r) => r.date);
      const placeholders = dates.map(() => '?').join(',');
      const rows = await db.all(
        `SELECT * FROM customer_transactions WHERE customer_id = ? AND is_deleted = 0 AND date IN (${placeholders}) ORDER BY date ASC, id ASC`,
        [customerId, ...dates]
      );

      event.reply('customer-transactions-month-data', { transactions: rows || [], isRecent: true, dates });
    } catch (err) {
      event.reply('customer-transactions-month-data', { transactions: [] });
    }
  });

  // جلب معاملات عميل بتاريخ محدد
  ipcMain.on('get-customer-transactions', async (event, { customerId, date }) => {
    try {
      const rows = await db.all(
        'SELECT * FROM customer_transactions WHERE customer_id = ? AND date = ? AND is_deleted = 0 ORDER BY id ASC',
        [customerId, date]
      );
      event.reply('customer-transactions-data', { transactions: rows || [] });
    } catch (err) {
      event.reply('customer-transactions-data', { transactions: [] });
    }
  });

  // ====================================================================
  // 3. المدفوعات (payments)
  // ====================================================================

  // إضافة دفعة (handle)
  ipcMain.handle('add-payment', async (event, payment) => {
    try {
      const now = new Date().toISOString();
      const res = await db.run(
        `INSERT INTO payments (customer_id, amount, payment_method, date, time, notes, last_modified) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [payment.customer_id, payment.amount, payment.payment_method || 'cash', payment.date, payment.time || null, payment.notes || '', now]
      );

      syncManager.addToSyncQueue('payments', {
        ...payment,
        id: res.id,
        last_modified: now
      }, 'insert');

      return { success: true, id: res.id, payment };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // إضافة دفعة عبر حدث on وتحديث رصيد العميل
  ipcMain.on('add-payment', async (event, paymentData) => {
    try {
      const now = new Date().toISOString();
      const res = await db.run(
        `INSERT INTO payments (customer_id, amount, payment_method, date, time, notes, last_modified) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [paymentData.customer_id, paymentData.amount, paymentData.payment_method || 'cash', paymentData.date, paymentData.time || null, paymentData.notes || '', now]
      );

      await db.run('UPDATE customers SET amount_due = amount_due - ?, last_modified = ? WHERE id = ?', [paymentData.amount, now, paymentData.customer_id]);

      syncManager.addToSyncQueue('payments', {
        ...paymentData,
        id: res.id,
        last_modified: now
      }, 'insert');

      event.reply('payment-added', { success: true, id: res.id });
    } catch (err) {
      event.reply('payment-added', { success: false, error: err.message });
    }
  });

  // جلب مدفوعات عميل
  ipcMain.handle('get-customer-payments', async (event, customerId) => {
    try {
      return await db.all('SELECT * FROM payments WHERE customer_id = ? AND is_deleted = 0 ORDER BY date DESC, time DESC, id DESC', [customerId]);
    } catch (err) {
      return [];
    }
  });

  // جلب دفعة برقمها
  ipcMain.handle('get-payment-by-id', async (event, paymentId) => {
    try {
      return await db.get('SELECT * FROM payments WHERE id = ? AND is_deleted = 0', [paymentId]);
    } catch (err) {
      return null;
    }
  });

  // تحديث دفعة
  ipcMain.handle('update-payment', async (event, payment) => {
    try {
      const now = new Date().toISOString();
      await db.run(
        'UPDATE payments SET amount = ?, payment_method = ?, time = ?, notes = ?, last_modified = ? WHERE id = ?',
        [payment.amount, payment.payment_method, payment.time || null, payment.notes, now, payment.id]
      );

      syncManager.addToSyncQueue('payments', {
        ...payment,
        last_modified: now
      }, 'update');

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // حذف دفعة
  ipcMain.handle('delete-payment', async (event, paymentId) => {
    try {
      const now = new Date().toISOString();
      await db.run('UPDATE payments SET is_deleted = 1, last_modified = ? WHERE id = ?', [now, paymentId]);

      const row = await db.get('SELECT * FROM payments WHERE id = ?', [paymentId]);
      if (row) {
        syncManager.addToSyncQueue('payments', row, 'delete');
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // جلب مدفوعات العميل لشهر محدد
  ipcMain.handle('get-customer-payments-by-month', async (event, { customerId, month, year }) => {
    try {
      const monthStr = String(month).padStart(2, '0');
      const yearStr = String(year);
      return await db.all(
        `SELECT * FROM payments WHERE customer_id = ? AND is_deleted = 0 AND strftime('%m', date) = ? AND strftime('%Y', date) = ? ORDER BY date DESC, time DESC, id DESC`,
        [customerId, monthStr, yearStr]
      );
    } catch (err) {
      return [];
    }
  });

  // إلغاء آخر دفعة
  ipcMain.on('cancel-last-payment', async (event, { customerId, amount }) => {
    try {
      const now = new Date().toISOString();
      const payment = await db.get(
        'SELECT * FROM payments WHERE customer_id = ? AND amount = ? AND is_deleted = 0 ORDER BY id DESC LIMIT 1',
        [customerId, amount]
      );

      if (!payment) return;

      await db.run('UPDATE payments SET is_deleted = 1, last_modified = ? WHERE id = ?', [now, payment.id]);
      syncManager.addToSyncQueue('payments', payment, 'delete');
      event.reply('payment-canceled', { success: true });
    } catch (err) {
      console.error('Error canceling payment:', err);
    }
  });

  // ====================================================================
  // 4. المبيعات (sales)
  // ====================================================================

  ipcMain.on('add-sale', async (event, saleData) => {
    try {
      const now = new Date().toISOString();
      const res = await db.run(
        `INSERT INTO sales (customer_id, product_id, product_name, price, quantity, total, date, last_modified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [saleData.customer_id, saleData.product_id, saleData.product_name, saleData.price, saleData.quantity, saleData.total, saleData.date, now]
      );

      await db.run('UPDATE products SET quantity = quantity - ?, last_modified = ? WHERE id = ?', [saleData.quantity, now, saleData.product_id]);
      await db.run('UPDATE customers SET amount_due = amount_due + ?, last_modified = ? WHERE id = ?', [saleData.total, now, saleData.customer_id]);

      syncManager.addToSyncQueue('sales', {
        ...saleData,
        id: res.id,
        last_modified: now
      }, 'insert');

      event.reply('sale-added', { success: true, id: res.id });
    } catch (err) {
      event.reply('sale-added', { success: false, error: err.message });
    }
  });
}

module.exports = registerTransactionsIpc;

