// backend/src/ipc/backupIpc.js
const { ipcMain, dialog } = require('electron');
const sqlite3 = require('sqlite3').verbose();

function registerBackupIpc({ db, syncManager, getMainWindow }) {
  // اختيار ملف النسخة الاحتياطية
  ipcMain.handle('select-backup-file', async () => {
    const mainWindow = getMainWindow();
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'اختر ملف النسخة الاحتياطية',
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      properties: ['openFile']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // قراءة العملاء من النسخة الاحتياطية
  ipcMain.handle('get-customers-from-backup', async (event, filePath) => {
    return new Promise((resolve) => {
      const backupDb = new sqlite3.Database(filePath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
          console.error('Error opening backup DB:', err);
          return resolve({ success: false, error: 'فشل فتح ملف النسخة الاحتياطية' });
        }

        backupDb.all('SELECT id, name, phone, date FROM customers WHERE is_deleted = 0', (err, rows) => {
          backupDb.close();
          if (err) {
            console.error('Error reading customers from backup:', err);
            resolve({ success: false, error: 'فشل قراءة العملاء من النسخة الاحتياطية' });
          } else {
            resolve({ success: true, customers: rows || [] });
          }
        });
      });
    });
  });

  // تنفيذ دمج عميل من النسخة الاحتياطية
  ipcMain.handle('execute-customer-merge', async (event, { backupPath, sourceCustomerId }) => {
    return new Promise((resolve) => {
      const backupDb = new sqlite3.Database(backupPath, sqlite3.OPEN_READONLY, async (err) => {
        if (err) return resolve({ success: false, error: 'فشل فتح النسخة الاحتياطية' });

        try {
          // 1. جلب بيانات العميل من النسخة
          const customer = await new Promise((r) =>
            backupDb.get('SELECT * FROM customers WHERE id = ?', [sourceCustomerId], (err, row) => r(row))
          );
          if (!customer) throw new Error('العميل غير موجود في النسخة الاحتياطية');

          // 2. التحقق إذا كان العميل موجوداً حالياً بالاسم
          let targetCustomerId;
          const existing = await db.get('SELECT id FROM customers WHERE name = ?', [customer.name]);
          const now = new Date().toISOString();

          if (existing) {
            targetCustomerId = existing.id;

            // مسح أي حذف معلق للعميل في الطابور
            await db.run(
              `DELETE FROM offline_sync_queue WHERE table_name = 'customers' AND (record_data LIKE ? OR record_data LIKE ?)`,
              [`%\"id\":${targetCustomerId},%`, `%\"id\":${targetCustomerId}}%`]
            );

            await db.run('UPDATE customers SET is_deleted = 0, last_modified = ? WHERE id = ?', [now, targetCustomerId]);

            const updatedCustomer = await db.get('SELECT * FROM customers WHERE id = ?', [targetCustomerId]);
            if (updatedCustomer) {
              await syncManager.addToSyncQueue('customers', updatedCustomer, 'insert');
            }
          } else {
            const res = await db.run(
              `INSERT INTO customers (name, phone, amount_due, date, notes, last_modified) VALUES (?, ?, ?, ?, ?, ?)`,
              [customer.name, customer.phone, customer.amount_due, customer.date, customer.notes, now]
            );
            targetCustomerId = res.id;

            const newCustomer = await db.get('SELECT * FROM customers WHERE id = ?', [targetCustomerId]);
            if (newCustomer) {
              await syncManager.addToSyncQueue('customers', newCustomer, 'insert');
            }
          }

          // 3. دمج المعاملات
          const transactions = await new Promise((r) =>
            backupDb.all('SELECT * FROM customer_transactions WHERE customer_id = ?', [sourceCustomerId], (err, rows) => r(rows || []))
          );
          for (const trx of transactions) {
            let existingTrx = await db.get(
              'SELECT id FROM customer_transactions WHERE customer_id = ? AND date = ? AND item = ? AND total = ?',
              [targetCustomerId, trx.date, trx.item, trx.total]
            );

            let localTrxId;
            if (!existingTrx) {
              const res = await db.run(
                `INSERT INTO customer_transactions (customer_id, date, time, item, price, quantity, total, type, product_id, notes, last_modified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [targetCustomerId, trx.date, trx.time || null, trx.item, trx.price, trx.quantity, trx.total, trx.type, trx.product_id, trx.notes, now]
              );
              localTrxId = res.id;
            } else {
              localTrxId = existingTrx.id;
            }

            if (localTrxId) {
              await syncManager.addToSyncQueue('customer_transactions', {
                ...trx,
                id: localTrxId,
                customer_id: targetCustomerId,
                last_modified: now
              }, 'insert');
            }
          }

          // 4. دمج المدفوعات
          const payments = await new Promise((r) =>
            backupDb.all('SELECT * FROM payments WHERE customer_id = ?', [sourceCustomerId], (err, rows) => r(rows || []))
          );
          for (const pay of payments) {
            let existingPay = await db.get(
              'SELECT id FROM payments WHERE customer_id = ? AND date = ? AND amount = ?',
              [targetCustomerId, pay.date, pay.amount]
            );

            let localPayId;
            if (!existingPay) {
              const res = await db.run(
                `INSERT INTO payments (customer_id, amount, payment_method, date, time, notes, last_modified) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [targetCustomerId, pay.amount, pay.payment_method, pay.date, pay.time, pay.notes, now]
              );
              localPayId = res.id;
            } else {
              localPayId = existingPay.id;
            }

            if (localPayId) {
              await syncManager.addToSyncQueue('payments', {
                ...pay,
                id: localPayId,
                customer_id: targetCustomerId,
                last_modified: now
              }, 'insert');
            }
          }

          backupDb.close();
          resolve({ success: true, customerId: targetCustomerId });
        } catch (error) {
          console.error('Merge Error:', error);
          backupDb.close();
          resolve({ success: false, error: error.message });
        }
      });
    });
  });
}

module.exports = registerBackupIpc;

