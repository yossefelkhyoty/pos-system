// backend/src/database/schema.js
const crypto = require('crypto');

async function initializeSchema(db) {
  return new Promise((resolve, reject) => {
    db.serialize(async () => {
      try {
        // 1. جدول المنتجات
        await db.run(`
          CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            serial_number TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            wholesale_price REAL NOT NULL,
            purchase_price REAL DEFAULT 0,
            quantity INTEGER NOT NULL,
            min_quantity INTEGER NOT NULL,
            category TEXT NOT NULL,
            last_modified TEXT,
            is_deleted INTEGER DEFAULT 0,
            sync_status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // 2. جدول العملاء (يشمل portal_token)
        await db.run(`
          CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT,
            amount_due REAL DEFAULT 0,
            date TEXT NOT NULL,
            notes TEXT,
            portal_token TEXT UNIQUE,
            auth_id TEXT,
            last_modified TEXT,
            is_deleted INTEGER DEFAULT 0,
            sync_status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // 3. جدول المبيعات
        await db.run(`
          CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER,
            product_id INTEGER,
            product_name TEXT NOT NULL,
            price REAL NOT NULL,
            quantity INTEGER NOT NULL,
            total REAL NOT NULL,
            date TEXT NOT NULL,
            last_modified TEXT,
            is_deleted INTEGER DEFAULT 0,
            sync_status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customer_id) REFERENCES customers (id),
            FOREIGN KEY (product_id) REFERENCES products (id)
          )
        `);

        // 4. جدول المدفوعات
        await db.run(`
          CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            payment_method TEXT DEFAULT 'cash',
            date TEXT NOT NULL,
            time TEXT,
            notes TEXT,
            last_modified TEXT,
            is_deleted INTEGER DEFAULT 0,
            sync_status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customer_id) REFERENCES customers (id)
          )
        `);

        // 5. جدول معاملات الصفحة الرئيسية (كشف الخزينة اليومي - محلي فقط)
        await db.run(`
          CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time TEXT,
            item TEXT,
            account REAL DEFAULT 0,
            withdraw REAL DEFAULT 0,
            notes TEXT,
            last_modified TEXT,
            is_deleted INTEGER DEFAULT 0,
            sync_status TEXT DEFAULT 'pending'
          )
        `);

        // 6. جدول معاملات العملاء (فواتير/مرتجعات العملاء)
        await db.run(`
          CREATE TABLE IF NOT EXISTS customer_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER,
            date TEXT,
            time TEXT,
            item TEXT,
            price REAL,
            quantity INTEGER,
            total REAL,
            type TEXT DEFAULT 'sale',
            product_id INTEGER,
            notes TEXT,
            last_modified TEXT,
            is_deleted INTEGER DEFAULT 0,
            sync_status TEXT DEFAULT 'pending'
          )
        `);

        // 7. جدول طابور المزامنة
        await db.run(`
          CREATE TABLE IF NOT EXISTS offline_sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_name TEXT NOT NULL,
            record_data TEXT NOT NULL,
            operation TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // 8. جدول المستخدمين
        await db.run(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            permissions TEXT,
            last_modified TEXT,
            is_deleted INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // ========== ترقيات وتحديثات الأعمدة القديمة ==========
        const safeAddColumns = [
          `ALTER TABLE customers ADD COLUMN portal_token TEXT`,
          `ALTER TABLE customers ADD COLUMN auth_id TEXT`,
          `ALTER TABLE products ADD COLUMN purchase_price REAL DEFAULT 0`,
          `ALTER TABLE payments ADD COLUMN time TEXT`,
          `ALTER TABLE transactions ADD COLUMN time TEXT`,
          `ALTER TABLE customer_transactions ADD COLUMN time TEXT`,
          `ALTER TABLE customer_transactions ADD COLUMN product_id INTEGER`
        ];

        for (const query of safeAddColumns) {
          try {
            await db.run(query);
          } catch (e) {
            // تجاهل خطأ وجود العمود مسبقاً
          }
        }

        // توليد portal_token لأي عملاء قدامى في SQLite بدون توكن
        const customersWithoutToken = await db.all('SELECT id FROM customers WHERE portal_token IS NULL OR portal_token = ""');
        if (customersWithoutToken && customersWithoutToken.length > 0) {
          console.log(`🔑 Generating portal_tokens for ${customersWithoutToken.length} existing customers...`);
          for (const cust of customersWithoutToken) {
            const token = crypto.randomUUID();
            await db.run('UPDATE customers SET portal_token = ? WHERE id = ?', [token, cust.id]);
          }
        }

        // إضافة مستخدم أدمن افتراضي إذا لم يوجد
        const adminUser = await db.get("SELECT * FROM users WHERE username = 'admin'");
        if (!adminUser) {
          const now = new Date().toISOString();
          await db.run(
            `INSERT INTO users (username, password, role, last_modified) VALUES ('admin', 'admin123', 'admin', ?)`,
            [now]
          );
          console.log('👤 Default admin user created');
        }

        // تنظيف طابور المزامنة من معاملات الصفحة الرئيسية
        await db.run("DELETE FROM offline_sync_queue WHERE table_name = 'transactions'");

        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

module.exports = { initializeSchema };

