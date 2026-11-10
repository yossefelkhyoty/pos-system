// database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    this.db = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database('pos_system.db', (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          resolve();
        }
      });
    });
  }

  initialize() {
    return new Promise((resolve, reject) => {
      // جدول المنتجات
      const productsTable = `
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          serial_number TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          price REAL NOT NULL,
          wholesale_price REAL NOT NULL,
          purchase_price REAL DEFAULT 0,       -- ✅ العمود الجديد
          quantity INTEGER NOT NULL,
          min_quantity INTEGER NOT NULL,
          category TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      // جدول العملاء
      const customersTable = `
    CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    amount_due REAL DEFAULT 0,
    date TEXT NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    auth_id TEXT
  )
`;


      // جدول المبيعات
      const salesTable = `
        CREATE TABLE IF NOT EXISTS sales (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER,
          product_id INTEGER,
          product_name TEXT NOT NULL,
          price REAL NOT NULL,
          quantity INTEGER NOT NULL,
          total REAL NOT NULL,
          date TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (customer_id) REFERENCES customers (id),
          FOREIGN KEY (product_id) REFERENCES products (id)
        )
      `;

      // جدول المدفوعات
      const paymentsTable = `
        CREATE TABLE IF NOT EXISTS payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER NOT NULL,
          amount REAL NOT NULL,
          date TEXT NOT NULL,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (customer_id) REFERENCES customers (id)
        )
      `;

      this.db.serialize(() => {
        this.db.run(productsTable, (err) => {
          if (err) reject(err);
        });
        this.db.run(customersTable, (err) => {
          if (err) reject(err);
        });
        this.db.run(salesTable, (err) => {
          if (err) reject(err);
        });
        this.db.run(paymentsTable, (err) => {
          if (err) reject(err);
        });

        // الاحتفاظ بجدول المعاملات القديم لتتبع المال
        this.db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      item TEXT,
      account REAL DEFAULT 0,
      withdraw REAL DEFAULT 0,
      notes TEXT
    )
  `, (err) => {
          if (err) reject(err);
        });

        // ✅ تحديث الجداول لإضافة الأعمدة الجديدة (لو مش موجودة)
        const alterQueries = [
          `ALTER TABLE products ADD COLUMN last_modified TEXT`,
          `ALTER TABLE products ADD COLUMN is_deleted INTEGER DEFAULT 0`,
          `ALTER TABLE products ADD COLUMN sync_status TEXT DEFAULT 'pending'`,

          `ALTER TABLE customers ADD COLUMN last_modified TEXT`,
          `ALTER TABLE customers ADD COLUMN is_deleted INTEGER DEFAULT 0`,
          `ALTER TABLE customers ADD COLUMN sync_status TEXT DEFAULT 'pending'`,

          `ALTER TABLE sales ADD COLUMN last_modified TEXT`,
          `ALTER TABLE sales ADD COLUMN is_deleted INTEGER DEFAULT 0`,
          `ALTER TABLE sales ADD COLUMN sync_status TEXT DEFAULT 'pending'`,

          `ALTER TABLE payments ADD COLUMN last_modified TEXT`,
          `ALTER TABLE payments ADD COLUMN is_deleted INTEGER DEFAULT 0`,
          `ALTER TABLE payments ADD COLUMN sync_status TEXT DEFAULT 'pending'`,

          `ALTER TABLE transactions ADD COLUMN last_modified TEXT`,
          `ALTER TABLE transactions ADD COLUMN is_deleted INTEGER DEFAULT 0`,
          `ALTER TABLE transactions ADD COLUMN sync_status TEXT DEFAULT 'pending'`,
          `ALTER TABLE customer_transactions ADD COLUMN time TEXT`
        ];

        alterQueries.forEach(query => {
          this.db.run(query, (err) => {
            // نتجاهل الخطأ لو العمود موجود بالفعل
            if (err && !err.message.includes("duplicate column name")) {
              console.error("خطأ في تحديث الجدول:", err.message);
            }
          });
        });

        resolve();
      });
    });
  };




  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

module.exports = Database;