// backend/src/ipc/customersIpc.js
const { ipcMain } = require('electron');
const crypto = require('crypto');
const { webPortalUrl } = require('../config/env');

function registerCustomersIpc({ db, syncManager }) {
  // جلب قائمة العملاء
  ipcMain.on('get-customers', async (event, filters = {}) => {
    try {
      let query = 'SELECT * FROM customers WHERE is_deleted = 0';
      const params = [];

      if (filters.search) {
        query += ' AND name LIKE ?';
        params.push(`%${filters.search}%`);
      }

      if (filters.searchById) {
        query += ' AND id = ?';
        params.push(filters.searchById);
      }

      if (filters.searchByPhone) {
        query += ' AND phone LIKE ?';
        params.push(`%${filters.searchByPhone}%`);
      }

      if (filters.date) {
        query += ' AND date = ?';
        params.push(filters.date);
      }

      query += ' ORDER BY name ASC';

      const customers = await db.all(query, params);
      event.reply('customers-data', { customers: customers || [] });
    } catch (err) {
      console.error('Error getting customers:', err);
      event.reply('customers-data', { customers: [] });
    }
  });

  // إضافة عميل جديد وتوليد portal_token فريد ومستحيل التكرار
  ipcMain.on('add-customer', async (event, customer) => {
    try {
      const now = new Date().toISOString();
      const portalToken = customer.portal_token || crypto.randomUUID();

      const query = `
        INSERT INTO customers (name, amount_due, date, notes, phone, portal_token, last_modified)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      const params = [
        customer.name,
        customer.amount_due || 0,
        customer.date,
        customer.notes || '',
        customer.phone || '',
        portalToken,
        now
      ];

      const res = await db.run(query, params);

      syncManager.addToSyncQueue('customers', {
        ...customer,
        id: res.id,
        portal_token: portalToken,
        last_modified: now
      }, 'insert');

      event.reply('customer-added', { success: true, id: res.id, portal_token: portalToken });
    } catch (err) {
      console.error('Error adding customer:', err);
      event.reply('customer-added', { success: false, error: err.message });
    }
  });

  // تحديث بيانات العميل
  ipcMain.on('update-customer', async (event, customer) => {
    try {
      const now = new Date().toISOString();
      await db.run(
        `UPDATE customers SET name = ?, phone = ?, notes = ?, last_modified = ? WHERE id = ?`,
        [customer.name, customer.phone || '', customer.notes || '', now, customer.id]
      );

      syncManager.addToSyncQueue('customers', {
        ...customer,
        last_modified: now
      }, 'update');

      event.reply('customer-updated', { success: true });
    } catch (err) {
      console.error('Error updating customer:', err);
      event.reply('customer-updated', { success: false, error: err.message });
    }
  });

  // حذف عميل بحماية كلمة مرور الأدمن
  ipcMain.handle('secure-delete-customer', async (event, { id, password }) => {
    try {
      const admin = await db.get("SELECT password FROM users WHERE username = 'admin'");
      if (!admin || admin.password !== password) {
        return { success: false, error: 'كلمة مرور الأدمن غير صحيحة' };
      }

      const now = new Date().toISOString();
      await db.run('UPDATE customers SET is_deleted = 1, last_modified = ? WHERE id = ?', [now, id]);

      const row = await db.get('SELECT * FROM customers WHERE id = ?', [id]);
      if (row) {
        syncManager.addToSyncQueue('customers', row, 'delete');
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // توليد رابط العميل الآمن بالـ UUID (portal_token)
  ipcMain.on('generate-customer-link', async (event, customerId) => {
    try {
      let customer = await db.get('SELECT id, portal_token FROM customers WHERE id = ?', [customerId]);

      // إذا لم يكن لديه توكن، يتم توليده وحفظه فوراً
      if (customer && !customer.portal_token) {
        const token = crypto.randomUUID();
        await db.run('UPDATE customers SET portal_token = ? WHERE id = ?', [token, customerId]);
        customer.portal_token = token;
      }

      const tokenOrId = customer?.portal_token || customerId;
      const customerLink = `${webPortalUrl}/customer/${tokenOrId}`;

      event.reply('customer-link-generated', { link: customerLink, token: tokenOrId });
    } catch (err) {
      console.error('Error generating customer link:', err);
      event.reply('customer-link-generated', { link: `${webPortalUrl}/customer/${customerId}` });
    }
  });

  // كشف حساب العميل والمديونية
  ipcMain.on('get-customer-account', async (event, customerId) => {
    try {
      const customer = await db.get('SELECT * FROM customers WHERE id = ? AND is_deleted = 0', [customerId]);
      if (!customer) {
        event.reply('customer-account-data', { customer: null, sales: [], payments: [] });
        return;
      }

      const balRow = await db.get(
        `SELECT 
          (SELECT IFNULL(SUM(total),0) FROM customer_transactions WHERE customer_id = ? AND is_deleted = 0) AS total_sales,
          (SELECT IFNULL(SUM(amount),0) FROM payments WHERE customer_id = ? AND is_deleted = 0) AS total_paid
        `,
        [customerId, customerId]
      );

      const totalBalance = (Number(balRow?.total_sales) || 0) - (Number(balRow?.total_paid) || 0);
      const sales = await db.all('SELECT * FROM sales WHERE customer_id = ? AND is_deleted = 0 ORDER BY date DESC', [customerId]);
      const payments = await db.all('SELECT * FROM payments WHERE customer_id = ? AND is_deleted = 0 ORDER BY date DESC', [customerId]);

      event.reply('customer-account-data', {
        customer: { ...customer, total_balance: totalBalance },
        sales: sales || [],
        payments: payments || []
      });
    } catch (err) {
      console.error('Error getting customer account:', err);
      event.reply('customer-account-data', { customer: null, sales: [], payments: [] });
    }
  });

  // تحديث رصيد العميل
  ipcMain.on('update-customer-balance', async (event, { id, amount_due }) => {
    try {
      const now = new Date().toISOString();
      await db.run('UPDATE customers SET amount_due = ?, last_modified = ? WHERE id = ?', [amount_due, now, id]);

      const row = await db.get('SELECT * FROM customers WHERE id = ?', [id]);
      if (row) syncManager.addToSyncQueue('customers', row, 'update');
    } catch (err) {
      console.error('Error updating customer balance:', err);
    }
  });

  // جلب الرصيد السابق
  ipcMain.handle('get-customer-previous-balance', async (event, customerId) => {
    try {
      const row = await db.get('SELECT amount_due FROM customers WHERE id = ? AND is_deleted = 0', [customerId]);
      return row ? row.amount_due : 0;
    } catch (err) {
      return 0;
    }
  });

  // مدفوعات العميل اليوم
  ipcMain.handle('get-customer-paid-today', async (event, { customerId, date }) => {
    try {
      const row = await db.get(
        'SELECT SUM(amount) as totalPaid FROM payments WHERE customer_id = ? AND date = ? AND is_deleted = 0',
        [customerId, date]
      );
      return Number(row?.totalPaid) || 0;
    } catch (err) {
      return 0;
    }
  });

  // الرصيد الكلي
  ipcMain.handle('get-customer-total-balance', async (event, customerId) => {
    try {
      const row = await db.get(
        `SELECT 
          (SELECT IFNULL(SUM(total),0) FROM customer_transactions WHERE customer_id = ? AND is_deleted = 0) AS total_sales,
          (SELECT IFNULL(SUM(amount),0) FROM payments WHERE customer_id = ? AND is_deleted = 0) AS total_paid
        `,
        [customerId, customerId]
      );
      const sales = Number(row?.total_sales) || 0;
      const paid = Number(row?.total_paid) || 0;
      return sales - paid;
    } catch (err) {
      return 0;
    }
  });
}

module.exports = registerCustomersIpc;

