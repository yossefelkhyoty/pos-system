// backend/src/ipc/syncIpc.js
const { ipcMain } = require('electron');

function registerSyncIpc({ db, syncManager }) {
  // إجبار مزامنة عميل واحد بجميع معاملاته ومدفوعاته
  ipcMain.handle('force-sync-customer', async (event, customerId) => {
    try {
      const now = new Date().toISOString();

      const customer = await db.get('SELECT * FROM customers WHERE id = ?', [customerId]);
      if (!customer) throw new Error('العميل غير موجود');

      await syncManager.addToSyncQueue('customers', { ...customer, last_modified: now }, 'insert');

      const transactions = await db.all('SELECT * FROM customer_transactions WHERE customer_id = ? AND is_deleted = 0', [customerId]);
      for (const trx of transactions) {
        await syncManager.addToSyncQueue('customer_transactions', { ...trx, last_modified: now }, 'insert');
      }

      const payments = await db.all('SELECT * FROM payments WHERE customer_id = ? AND is_deleted = 0', [customerId]);
      for (const pay of payments) {
        await syncManager.addToSyncQueue('payments', { ...pay, last_modified: now }, 'insert');
      }

      if (syncManager.isOnline) {
        syncManager.processSyncQueue();
      }

      return { success: true };
    } catch (error) {
      console.error('Force Sync Error:', error);
      return { success: false, error: error.message };
    }
  });

  // إجبار مزامنة كافة العملاء
  ipcMain.handle('force-sync-all-customers', async () => {
    try {
      const now = new Date().toISOString();
      const customers = await db.all('SELECT * FROM customers WHERE is_deleted = 0');

      for (const customer of customers) {
        await syncManager.addToSyncQueue('customers', { ...customer, last_modified: now }, 'insert');

        const transactions = await db.all('SELECT * FROM customer_transactions WHERE customer_id = ? AND is_deleted = 0', [customer.id]);
        for (const trx of transactions) {
          await syncManager.addToSyncQueue('customer_transactions', { ...trx, last_modified: now }, 'insert');
        }

        const payments = await db.all('SELECT * FROM payments WHERE customer_id = ? AND is_deleted = 0', [customer.id]);
        for (const pay of payments) {
          await syncManager.addToSyncQueue('payments', { ...pay, last_modified: now }, 'insert');
        }
      }

      if (syncManager.isOnline) {
        syncManager.processSyncQueue();
      }

      return { success: true };
    } catch (error) {
      console.error('Force Sync All Error:', error);
      return { success: false, error: error.message };
    }
  });

  // جلب البيانات من Supabase
  ipcMain.handle('pull-from-supabase', async () => {
    if (!syncManager) {
      return { success: false, error: 'مدير المزامنة غير جاهز' };
    }
    return syncManager.pullFromSupabase();
  });
}

module.exports = registerSyncIpc;

