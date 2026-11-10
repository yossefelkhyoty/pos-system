// backend/src/ipc/productsIpc.js
const { ipcMain } = require('electron');

function registerProductsIpc({ db, syncManager, getMainWindow }) {
  // إحضار المنتجات مع إحصائيات الأسعار
  ipcMain.handle('get-products', async (event, filters = {}) => {
    try {
      let query = 'SELECT * FROM products WHERE is_deleted = 0';
      const params = [];

      if (filters.search) {
        query += ' AND (name LIKE ? OR serial_number LIKE ?)';
        params.push(`%${filters.search}%`, `%${filters.search}%`);
      }

      if (filters.minPrice !== undefined && filters.maxPrice !== undefined) {
        query += ' AND price BETWEEN ? AND ?';
        params.push(filters.minPrice, filters.maxPrice);
      }

      if (filters.category) {
        query += ' AND category = ?';
        params.push(filters.category);
      }

      query += ' ORDER BY name ASC';

      const products = await db.all(query, params);
      const priceStats = await db.get('SELECT MIN(price) as minPrice, MAX(price) as maxPrice FROM products WHERE is_deleted = 0');

      return { products: products || [], priceStats: priceStats || {} };
    } catch (err) {
      console.error('Error getting products:', err);
      return { products: [], priceStats: {} };
    }
  });

  // إضافة منتج
  ipcMain.handle('add-product', async (event, product) => {
    try {
      const now = new Date().toISOString();
      const res = await db.run(
        `INSERT INTO products (serial_number, name, price, wholesale_price, purchase_price, quantity, min_quantity, category, last_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          product.serial_number,
          product.name,
          product.price,
          product.wholesale_price,
          product.purchase_price || 0,
          product.quantity,
          product.min_quantity,
          product.category,
          now
        ]
      );

      syncManager.addToSyncQueue('products', {
        ...product,
        id: res.id,
        last_modified: now
      }, 'insert');

      return { success: true, id: res.id };
    } catch (err) {
      console.error('Error adding product:', err);
      return { success: false, error: err.message };
    }
  });

  // تحديث منتج
  ipcMain.handle('update-product', async (event, product) => {
    try {
      const now = new Date().toISOString();
      await db.run(
        `UPDATE products 
         SET name = ?, price = ?, wholesale_price = ?, purchase_price = ?, quantity = ?, min_quantity = ?, category = ?, last_modified = ?
         WHERE id = ?`,
        [
          product.name,
          product.price,
          product.wholesale_price,
          product.purchase_price || 0,
          product.quantity,
          product.min_quantity,
          product.category,
          now,
          product.id
        ]
      );

      syncManager.addToSyncQueue('products', {
        ...product,
        last_modified: now
      }, 'update');

      return { success: true };
    } catch (err) {
      console.error('Error updating product:', err);
      return { success: false, error: err.message };
    }
  });

  // إحضار منتج بالـ ID
  ipcMain.handle('get-product-by-id', async (event, id) => {
    try {
      return await db.get('SELECT * FROM products WHERE id = ? AND is_deleted = 0', [id]);
    } catch (err) {
      return null;
    }
  });

  // إحضار منتج بالسيريال نمبر
  ipcMain.handle('get-product-by-serial', async (event, serialNumber) => {
    try {
      return await db.get('SELECT * FROM products WHERE serial_number = ? AND is_deleted = 0', [serialNumber]);
    } catch (err) {
      return null;
    }
  });

  // حذف منتج بحماية كلمة مرور الأدمن
  ipcMain.handle('secure-delete-product', async (event, { id, password }) => {
    try {
      const admin = await db.get("SELECT password FROM users WHERE username = 'admin'");
      if (!admin || admin.password !== password) {
        return { success: false, error: 'كلمة مرور الأدمن غير صحيحة' };
      }

      const now = new Date().toISOString();
      await db.run('UPDATE products SET is_deleted = 1, last_modified = ? WHERE id = ?', [now, id]);

      const row = await db.get('SELECT * FROM products WHERE id = ?', [id]);
      if (row) {
        syncManager.addToSyncQueue('products', row, 'delete');
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // المنتجات قليلة المخزون
  ipcMain.handle('get-low-stock-products', async () => {
    try {
      return await db.all('SELECT * FROM products WHERE quantity <= min_quantity AND is_deleted = 0 ORDER BY quantity ASC');
    } catch (err) {
      return [];
    }
  });

  // إنقاص كمية
  ipcMain.handle('decrease-product-quantity', async (event, { id, amount }) => {
    try {
      const now = new Date().toISOString();
      await db.run(
        'UPDATE products SET quantity = quantity - ?, last_modified = ? WHERE id = ? AND quantity > 0',
        [amount, now, id]
      );

      const row = await db.get('SELECT * FROM products WHERE id = ?', [id]);
      if (row) syncManager.addToSyncQueue('products', row, 'update');

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // زيادة كمية
  ipcMain.handle('increase-product-quantity', async (event, { id, amount }) => {
    try {
      const now = new Date().toISOString();
      await db.run('UPDATE products SET quantity = quantity + ?, last_modified = ? WHERE id = ?', [amount, now, id]);

      const row = await db.get('SELECT * FROM products WHERE id = ?', [id]);
      if (row) syncManager.addToSyncQueue('products', row, 'update');

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // البحث عن منتجات
  ipcMain.handle('search-products', async (event, searchTerm) => {
    try {
      return await db.all(
        `SELECT * FROM products WHERE (serial_number LIKE ? OR name LIKE ?) AND is_deleted = 0 ORDER BY name LIMIT 10`,
        [`%${searchTerm}%`, `%${searchTerm}%`]
      );
    } catch (err) {
      return [];
    }
  });

  // تعديل الكمية عبر حدث IPC
  ipcMain.on('update-product-quantity', async (event, { productId, change }) => {
    try {
      const now = new Date().toISOString();
      await db.run('UPDATE products SET quantity = quantity + ?, last_modified = ? WHERE id = ?', [change, now, productId]);

      const row = await db.get('SELECT * FROM products WHERE id = ?', [productId]);
      if (row) syncManager.addToSyncQueue('products', row, 'update');

      event.reply('update-product-quantity-response', { success: true });
    } catch (err) {
      event.reply('update-product-quantity-response', { success: false, error: err.message });
    }
  });

  // البحث عن المنتجات في الصفحة الرئيسية
  ipcMain.on('search-products-main', async (event, searchTerm) => {
    try {
      const products = await db.all(
        'SELECT id, serial_number, name, price, wholesale_price, quantity FROM products WHERE (name LIKE ? OR serial_number LIKE ?) AND is_deleted = 0',
        [`%${searchTerm}%`, `%${searchTerm}%`]
      );
      event.reply('search-products-results', products || []);
    } catch (err) {
      event.reply('search-products-results', []);
    }
  });

  // فتح صفحة تعديل منتج
  ipcMain.on('open-product-edit', (event, productId) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.loadFile(require('path').join(__dirname, '../../../frontend/src/products.html'), {
        query: { id: productId }
      });
    }
  });
}

module.exports = registerProductsIpc;

