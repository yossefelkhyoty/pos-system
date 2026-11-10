//main.js

const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

console.log("Supabase URL:", process.env.SUPABASE_URL);
console.log("Supabase Key:", process.env.SUPABASE_KEY ? "Loaded ✅" : "Missing ❌");

const SyncManager = require('./sync');
const BackupManager = require('./backup');

let syncManager;
let backupManager;
let db;
let isProcessing = false;
let mainWindow;

const menuTemplate = [
  {
    label: 'ملف',
    submenu: [
      {
        label: 'إنشاء نسخة احتياطية',
        click: () => backupManager.performBackup()
      },
      {
        label: 'استعادة من نسخة احتياطية',
        click: () => {
          dialog.showOpenDialog(mainWindow, {
            title: 'استعادة نسخة احتياطية',
            filters: [
              { name: 'SQLite Database', extensions: ['db'] }
            ],
            properties: ['openFile']
          }).then(result => {
            if (!result.canceled) {
              backupManager.restoreBackup(result.filePaths[0]);
            }
          });
        }
      },
      { type: 'separator' },
      { role: 'quit', label: 'خروج' }
    ]
  },
  {
    label: 'عرض',
    submenu: [
      { role: 'reload', label: 'إعادة تحميل' },
      { role: 'forcereload', label: 'إعادة تحميل قوة' },
      { type: 'separator' },
      { role: 'toggleDevTools', label: 'أدوات المطور' },
      { role: 'resetZoom', label: 'إعادة الضبط' },
      { role: 'zoomIn', label: 'تكبير' },
      { role: 'zoomOut', label: 'تصغير' },
      { role: 'togglefullscreen', label: 'ملء الشاشة' }
    ]
  },
  {
    label: 'المزامنة',
    submenu: [
      {
        label: 'مزامنة الآن (رفع للسحابة)',
        click: () => {
          if (syncManager.isOnline) {
            syncManager.processSyncQueue();
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'المزامنة',
              message: 'جاري رفع البيانات المحلية إلى السحابة...'
            });
          } else {
            dialog.showMessageBox(mainWindow, {
              type: 'warning',
              title: 'غير متصل',
              message: 'لا يوجد اتصال بالإنترنت للمزامنة'
            });
          }
        }
      },
      {
        label: 'جلب البيانات من السحابة',
        click: async () => {
          if (!syncManager.isOnline) {
            dialog.showMessageBox(mainWindow, {
              type: 'warning',
              title: 'غير متصل',
              message: 'لا يوجد اتصال بالإنترنت لجلب البيانات'
            });
            return;
          }

          const response = await dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: 'جلب من السحابة',
            message: 'سيتم تحديث البيانات المحلية بالبيانات الموجودة على Supabase (السحابة).\n\nاستخدم هذا الخيار إذا كانت بيانات الموقع صحيحة والتطبيق ناقص.\n\nهل تريد المتابعة؟',
            buttons: ['نعم، جلب البيانات', 'إلغاء'],
            defaultId: 1,
            cancelId: 1
          });

          if (response.response !== 0) return;

          const result = await syncManager.pullFromSupabase();

          dialog.showMessageBox(mainWindow, {
            type: result.success ? 'info' : 'error',
            title: result.success ? 'تم الجلب بنجاح' : 'فشل الجلب',
            message: result.success
              ? `تم تحديث البيانات المحلية من السحابة:\n${Object.entries(result.stats).map(([t, n]) => `- ${t}: ${n} سجل`).join('\n')}\n\nأعد تحميل الصفحة لرؤية البيانات.`
              : result.error
          });

          if (result.success && mainWindow) {
            mainWindow.webContents.reload();
          }
        }
      },
      {
        label: 'حالة الاتصال',
        click: () => {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'حالة الاتصال',
            message: syncManager.isOnline ?
              'متصل بالإنترنت - المزامنة نشطة' :
              'غير متصل - العمل في وضع عدم الاتصال'
          });
        }
      }
    ]
  },
  {
    label: 'التواصل',
    submenu: [
      {
        label: 'تواصل مع يوسف الخيوطي (01015985881)',
        click: () => {
          shell.openExternal('https://wa.me/201015985881');
        }
      }
    ]
  }
];

const menu = Menu.buildFromTemplate(menuTemplate);
Menu.setApplicationMenu(menu);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, '../../frontend/assets/img/icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../../frontend/src/login.html'));

  // إرسال حالة الاتصال عند تحميل النافذة
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('connection-status', { online: syncManager.isOnline });
  });

  // إضافة قائمة الزر الأيمن (Context Menu) للنسخ واللصق
  mainWindow.webContents.on('context-menu', (event, params) => {
    const template = [];

    // 1. النسخ والقن واللصق وتحديد الكل أولاً
    if (params.selectionText.trim().length > 0) {
      template.push({ role: 'copy', label: 'نسخ' });
    }

    if (params.isEditable) {
      if (params.selectionText.trim().length > 0) {
        template.push({ role: 'cut', label: 'قص' });
      }
      template.push({ role: 'paste', label: 'لصق' });
    }

    template.push({ role: 'selectAll', label: 'تحديد الكل' });

    // 2. باقي العمليات (تراجع، إعادة) تظهر لاحقاً
    if (params.isEditable) {
      template.push({ type: 'separator' });
      template.push({ role: 'undo', label: 'تراجع' });
      template.push({ role: 'redo', label: 'إعادة' });
    }

    const contextMenu = Menu.buildFromTemplate(template);
    contextMenu.popup();
  });
}

function loadPageSilently(page) {
  if (mainWindow) {
    mainWindow.loadFile(path.join(__dirname, '../../frontend/src', page));
  }
}

ipcMain.on('load-page', (event, page) => {
  loadPageSilently(page);
});

// Authentication Handlers
let currentUser = null;

ipcMain.handle('login', async (event, { username, password }) => {
  return new Promise((resolve) => {
    db.get("SELECT * FROM users WHERE username = ? AND password = ? AND is_deleted = 0", [username, password], (err, user) => {
      if (err) {
        resolve({ success: false, error: 'خطأ في قاعدة البيانات' });
      } else if (user) {
        currentUser = {
          id: user.id,
          username: user.username,
          role: user.role,
          permissions: user.permissions ? JSON.parse(user.permissions) : null
        };
        resolve({ success: true, user: currentUser });
      } else {
        resolve({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
      }
    });
  });
});

ipcMain.on('logout', (event) => {
  currentUser = null;
  loadPageSilently('login.html');
});

ipcMain.handle('get-current-user', () => {
  return currentUser;
});

// User Management Handlers (Admin Only)
ipcMain.handle('add-user', async (event, user) => {
  return new Promise((resolve) => {
    const now = new Date().toISOString();
    db.run(`
      INSERT INTO users (username, password, role, permissions, last_modified)
      VALUES (?, ?, ?, ?, ?)
    `, [user.username, user.password, user.role || 'user', JSON.stringify(user.permissions || []), now], function (err) {
      if (err) {
        resolve({ success: false, error: err.message });
      } else {
        resolve({ success: true, id: this.lastID });
      }
    });
  });
});

ipcMain.handle('get-users', async () => {
  return new Promise((resolve) => {
    db.all("SELECT id, username, role, permissions FROM users WHERE is_deleted = 0", (err, rows) => {
      if (err) resolve([]);
      else {
        const users = rows.map(r => ({
          ...r,
          permissions: r.permissions ? JSON.parse(r.permissions) : []
        }));
        resolve(users);
      }
    });
  });
});

ipcMain.handle('update-user', async (event, user) => {
  return new Promise((resolve) => {
    const now = new Date().toISOString();
    db.run(`
      UPDATE users 
      SET username = ?, password = ?, permissions = ?, last_modified = ?
      WHERE id = ?
    `, [user.username, user.password, JSON.stringify(user.permissions || []), now, user.id], (err) => {
      if (err) resolve({ success: false, error: err.message });
      else resolve({ success: true });
    });
  });
});

ipcMain.handle('secure-delete-user', async (event, { id, password }) => {
  return new Promise((resolve) => {
    // 1. التحقق من الباسورد (أدمن)
    db.get("SELECT password FROM users WHERE username = 'admin'", (err, row) => {
      if (err || !row || row.password !== password) {
        resolve({ success: false, error: 'كلمة مرور الأدمن غير صحيحة' });
      } else {
        const now = new Date().toISOString();
        db.run("UPDATE users SET is_deleted = 1, last_modified = ? WHERE id = ?", [now, id], (err) => {
          if (err) resolve({ success: false, error: err.message });
          else resolve({ success: true });
        });
      }
    });
  });
});

ipcMain.handle('change-admin-password', async (event, { oldPassword, newPassword }) => {
  return new Promise((resolve) => {
    db.get("SELECT password FROM users WHERE username = 'admin'", (err, row) => {
      if (err) {
        resolve({ success: false, error: 'خطأ في قاعدة البيانات' });
      } else if (!row || row.password !== oldPassword) {
        resolve({ success: false, error: 'كلمة المرور الحالية غير صحيحة' });
      } else {
        const now = new Date().toISOString();
        db.run("UPDATE users SET password = ?, last_modified = ? WHERE username = 'admin'", [newPassword, now], (err) => {
          if (err) resolve({ success: false, error: 'فشل في تحديث كلمة المرور' });
          else resolve({ success: true });
        });
      }
    });
  });
});

// فتح صفحة تعديل منتج
ipcMain.on('open-product-edit', (event, productId) => {
  if (mainWindow) {
    mainWindow.loadFile(path.join(__dirname, '../../frontend/src/products.html')).then(() => {
      mainWindow.webContents.send('edit-product', productId);
    });
  }
});

// إنشاء رابط العميل
ipcMain.on('generate-customer-link', (event, customerId) => {
  // في التطبيق الحقيقي، سيتم إنشاء رابط فريد بناءً على معرف العميل
  const customerLink = `https://your-domain.vercel.app/customer/${customerId}`;
  event.reply('customer-link-generated', { link: customerLink });
});

app.whenReady().then(() => {
  const dbPath = path.join(__dirname, '../../pos_system.db');
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err);
      return;
    }

    // ========== تحسين أداء قاعدة البيانات ==========
    db.run('PRAGMA journal_mode = WAL'); // وضع سرعة الكتابة والقراءة المتزامنة
    db.run('PRAGMA synchronous = NORMAL'); // تحسين سرعة الحفظ
    db.run('PRAGMA cache_size = -2000'); // زيادة ذاكرة الكاش (2 ميجا)

    // تحديث الجداول بإضافة حقول المزامنة
    db.serialize(() => {
      // جدول المنتجات مع حقول المزامنة
      db.run(`
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

      // جدول العملاء مع حقول المزامنة
      db.run(`
        CREATE TABLE IF NOT EXISTS customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          phone TEXT,
          amount_due REAL DEFAULT 0,
          date TEXT NOT NULL,
          notes TEXT,
          last_modified TEXT,
          is_deleted INTEGER DEFAULT 0,
          sync_status TEXT DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // جدول المبيعات مع حقول المزامنة
      db.run(`
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

      // جدول المدفوعات مع حقول المزامنة
      db.run(`
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

      // إضافة عمود time إذا لم يكن موجوداً (للجداول القديمة)
      db.run(`ALTER TABLE payments ADD COLUMN time TEXT`, (err) => {
        // تجاهل الخطأ إذا كان العمود موجوداً بالفعل
        if (err && !err.message.includes('duplicate column name')) {
          console.error('Error adding time column:', err);
        }
      });

      // جدول المعاملات مع حقول المزامنة
      db.run(`
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

      // إضافة عمود time إذا لم يكن موجوداً (للجداول القديمة)
      db.run(`ALTER TABLE transactions ADD COLUMN time TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.error('Error adding time column to transactions:', err);
        }
      });

      // جدول معاملات العملاء مع حقول المزامنة
      db.run(`
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

      // جدول طابور المزامنة (للمزامنة المؤجلة)
      db.run(`
        CREATE TABLE IF NOT EXISTS offline_sync_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          table_name TEXT NOT NULL,
          record_data TEXT NOT NULL,
          operation TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // جدول المستخدمين
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          permissions TEXT, -- JSON string of allowed pages/actions
          last_modified TEXT,
          is_deleted INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, () => {
        // إضافة مستخدم أدمن افتراضي إذا لم يكن موجوداً
        db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
          if (!row) {
            const now = new Date().toISOString();
            db.run(`
              INSERT INTO users (username, password, role, last_modified)
              VALUES ('admin', 'admin123', 'admin', ?)
            `, [now]);
          }
        });
      });

      // تنظيف طابور المزامنة من العمليات المتعلقة بالصفحة الرئيسية بناءً على طلب المستخدم
      db.run("DELETE FROM offline_sync_queue WHERE table_name = 'transactions'");

      // ========== إنشاء الفهارس (Indexes) لسرعة البحث الرهيبة ==========
      // هذه الفهارس تمنع البرنامج من "التهنيج" عند وجود آلاف البيانات
      db.run('CREATE INDEX IF NOT EXISTS idx_products_serial ON products(serial_number)');
      db.run('CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)');
      db.run('CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)');
      db.run('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)');
      db.run('CREATE INDEX IF NOT EXISTS idx_customer_transactions_cid ON customer_transactions(customer_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_customer_transactions_date ON customer_transactions(date)');
      db.run('CREATE INDEX IF NOT EXISTS idx_payments_cid ON payments(customer_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(date)');

      // ✅ تحديث الجداول لإضافة خانة الوقت (للقواعد القديمة)
      db.run(`ALTER TABLE customer_transactions ADD COLUMN time TEXT`, (err) => {
        if (err && !err.message.includes("duplicate column name")) {
          // نتجاهل الخطأ لو العمود موجود، لكن نسجل أي خطأ تاني
          if (!err.message.includes("column already exists")) {
            console.error("خطأ في إضافة خانة الوقت:", err.message);
          }
        }
      });

      console.log('All tables created and optimized successfully');
    });

    createWindow();

    // تهيئة مدير المزامنة والنسخ الاحتياطي
    syncManager = new SyncManager(db);
    backupManager = new BackupManager(db, supabase);
    backupManager.startAutoBackup();

  });
});


// ========== معالجات أحداث نظام تتبع المال (الحالي) ==========
ipcMain.on('auto-save', (event, { date, data }) => {
  if (isProcessing) {
    event.reply('auto-save-response', {
      success: false,
      error: 'يتم معالجة طلب آخر حالياً'
    });
    return;
  }

  isProcessing = true;

  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (beginErr) => {
      if (beginErr) {
        console.error('Begin transaction error:', beginErr);
        event.reply('auto-save-response', {
          success: false,
          error: 'فشل في بدء المعاملة: ' + beginErr.message
        });
        isProcessing = false;
        return;
      }

      const deleteStmt = db.prepare('DELETE FROM transactions WHERE date = ?');
      deleteStmt.run(date, (deleteErr) => {
        if (deleteErr) {
          console.error('Delete error:', deleteErr);
          db.run('ROLLBACK', (rollbackErr) => {
            if (rollbackErr) {
              console.error('Rollback error:', rollbackErr);
            }
            event.reply('auto-save-response', {
              success: false,
              error: 'فشل في حذف البيانات القديمة: ' + deleteErr.message
            });
            isProcessing = false;
          });
          return;
        }

        deleteStmt.finalize();

        const filteredData = data.filter(entry =>
          entry.item || entry.account || entry.withdraw || entry.notes
        );

        if (filteredData.length === 0) {
          db.run('COMMIT', (commitErr) => {
            if (commitErr) {
              console.error('Commit error:', commitErr);
              event.reply('auto-save-response', {
                success: false,
                error: 'فشل في حفظ التغييرات: ' + commitErr.message
              });
            } else {
              event.reply('auto-save-response', {
                success: true,
                message: 'تم الحفظ بنجاح (لا توجد بيانات جديدة)'
              });
            }
            isProcessing = false;
          });
          return;
        }

        const insertStmt = db.prepare(`
          INSERT INTO transactions (date, time, item, account, withdraw, notes, last_modified)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        let completed = 0;
        let hasError = false;
        const now = new Date().toISOString();

        filteredData.forEach((entry, index) => {
          insertStmt.run(
            [date, entry.time || null, entry.item, entry.account, entry.withdraw, entry.notes, now],
            (insertErr) => {
              if (insertErr) {
                console.error('Insert error at index', index, ':', insertErr);
                hasError = true;
              } else {
                // خلاص مش هنضيف للسحابة هنا
              }

              completed++;

              if (completed === filteredData.length) {
                insertStmt.finalize();

                if (hasError) {
                  db.run('ROLLBACK', (rollbackErr) => {
                    if (rollbackErr) {
                      console.error('Rollback error:', rollbackErr);
                    }
                    event.reply('auto-save-response', {
                      success: false,
                      error: 'فشل في إدراج بعض البيانات'
                    });
                    isProcessing = false;
                  });
                } else {
                  db.run('COMMIT', (commitErr) => {
                    if (commitErr) {
                      console.error('Commit error:', commitErr);
                      event.reply('auto-save-response', {
                        success: false,
                        error: 'فشل في حفظ التغييرات: ' + commitErr.message
                      });
                    } else {
                      event.reply('auto-save-response', {
                        success: true,
                        message: `تم حفظ ${filteredData.length} من العناصر بنجاح`
                      });
                    }
                    isProcessing = false;
                  });
                }
              }
            }
          );
        });
      });
    });
  });
});

// ========== إضافة معاملة للصفحة الرئيسية ==========
// ========== معالجات الداشبورد ==========

ipcMain.handle('get-dashboard-data', async (event, { startDate, endDate }) => {
  return new Promise(async (resolve) => {
    try {
      const stats = {};

      // 1. إجمالي المنتجات
      const productsCount = await new Promise(r => db.get('SELECT COUNT(*) as count FROM products WHERE is_deleted = 0', (err, row) => r(row.count)));
      stats.totalProducts = productsCount;

      // 2. المنتجات منخفضة المخزون
      const lowStockCount = await new Promise(r => db.get('SELECT COUNT(*) as count FROM products WHERE quantity <= min_quantity AND is_deleted = 0', (err, row) => r(row.count)));
      stats.lowStockProducts = lowStockCount;

      // 3. عدد العملاء
      const customersCount = await new Promise(r => db.get('SELECT COUNT(*) as count FROM customers WHERE is_deleted = 0', (err, row) => r(row.count)));
      stats.totalCustomers = customersCount;

      // فلترة التاريخ
      let dateFilter = '';
      let dateParams = [];
      if (startDate && endDate) {
        dateFilter = ' AND date BETWEEN ? AND ?';
        dateParams = [startDate, endDate];
      }

      // 4. حساب الأرباح بناءً على طلب المستخدم
      // أ- صافي الدخل من الصفحة الرئيسية (account - withdraw)
      const mainNet = await new Promise(r => db.get(`SELECT SUM(account - withdraw) as net FROM transactions WHERE is_deleted = 0 ${dateFilter}`, dateParams, (err, row) => r(row?.net || 0)));

      // ب- الدفع من المحفظة الإلكترونية فقط من صفحة العملاء (لتجنب التكرار كما طلب المستخدم)
      const walletNet = await new Promise(r => db.get(`SELECT SUM(amount) as net FROM payments WHERE payment_method = 'wallet' AND is_deleted = 0 ${dateFilter}`, dateParams, (err, row) => r(row?.net || 0)));

      stats.netProfit = mainNet + walletNet;

      // حساب الأرباح لفترات مختلفة (دائماً محسوبة للعرض في القسم المخصص)
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
        const m = await new Promise(r => db.get(`SELECT SUM(account - withdraw) as net FROM transactions WHERE is_deleted = 0 AND date BETWEEN ? AND ?`, [start, end], (err, row) => r(row?.net || 0)));
        const w = await new Promise(r => db.get(`SELECT SUM(amount) as net FROM payments WHERE payment_method = 'wallet' AND is_deleted = 0 AND date BETWEEN ? AND ?`, [start, end], (err, row) => r(row?.net || 0)));
        return (m || 0) + (w || 0);
      };

      stats.dailyProfit = await getPeriodProfit(todayDate, todayDate);
      stats.weeklyProfit = await getPeriodProfit(startOfWeek, '2099-12-31');
      stats.monthlyProfit = await getPeriodProfit(startOfMonth, '2099-12-31');
      stats.yearlyProfit = await getPeriodProfit(startOfYear, '2099-12-31');

      // 5. تحليل المنتجات (الأكثر والأقل مبيعاً)
      // نحتاج لجمع البيانات من customer_transactions و transactions
      const products = await new Promise(r => db.all('SELECT id, name, serial_number, purchase_price, wholesale_price, price FROM products WHERE is_deleted = 0', (err, rows) => r(rows)));

      const productPerformance = [];

      for (const p of products) {
        // الكمية من صفحة العملاء
        const custSales = await new Promise(r => db.get(`SELECT SUM(quantity) as qty, SUM(total) as revenue FROM customer_transactions WHERE product_id = ? AND type = 'sale' AND is_deleted = 0 ${dateFilter}`, [p.id, ...dateParams], (err, row) => r(row || { qty: 0, revenue: 0 })));

        // المرتجعات من صفحة العملاء (نستخدم ABS لأنها مخزنة سالبة في الداتا)
        const custReturns = await new Promise(r => db.get(`SELECT SUM(quantity) as qty, SUM(ABS(total)) as total FROM customer_transactions WHERE product_id = ? AND type = 'return' AND is_deleted = 0 ${dateFilter}`, [p.id, ...dateParams], (err, row) => r(row || { qty: 0, total: 0 })));

        // الكمية من الصفحة الرئيسية (بعد السيريال في الملاحظات)
        const mainSales = await new Promise(r => db.get(`SELECT COUNT(*) as count, SUM(account) as revenue FROM transactions WHERE notes LIKE ? AND is_deleted = 0 ${dateFilter}`, [`%${p.serial_number}%`, ...dateParams], (err, row) => r(row || { count: 0, revenue: 0 })));

        const totalQty = (custSales.qty || 0) + (mainSales.count || 0) - (custReturns.qty || 0);
        const totalRevenue = (custSales.revenue || 0) + (mainSales.revenue || 0) - (custReturns.total || 0);
        const costBasis = totalQty * (p.purchase_price || 0);
        const netProfit = totalRevenue - costBasis;

        if (totalQty > 0 || mainSales.count > 0 || custSales.qty > 0) {
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

      // ترتيب المنتجات مبيعاً (أكثر 3 وأقل 3)
      stats.topProducts = [...productPerformance].sort((a, b) => b.totalQuantity - a.totalQuantity).slice(0, 3);
      stats.leastProducts = [...productPerformance].sort((a, b) => a.totalQuantity - b.totalQuantity).slice(0, 3);
      stats.productsProfit = [...productPerformance].sort((a, b) => b.netProfit - a.netProfit);

      // تفاصيل الأرباح الإضافية للقسم
      stats.totalSales = productPerformance.reduce((sum, p) => sum + p.totalRevenue, 0);
      stats.productCosts = productPerformance.reduce((sum, p) => sum + (p.totalQuantity * p.purchasePrice), 0);

      resolve(stats);
    } catch (err) {
      console.error('Dashboard Error:', err);
      resolve({
        netProfit: 0,
        totalProducts: 0,
        lowStockProducts: 0,
        totalCustomers: 0,
        topProducts: [],
        leastProducts: [],
        productsProfit: [],
        totalSales: 0,
        productCosts: 0
      });
    }
  });
});

ipcMain.handle('get-product-dashboard-details', async (event, { productId, startDate, endDate }) => {
  return new Promise(async (resolve) => {
    try {
      const product = await new Promise(r => db.get('SELECT * FROM products WHERE id = ?', [productId], (err, row) => r(row)));
      if (!product) return resolve(null);

      let dateFilter = '';
      let dateParams = [];
      if (startDate && endDate) {
        dateFilter = ' AND date BETWEEN ? AND ?';
        dateParams = [startDate, endDate];
      }

      const custSales = await new Promise(r => db.get(`SELECT SUM(quantity) as qty, SUM(total) as revenue FROM customer_transactions WHERE product_id = ? AND type = 'sale' AND is_deleted = 0 ${dateFilter}`, [productId, ...dateParams], (err, row) => r(row || { qty: 0, revenue: 0 })));
      const mainSales = await new Promise(r => db.get(`SELECT COUNT(*) as count, SUM(account) as revenue FROM transactions WHERE notes LIKE ? AND is_deleted = 0 ${dateFilter}`, [`%${product.serial_number}%`, ...dateParams], (err, row) => r(row || { count: 0, revenue: 0 })));
      const returns = await new Promise(r => db.get(`SELECT SUM(quantity) as qty, SUM(ABS(total)) as total, COUNT(*) as returnCount FROM customer_transactions WHERE product_id = ? AND type = 'return' AND is_deleted = 0 ${dateFilter}`, [productId, ...dateParams], (err, row) => r(row || { qty: 0, total: 0, returnCount: 0 })));

      const netCustQty = (custSales.qty || 0) - (returns.qty || 0);
      const totalQty = netCustQty + (mainSales.count || 0);
      const totalRevenue = (custSales.revenue || 0) + (mainSales.revenue || 0) - (returns.total || 0);
      const netProfit = totalRevenue - (totalQty * (product.purchase_price || 0));

      resolve({
        quantityFromCustomers: netCustQty,
        quantityFromMain: mainSales.count || 0,
        countFromMain: mainSales.count || 0,
        returnCount: returns.returnCount || 0,
        returnedQty: returns.qty || 0,
        totalQuantity: totalQty,
        totalRevenue: totalRevenue,
        netProfit: netProfit
      });
    } catch (err) {
      console.error('Product Details Error:', err);
      resolve(null);
    }
  });
});

ipcMain.on('add-main-transaction', (event, transaction) => {

  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO transactions (date, item, account, withdraw, notes, last_modified)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    transaction.date,
    transaction.item,
    transaction.account || 0,
    transaction.withdraw || 0,
    transaction.notes || '',
    now,
    function (err) {
      if (err) {
        console.error('Error adding main transaction:', err);
      } else {
        console.log('Main transaction added successfully');
      }
    }
  );

  stmt.finalize();
});

// =================== حفظ تلقائي لمعاملات العملاء ===================
ipcMain.handle('update-customer-transaction', async (event, transaction) => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    console.log(`📥 [UPDATE-TRANSACTION] ID: ${transaction.id}, Item: ${transaction.item}, Qty: ${transaction.quantity}, Price: ${transaction.price}`);
    const stmt = db.prepare(`
      UPDATE customer_transactions
      SET item = ?, price = ?, quantity = ?, total = ?, notes = ?, date = ?, time = ?, type = ?, last_modified = ?
      WHERE id = ?
    `);

    stmt.run(
      transaction.item,
      transaction.price,
      transaction.quantity,
      transaction.total,
      transaction.notes,
      transaction.date,
      transaction.time || null,
      transaction.type,
      now,
      transaction.id,
      function (err) {
        if (err) {
          console.error('Error updating customer transaction:', err);
          reject({ success: false, error: err.message });
        } else {
          // إضافة إلى قائمة مزامنة السحابة
          syncManager.addToSyncQueue('customer_transactions', {
            ...transaction,
            last_modified: now
          }, 'update');
          resolve({ success: true });
        }
      }
    );

    stmt.finalize();
  });
});

ipcMain.on('load-data', (event, date) => {
  db.all(
    'SELECT * FROM transactions WHERE date = ? ORDER BY id ASC',
    [date],
    (err, rows) => {
      if (err) {
        console.error('Load error:', err);
        event.reply('load-data-response', []);
      } else {
        event.reply('load-data-response', rows);
      }
    }
  );
});

ipcMain.on('delete-all-data', (event) => {
  db.run('DELETE FROM transactions', [], (err) => {
    if (err) {
      console.error('Delete all error:', err.message);
      event.reply('delete-all-response', {
        success: false,
        error: err.message
      });
    } else {
      event.reply('delete-all-response', {
        success: true,
        message: 'تم حذف جميع البيانات بنجاح'
      });
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('all-data-deleted');
      });
    }
  });
});

ipcMain.on('search-data', (event, { item, notes, filter }) => {
  let query = `SELECT * FROM transactions WHERE 1=1`;
  const params = [];

  if (item) {
    query += ` AND item LIKE ?`;
    params.push(`%${item}%`);
  }

  if (notes) {
    query += ` AND notes LIKE ?`;
    params.push(`%${notes}%`);
  }

  const { year, month, day } = filter || {};

  if (year) {
    query += ` AND strftime('%Y', date) = ?`;
    params.push(year.toString());
  }
  if (month) {
    query += ` AND CAST(strftime('%m', date) AS INTEGER) = ?`;
    params.push(parseInt(month));
  }
  if (day) {
    query += ` AND CAST(strftime('%d', date) AS INTEGER) = ?`;
    params.push(parseInt(day));
  }

  query += ` ORDER BY date DESC, id ASC`;

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Search error:', err.message);
      event.reply('search-results', []);
    } else {
      event.reply('search-results', rows);
    }
  });
});

ipcMain.handle('search-customer-transactions', async (event, { customerId, item, notes, filter }) => {
  return new Promise((resolve) => {
    let query = `SELECT * FROM customer_transactions WHERE customer_id = ? AND is_deleted = 0`;
    const params = [customerId];

    if (item) {
      query += ` AND item LIKE ?`;
      params.push(`%${item}%`);
    }

    if (notes) {
      query += ` AND notes LIKE ?`;
      params.push(`%${notes}%`);
    }

    const { year, month, day } = filter || {};

    if (year) {
      query += ` AND strftime('%Y', date) = ?`;
      params.push(year.toString());
    }
    if (month) {
      query += ` AND CAST(strftime('%m', date) AS INTEGER) = ?`;
      params.push(parseInt(month));
    }
    if (day) {
      query += ` AND CAST(strftime('%d', date) AS INTEGER) = ?`;
      params.push(parseInt(day));
    }

    query += ` ORDER BY date DESC, time DESC, id ASC`;

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('Search error:', err.message);
        resolve([]);
      } else {
        resolve(rows);
      }
    });
  });
});


// ========== معالجات أحداث نظام إدارة المنتجات ==========

// إحضار المنتجات
ipcMain.handle('get-products', async (event, filters = {}) => {
  return new Promise((resolve) => {
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

    db.all(query, params, (err, products) => {
      if (err) {
        console.error('Error getting products:', err);
        resolve({ products: [], priceStats: {} });
        return;
      }

      db.get('SELECT MIN(price) as minPrice, MAX(price) as maxPrice FROM products WHERE is_deleted = 0', (err, priceStats) => {
        if (err) {
          console.error('Error getting price stats:', err);
          resolve({ products, priceStats: {} });
        } else {
          resolve({ products, priceStats: priceStats || {} });
        }
      });
    });
  });
});

// إضافة منتج
ipcMain.handle('add-product', async (event, product) => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO products (serial_number, name, price, wholesale_price, purchase_price, quantity, min_quantity, category, last_modified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      product.serial_number,
      product.name,
      product.price,
      product.wholesale_price,
      product.purchase_price || 0,
      product.quantity,
      product.min_quantity,
      product.category,
      now,
      function (err) {
        if (err) {
          console.error('Error adding product:', err);
          reject({ success: false, error: err.message });
        } else {
          // إضافة إلى قائمة مزامنة السحابة
          syncManager.addToSyncQueue('products', {
            ...product,
            id: this.lastID,
            last_modified: now
          }, 'insert');
          resolve({ success: true, id: this.lastID });
        }
      }
    );

    stmt.finalize();
  });
});

// تحديث منتج
ipcMain.handle('update-product', async (event, product) => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE products 
      SET name = ?, price = ?, wholesale_price = ?, purchase_price = ?, quantity = ?, min_quantity = ?, category = ?, last_modified = ?
      WHERE id = ?
    `);

    stmt.run(
      product.name,
      product.price,
      product.wholesale_price,
      product.purchase_price || 0,
      product.quantity,
      product.min_quantity,
      product.category,
      now,
      product.id,
      function (err) {
        if (err) {
          console.error('Error updating product:', err);
          reject({ success: false, error: err.message });
        } else {
          // إضافة إلى قائمة مزامنة السحابة
          syncManager.addToSyncQueue('products', {
            ...product,
            last_modified: now
          }, 'update');
          resolve({ success: true });
        }
      }
    );

    stmt.finalize();
  });
});

// إحضار منتج واحد للتعديل
ipcMain.handle('get-product-by-id', async (event, id) => {
  return new Promise((resolve) => {
    db.get('SELECT * FROM products WHERE id = ? AND is_deleted = 0', [id], (err, row) => {
      if (err) {
        console.error('Error fetching product by id:', err);
        resolve(null);
      } else {
        resolve(row);
      }
    });
  });
});

// إحضار منتج بالرقم التسلسلي (للـ QR Scanner)
ipcMain.handle('get-product-by-serial', async (event, serialNumber) => {
  return new Promise((resolve) => {
    db.get('SELECT * FROM products WHERE serial_number = ? AND is_deleted = 0', [serialNumber], (err, row) => {
      if (err) {
        console.error('Error fetching product by serial:', err);
        resolve(null);
      } else {
        resolve(row);
      }
    });
  });
});

// حذف منتج (حذف ناعم)
ipcMain.handle('secure-delete-product', async (event, { id, password }) => {
  return new Promise((resolve) => {
    // 1. التحقق من الباسورد (أدمن)
    db.get("SELECT password FROM users WHERE username = 'admin'", (err, row) => {
      if (err || !row || row.password !== password) {
        resolve({ success: false, error: 'كلمة مرور الأدمن غير صحيحة' });
      } else {
        const now = new Date().toISOString();
        db.run('UPDATE products SET is_deleted = 1, last_modified = ? WHERE id = ?', [now, id], function (err) {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            // مزامنة الحذف
            db.get('SELECT * FROM products WHERE id = ?', [id], (err, row) => {
              if (row) syncManager.addToSyncQueue('products', row, 'delete');
            });
            resolve({ success: true });
          }
        });
      }
    });
  });
});

ipcMain.handle('secure-delete-all-main-data', async (event, password) => {
  return new Promise((resolve) => {
    db.get("SELECT password FROM users WHERE username = 'admin'", (err, row) => {
      if (err || !row || row.password !== password) {
        resolve({ success: false, error: 'كلمة مرور الأدمن غير صحيحة' });
      } else {
        db.run("DELETE FROM transactions", (err) => {
          if (err) resolve({ success: false, error: err.message });
          else {
            // مسح طابور المزامنة الخاص بالصفحة الرئيسية أيضاً
            db.run("DELETE FROM offline_sync_queue WHERE table_name = 'transactions'", () => {
              resolve({ success: true });
            });
          }
        });
      }
    });
  });
});

// المنتجات قليلة المخزون
ipcMain.handle('get-low-stock-products', async () => {
  return new Promise((resolve) => {
    db.all(`
      SELECT * FROM products 
      WHERE quantity <= min_quantity AND is_deleted = 0
      ORDER BY quantity ASC
    `, (err, products) => {
      if (err) {
        console.error('Error getting low stock products:', err);
        resolve([]);
      } else {
        resolve(products);
      }
    });
  });
});

ipcMain.handle('decrease-product-quantity', async (event, { id, amount }) => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      `UPDATE products 
       SET quantity = quantity - ?, last_modified = ?
       WHERE id = ? AND quantity > 0`,
      [amount, now, id],
      function (err) {
        if (err) {
          console.error('Error decreasing quantity:', err);
          reject({ success: false, error: err.message });
        } else {
          // إضافة إلى قائمة مزامنة السحابة
          db.get('SELECT * FROM products WHERE id = ?', [id], (err, row) => {
            if (!err && row) {
              syncManager.addToSyncQueue('products', row, 'update');
            }
          });
          resolve({ success: true });
        }
      }
    );
  });
});

ipcMain.handle('increase-product-quantity', async (event, { id, amount }) => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      `UPDATE products 
       SET quantity = quantity + ?, last_modified = ?
       WHERE id = ?`,
      [amount, now, id],
      function (err) {
        if (err) {
          console.error('Error increasing quantity:', err);
          reject({ success: false, error: err.message });
        } else {
          // إضافة إلى قائمة مزامنة السحابة
          db.get('SELECT * FROM products WHERE id = ?', [id], (err, row) => {
            if (!err && row) {
              syncManager.addToSyncQueue('products', row, 'update');
            }
          });
          resolve({ success: true });
        }
      }
    );
  });
});

// ========== معالجات أحداث نظام إدارة العملاء ==========
ipcMain.on('get-customers', (event, filters = {}) => {
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

  db.all(query, params, (err, customers) => {
    if (err) {
      console.error('Error getting customers:', err);
      event.reply('customers-data', { customers: [] });
    } else {
      event.reply('customers-data', { customers });
    }
  });
});

// معالج إضافة العميل
ipcMain.on('add-customer', (event, customer) => {
  const now = new Date().toISOString();
  let query, params;

  if ('phone' in customer) {
    query = `INSERT INTO customers (name, amount_due, date, notes, phone, last_modified) VALUES (?, ?, ?, ?, ?, ?)`;
    params = [customer.name, customer.amount_due || 0, customer.date, customer.notes || '', customer.phone || '', now];
  } else {
    query = `INSERT INTO customers (name, amount_due, date, notes, last_modified) VALUES (?, ?, ?, ?, ?)`;
    params = [customer.name, customer.amount_due || 0, customer.date, customer.notes || '', now];
  }

  db.run(query, params, function (err) {
    if (err) {
      console.error('Error adding customer:', err);
      event.reply('customer-added', { success: false, error: err.message });
    } else {
      // إضافة إلى قائمة مزامنة السحابة
      syncManager.addToSyncQueue('customers', {
        ...customer,
        id: this.lastID,
        last_modified: now
      }, 'insert');
      createCustomerUser(this.lastID, customer.name);

      event.reply('customer-added', { success: true, id: this.lastID });
    }
  });
});

// ========== ميزة دمج عميل من نسخة احتياطية ==========

ipcMain.handle('get-customers-from-backup', async (event, filePath) => {
  return new Promise((resolve) => {
    const backupDb = new sqlite3.Database(filePath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        console.error('Error opening backup DB:', err);
        resolve({ success: false, error: 'فشل فتح ملف النسخة الاحتياطية' });
        return;
      }

      backupDb.all('SELECT id, name, phone, date FROM customers WHERE is_deleted = 0', (err, rows) => {
        if (err) {
          console.error('Error reading customers from backup:', err);
          resolve({ success: false, error: 'فشل قراءة العملاء من النسخة الاحتياطية' });
        } else {
          resolve({ success: true, customers: rows });
        }
        backupDb.close();
      });
    });
  });
});

ipcMain.handle('select-backup-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'اختر ملف النسخة الاحتياطية',
    filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    properties: ['openFile']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('execute-customer-merge', async (event, { backupPath, sourceCustomerId }) => {
  return new Promise((resolve) => {
    const backupDb = new sqlite3.Database(backupPath, sqlite3.OPEN_READONLY, async (err) => {
      if (err) return resolve({ success: false, error: 'فشل فتح النسخة الاحتياطية' });

      try {
        // 1. جلب بيانات العميل من النسخة
        const customer = await new Promise(r => backupDb.get('SELECT * FROM customers WHERE id = ?', [sourceCustomerId], (err, row) => r(row)));
        if (!customer) throw new Error('العميل غير موجود في النسخة الاحتياطية');

        // 2. التحقق إذا كان العميل موجوداً حالياً (بالاسم)
        let targetCustomerId;
        const existing = await new Promise(r => db.get('SELECT id FROM customers WHERE name = ?', [customer.name], (err, row) => r(row)));

        const now = new Date().toISOString();

        if (existing) {
          targetCustomerId = existing.id;

          // 🛑 تصفية الطابور من أي عمليات حذف قديمة لهذا العميل لمنع حذفه مجدداً بعد الاستعادة
          await new Promise(r => {
            db.run(`DELETE FROM offline_sync_queue 
                    WHERE table_name = 'customers' 
                    AND (record_data LIKE ? OR record_data LIKE ?)`,
              [`%\"id\":${targetCustomerId},%`, `%\"id\":${targetCustomerId}}%`],
              () => r());
          });

          // إعادة تفعيله محلياً
          await new Promise(r => db.run('UPDATE customers SET is_deleted = 0, last_modified = ? WHERE id = ?', [now, targetCustomerId], () => r()));

          // تأكد من تحديث السحابة فوراً
          const updatedCustomer = await new Promise(r => db.get('SELECT * FROM customers WHERE id = ?', [targetCustomerId], (err, row) => r(row)));
          if (updatedCustomer) {
            await syncManager.addToSyncQueue('customers', updatedCustomer, 'insert');
          }
        } else {
          // إضافة عميل جديد
          const result = await new Promise(r => {
            db.run(`INSERT INTO customers (name, phone, amount_due, date, notes, last_modified) VALUES (?, ?, ?, ?, ?, ?)`,
              [customer.name, customer.phone, customer.amount_due, customer.date, customer.notes, now],
              function (err) { r(this ? { id: this.lastID } : { error: err }); }
            );
          });
          if (result.error) throw result.error;
          targetCustomerId = result.id;

          // إضافة للسحابة
          const newCustomer = await new Promise(r => db.get('SELECT * FROM customers WHERE id = ?', [targetCustomerId], (err, row) => r(row)));
          if (newCustomer) {
            await syncManager.addToSyncQueue('customers', newCustomer, 'insert');
          }
        }

        // 3. جلب ودمج المعاملات (customer_transactions)
        const transactions = await new Promise(r => backupDb.all('SELECT * FROM customer_transactions WHERE customer_id = ?', [sourceCustomerId], (err, rows) => r(rows || [])));
        for (const trx of transactions) {
          // جلب المعاملة إذا كانت موجودة محلياً أو إضافتها
          let existingTrx = await new Promise(r => db.get('SELECT id FROM customer_transactions WHERE customer_id = ? AND date = ? AND item = ? AND total = ?', [targetCustomerId, trx.date, trx.item, trx.total], (err, row) => r(row)));

          let localTrxId;
          if (!existingTrx) {
            const res = await new Promise(r => {
              db.run(`INSERT INTO customer_transactions (customer_id, date, time, item, price, quantity, total, type, product_id, notes, last_modified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [targetCustomerId, trx.date, trx.time || null, trx.item, trx.price, trx.quantity, trx.total, trx.type, trx.product_id, trx.notes, now],
                function (err) { r(this ? { id: this.lastID } : { error: err }); }
              );
            });
            localTrxId = res.id;
          } else {
            localTrxId = existingTrx.id;
          }

          if (localTrxId) {
            // إجبار المزامنة للسحابة لضمان وجود المعاملة هناك
            await syncManager.addToSyncQueue('customer_transactions', {
              ...trx,
              id: localTrxId,
              customer_id: targetCustomerId,
              last_modified: now
            }, 'insert');
          }
        }

        // 4. جلب ودمج المدفوعات (payments)
        const payments = await new Promise(r => backupDb.all('SELECT * FROM payments WHERE customer_id = ?', [sourceCustomerId], (err, rows) => r(rows || [])));
        for (const pay of payments) {
          let existingPay = await new Promise(r => db.get('SELECT id FROM payments WHERE customer_id = ? AND date = ? AND amount = ?', [targetCustomerId, pay.date, pay.amount], (err, row) => r(row)));

          let localPayId;
          if (!existingPay) {
            const res = await new Promise(r => {
              db.run(`INSERT INTO payments (customer_id, amount, payment_method, date, time, notes, last_modified) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [targetCustomerId, pay.amount, pay.payment_method, pay.date, pay.time, pay.notes, now],
                function (err) { r(this ? { id: this.lastID } : { error: err }); }
              );
            });
            localPayId = res.id;
          } else {
            localPayId = existingPay.id;
          }

          if (localPayId) {
            // إجبار المزامنة للسحابة لضمان وجود الدفعة هناك
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



// بعد إضافة العميل بنجاح
const createCustomerUser = async (customerId, customerName) => {
  const email = `${customerId}@customer.com`;

  // حاول معرفة إذا المستخدم موجود
  const { data: existingUsers, error: fetchError } = await supabase.auth.admin.listUsers();
  if (fetchError) {
    console.error('Error fetching users:', fetchError);
    return;
  }

  const alreadyExists = existingUsers.users.some(u => u.email === email);
  if (alreadyExists) {
    console.log('User already exists:', email);
    return;
  }

  // إنشاء المستخدم الجديد
  const { data, error } = await supabase.auth.admin.createUser({
    email: email,
    password: 'yourStrongDefaultPassword123', // لازم string
    email_confirm: true,
    user_metadata: {
      name: customerName,
      role: 'customer'
    }
  });

  if (error) {
    console.error('Error creating customer user:', error);
  } else if (data && data.user) {
    console.log('Customer user created successfully:', data.user.id);
  }
};




ipcMain.on('update-customer', (event, customer) => {
  const now = new Date().toISOString();
  db.run(
    `UPDATE customers 
     SET name = ?, phone = ?, notes = ?, last_modified = ?
     WHERE id = ?`,
    [
      customer.name,
      customer.phone || '',
      customer.notes || '',
      now,
      customer.id
    ],
    function (err) {
      if (err) {
        console.error('Error updating customer:', err);
        event.reply('customer-updated', { success: false, error: err.message });
      } else {
        // إضافة إلى قائمة مزامنة السحابة
        syncManager.addToSyncQueue('customers', {
          ...customer,
          last_modified: now
        }, 'update');
        event.reply('customer-updated', { success: true });
      }
    }
  );
});



ipcMain.handle('secure-delete-customer', async (event, { id, password }) => {
  return new Promise((resolve) => {
    // 1. التحقق من الباسورد (أدمن)
    db.get("SELECT password FROM users WHERE username = 'admin'", (err, row) => {
      if (err || !row || row.password !== password) {
        resolve({ success: false, error: 'كلمة مرور الأدمن غير صحيحة' });
      } else {
        // 2. إذا صحيحة، احذف العميل
        const now = new Date().toISOString();
        db.run('UPDATE customers SET is_deleted = 1, last_modified = ? WHERE id = ?', [now, id], function (err) {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            // إضافة للمزامنة
            db.get('SELECT * FROM customers WHERE id = ?', [id], (err, row) => {
              if (row) syncManager.addToSyncQueue('customers', row, 'delete');
            });
            resolve({ success: true });
          }
        });
      }
    });
  });
});

ipcMain.handle('force-sync-customer', async (event, customerId) => {
  return new Promise(async (resolve) => {
    try {
      const now = new Date().toISOString();

      // 1. جلب بيانات العميل
      const customer = await new Promise(r => db.get('SELECT * FROM customers WHERE id = ?', [customerId], (err, row) => r(row)));
      if (!customer) throw new Error('العميل غير موجود');

      // 2. إرسال العميل للطابور (Upsert)
      await syncManager.addToSyncQueue('customers', { ...customer, last_modified: now }, 'insert');

      // 3. جلب وإرسال كافة المعاملات
      const transactions = await new Promise(r => db.all('SELECT * FROM customer_transactions WHERE customer_id = ? AND is_deleted = 0', [customerId], (err, rows) => r(rows || [])));
      for (const trx of transactions) {
        await syncManager.addToSyncQueue('customer_transactions', { ...trx, last_modified: now }, 'insert');
      }

      // 4. جلب وإرسال كافة المدفوعات
      const payments = await new Promise(r => db.all('SELECT * FROM payments WHERE customer_id = ? AND is_deleted = 0', [customerId], (err, rows) => r(rows || [])));
      for (const pay of payments) {
        await syncManager.addToSyncQueue('payments', { ...pay, last_modified: now }, 'insert');
      }

      console.log(`🚀 Forced sync started for customer ${customerId}: ${transactions.length} transactions, ${payments.length} payments`);

      // تشغيل المزامنة فوراً إذا كان الإنترنت متاحاً
      if (syncManager.isOnline) {
        syncManager.processSyncQueue();
      }

      resolve({ success: true });
    } catch (error) {
      console.error('Force Sync Error:', error);
      resolve({ success: false, error: error.message });
    }
  });
});

ipcMain.handle('pull-from-supabase', async () => {
  if (!syncManager) {
    return { success: false, error: 'مدير المزامنة غير جاهز' };
  }
  return syncManager.pullFromSupabase();
});

ipcMain.handle('force-sync-all-customers', async (event) => {
  return new Promise(async (resolve) => {
    try {
      const now = new Date().toISOString();

      // 1. جلب كافة العملاء
      const customers = await new Promise(r => db.all('SELECT * FROM customers WHERE is_deleted = 0', (err, rows) => r(rows || [])));

      let totalItems = customers.length;

      for (const customer of customers) {
        await syncManager.addToSyncQueue('customers', { ...customer, last_modified: now }, 'insert');

        // جلب معاملات هذا العميل
        const transactions = await new Promise(r => db.all('SELECT * FROM customer_transactions WHERE customer_id = ? AND is_deleted = 0', [customer.id], (err, rows) => r(rows || [])));
        for (const trx of transactions) {
          await syncManager.addToSyncQueue('customer_transactions', { ...trx, last_modified: now }, 'insert');
        }

        // جلب مدفوعات هذا العميل
        const payments = await new Promise(r => db.all('SELECT * FROM payments WHERE customer_id = ? AND is_deleted = 0', [customer.id], (err, rows) => r(rows || [])));
        for (const pay of payments) {
          await syncManager.addToSyncQueue('payments', { ...pay, last_modified: now }, 'insert');
        }
      }

      console.log(`🚀 Forced sync started for ALL customers`);

      if (syncManager.isOnline) {
        syncManager.processSyncQueue();
      }

      resolve({ success: true });
    } catch (error) {
      console.error('Force Sync All Error:', error);
      resolve({ success: false, error: error.message });
    }
  });
});

// البحث عن منتجات (بالسيريال أو الاسم)
ipcMain.handle('search-products', async (event, searchTerm) => {
  return new Promise((resolve) => {
    db.all(
      `SELECT * FROM products 
       WHERE (serial_number LIKE ? OR name LIKE ?) AND is_deleted = 0
       ORDER BY name LIMIT 10`,
      [`%${searchTerm}%`, `%${searchTerm}%`],
      (err, rows) => {
        if (err) {
          console.error('Error searching products:', err);
          resolve([]);
        } else {
          resolve(rows || []);
        }
      }
    );
  });
});

ipcMain.on('update-product-quantity', (event, { productId, change }) => {
  const now = new Date().toISOString();
  db.run(
    `UPDATE products SET quantity = quantity + ?, last_modified = ? WHERE id = ?`,
    [change, now, productId],
    function (err) {
      if (err) {
        event.reply('update-product-quantity-response', { success: false, error: err.message });
      } else {
        // إضافة إلى قائمة مزامنة السحابة
        db.get('SELECT * FROM products WHERE id = ?', [productId], (err, row) => {
          if (!err && row) {
            syncManager.addToSyncQueue('products', row, 'update');
          }
        });
        event.reply('update-product-quantity-response', { success: true });
      }
    }
  );
});

// ========= المدفوعات =========
ipcMain.handle('add-payment', async (event, payment) => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO payments (customer_id, amount, payment_method, date, time, notes, last_modified)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      payment.customer_id,
      payment.amount,
      payment.payment_method || 'cash',
      payment.date,
      payment.time || null,
      payment.notes,
      now,
      function (err) {
        if (err) {
          console.error('Error adding payment:', err);
          resolve({ success: false, error: err.message });
        } else {
          // إضافة إلى قائمة مزامنة السحابة
          syncManager.addToSyncQueue('payments', {
            ...payment,
            id: this.lastID,
            last_modified: now
          }, 'insert');
          resolve({ success: true, id: this.lastID, payment });
        }
      }
    );

    stmt.finalize();
  });
});

// الحصول على مدفوعات العميل
ipcMain.handle('get-customer-payments', (event, customerId) => {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM payments WHERE customer_id = ? AND is_deleted = 0 ORDER BY date DESC, time DESC, id DESC',
      [customerId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
});

// الحصول على دفعة بواسطة ID
ipcMain.handle('get-payment-by-id', async (event, paymentId) => {
  return new Promise((resolve) => {
    db.get('SELECT * FROM payments WHERE id = ? AND is_deleted = 0', [paymentId], (err, row) => {
      if (err) {
        console.error('Error getting payment:', err);
        resolve(null);
      } else {
        resolve(row);
      }
    });
  });
});

// تحديث دفعة
ipcMain.handle('update-payment', async (event, payment) => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      `UPDATE payments SET amount = ?, payment_method = ?, time = ?, notes = ?, last_modified = ? WHERE id = ?`,
      [payment.amount, payment.payment_method, payment.time || null, payment.notes, now, payment.id],
      function (err) {
        if (err) {
          console.error('Error updating payment:', err);
          reject({ success: false, error: err.message });
        } else {
          // إضافة إلى قائمة مزامنة السحابة
          syncManager.addToSyncQueue('payments', {
            ...payment,
            last_modified: now
          }, 'update');
          resolve({ success: true });
        }
      }
    );
  });
});

// حذف دفعة (حذف ناعم)
ipcMain.handle('delete-payment', async (event, paymentId) => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      'UPDATE payments SET is_deleted = 1, last_modified = ? WHERE id = ?',
      [now, paymentId],
      function (err) {
        if (err) {
          console.error('Error deleting payment:', err);
          reject({ success: false, error: err.message });
        } else {
          // إضافة إلى قائمة مزامنة السحابة
          db.get('SELECT * FROM payments WHERE id = ?', [paymentId], (err, row) => {
            if (!err && row) {
              syncManager.addToSyncQueue('payments', row, 'delete');
            }
          });
          resolve({ success: true });
        }
      }
    );
  });
});

// الحصول على مدفوعات العميل حسب الشهر
ipcMain.handle('get-customer-payments-by-month', async (event, { customerId, month, year }) => {
  return new Promise((resolve) => {
    const monthStr = String(month).padStart(2, '0');
    const yearStr = String(year);

    db.all(
      `SELECT * FROM payments 
       WHERE customer_id = ? AND is_deleted = 0
       AND strftime('%m', date) = ? 
       AND strftime('%Y', date) = ?
       ORDER BY date DESC, time DESC, id DESC`,
      [customerId, monthStr, yearStr],
      (err, rows) => {
        if (err) {
          console.error('Error getting payments by month:', err);
          resolve([]);
        } else {
          resolve(rows || []);
        }
      }
    );
  });
});


// ========== معالجات أحداث نظام الحسابات الجارية ==========
ipcMain.on('get-customer-account', async (event, customerId) => {
  // الحصول على معلومات العميل
  db.get('SELECT * FROM customers WHERE id = ? AND is_deleted = 0', [customerId], async (err, customer) => {
    if (err) {
      console.error('Error getting customer:', err);
      event.reply('customer-account-data', { customer: null, sales: [], payments: [] });
      return;
    }

    // احسب الرصيد الكلي للعميل
    const totalBalance = await new Promise((resolve) => {
      db.get(
        `SELECT 
          (SELECT IFNULL(SUM(total),0) FROM customer_transactions WHERE customer_id = ? AND is_deleted = 0) AS total_sales,
          (SELECT IFNULL(SUM(amount),0) FROM payments WHERE customer_id = ? AND is_deleted = 0) AS total_paid
        `,
        [customerId, customerId],
        (err, row) => {
          if (err) resolve(0);
          else resolve((Number(row?.total_sales) || 0) - (Number(row?.total_paid) || 0));
        }
      );
    });

    // الحصول على مبيعات العميل
    db.all('SELECT * FROM sales WHERE customer_id = ? AND is_deleted = 0 ORDER BY date DESC', [customerId], (err, sales) => {
      if (err) {
        console.error('Error getting customer sales:', err);
        event.reply('customer-account-data', { customer, sales: [], payments: [] });
        return;
      }

      // الحصول على مدفوعات العميل
      db.all('SELECT * FROM payments WHERE customer_id = ? AND is_deleted = 0 ORDER BY date DESC', [customerId], (err, payments) => {
        if (err) {
          console.error('Error getting customer payments:', err);
          event.reply('customer-account-data', { customer, sales, payments });
        } else {
          // أضف الرصيد الكلي للعميل في الكائن المرسل
          event.reply('customer-account-data', { customer: { ...customer, total_balance: totalBalance }, sales, payments });
        }
      });
    });
  });
});

ipcMain.on('add-sale', (event, saleData) => {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO sales (customer_id, product_id, product_name, price, quantity, total, date, last_modified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    saleData.customer_id,
    saleData.product_id,
    saleData.product_name,
    saleData.price,
    saleData.quantity,
    saleData.total,
    saleData.date,
    now,
    function (err) {
      if (err) {
        console.error('Error adding sale:', err);
        event.reply('sale-added', { success: false, error: err.message });
      } else {
        // تحديث كمية المنتج
        db.run('UPDATE products SET quantity = quantity - ?, last_modified = ? WHERE id = ?',
          [saleData.quantity, now, saleData.product_id],
          (err) => {
            if (err) {
              console.error('Error updating product quantity:', err);
            }
          }
        );

        // تحديث مديونية العميل
        db.run('UPDATE customers SET amount_due = amount_due + ?, last_modified = ? WHERE id = ?',
          [saleData.total, now, saleData.customer_id],
          (err) => {
            if (err) {
              console.error('Error updating customer amount:', err);
            }
          }
        );

        // إضافة إلى قائمة مزامنة السحابة
        syncManager.addToSyncQueue('sales', {
          ...saleData,
          id: this.lastID,
          last_modified: now
        }, 'insert');

        event.reply('sale-added', { success: true, id: this.lastID });
      }
    }
  );

  stmt.finalize();
});

ipcMain.on('add-payment', (event, paymentData) => {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO payments (customer_id, amount, payment_method, date, time, notes, last_modified)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    paymentData.customer_id,
    paymentData.amount,
    paymentData.payment_method || 'cash',
    paymentData.date,
    paymentData.time || null,
    paymentData.notes,
    now,
    function (err) {
      if (err) {
        console.error('Error adding payment:', err);
        event.reply('payment-added', { success: false, error: err.message });
      } else {
        // تحديث مديونية العميل
        db.run('UPDATE customers SET amount_due = amount_due - ?, last_modified = ? WHERE id = ?',
          [paymentData.amount, now, paymentData.customer_id],
          (err) => {
            if (err) {
              console.error('Error updating customer amount:', err);
            }
          }
        );

        // إضافة إلى قائمة مزامنة السحابة
        syncManager.addToSyncQueue('payments', {
          ...paymentData,
          id: this.lastID,
          last_modified: now
        }, 'insert');

        event.reply('payment-added', { success: true, id: this.lastID });
      }
    }
  );

  stmt.finalize();
});

// الحصول على معاملات العميل بالشهر
ipcMain.on('get-customer-transactions-by-month', (event, { customerId, month, year }) => {
  const sql = `
    SELECT * FROM customer_transactions
    WHERE customer_id = ? AND is_deleted = 0
    AND strftime('%m', date) = ? 
    AND strftime('%Y', date) = ?
    ORDER BY date ASC, id ASC
  `;

  const monthStr = String(month).padStart(2, '0');
  const yearStr = String(year);

  db.all(sql, [customerId, monthStr, yearStr], (err, rows) => {
    if (err) {
      console.error("Error fetching transactions by month:", err);
      event.reply('customer-transactions-month-data', { transactions: [] });
    } else {
      event.reply('customer-transactions-month-data', { transactions: rows });
    }
  });
});

// الحصول على معاملات العميل بالسنة
ipcMain.on('get-customer-transactions-by-year', (event, { customerId, year }) => {
  const sql = `
    SELECT * FROM customer_transactions
    WHERE customer_id = ? AND is_deleted = 0
    AND strftime('%Y', date) = ?
    ORDER BY date ASC, id ASC
  `;

  const yearStr = String(year);

  db.all(sql, [customerId, yearStr], (err, rows) => {
    if (err) {
      console.error("Error fetching transactions by year:", err);
      event.reply('customer-transactions-month-data', { transactions: [] });
    } else {
      event.reply('customer-transactions-month-data', { transactions: rows });
    }
  });
});

// الحصول على معاملات العميل اليوم
ipcMain.on('get-customer-transactions-today', (event, { customerId }) => {
  const today = new Date().toISOString().split('T')[0];
  const sql = `
    SELECT * FROM customer_transactions
    WHERE customer_id = ? AND date = ? AND is_deleted = 0
    ORDER BY date ASC, id ASC
  `;

  db.all(sql, [customerId, today], (err, rows) => {
    if (err) {
      console.error("Error fetching transactions today:", err);
      event.reply('customer-transactions-month-data', { transactions: [] });
    } else {
      event.reply('customer-transactions-month-data', {
        transactions: rows,
        isToday: true
      });
    }
  });
});

// الحصول على آخر يومين عمل للعميل (لتحسين الأداء)
ipcMain.on('get-customer-transactions-recent', (event, { customerId }) => {
  // 1. البحث عن آخر تاريخين فريدين للعميل
  const findDatesSql = `
    SELECT DISTINCT date FROM customer_transactions 
    WHERE customer_id = ? AND is_deleted = 0 
    ORDER BY date DESC LIMIT 2
  `;

  db.all(findDatesSql, [customerId], (err, dateRows) => {
    if (err) {
      console.error("Error finding recent dates:", err);
      event.reply('customer-transactions-month-data', { transactions: [] });
      return;
    }

    if (!dateRows || dateRows.length === 0) {
      event.reply('customer-transactions-month-data', { transactions: [] });
      return;
    }

    // 2. جلب كافة المعاملات لهذا التاريخين
    const dates = dateRows.map(r => r.date);
    const placeholders = dates.map(() => '?').join(',');
    const sql = `
      SELECT * FROM customer_transactions
      WHERE customer_id = ? AND is_deleted = 0
      AND date IN (${placeholders})
      ORDER BY date ASC, id ASC
    `;

    db.all(sql, [customerId, ...dates], (err, rows) => {
      if (err) {
        console.error("Error fetching recent transactions:", err);
        event.reply('customer-transactions-month-data', { transactions: [] });
      } else {
        // نستخدم نفس قناة الرد للتوفير في الكود بالفرونت إند
        event.reply('customer-transactions-month-data', {
          transactions: rows,
          isRecent: true,
          dates: dates
        });
      }
    });
  });
});

// الحصول على معاملات العميل
ipcMain.on('get-customer-transactions', (event, { customerId, date }) => {
  const sql = `
    SELECT * FROM customer_transactions
    WHERE customer_id = ? AND date = ? AND is_deleted = 0
    ORDER BY id ASC
  `;
  db.all(sql, [customerId, date], (err, rows) => {
    if (err) {
      console.error("Error fetching transactions:", err);
      event.reply('customer-transactions-data', { transactions: [] });
    } else {
      event.reply('customer-transactions-data', { transactions: rows });
    }
  });
});

// إضافة معاملة للعميل
ipcMain.handle('add-customer-transaction', async (event, transaction) => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    console.log(`📥 [ADD-TRANSACTION] Item: ${transaction.item}, Qty: ${transaction.quantity}, Price: ${transaction.price}`);
    const stmt = db.prepare(`
      INSERT INTO customer_transactions (customer_id, date, time, item, price, quantity, total, type, product_id, notes, last_modified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
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
      now,
      function (err) {
        if (err) {
          console.error('Error adding customer transaction:', err);
          reject({ success: false, error: err.message });
        } else {
          // إضافة إلى قائمة مزامنة السحابة
          syncManager.addToSyncQueue('customer_transactions', {
            ...transaction,
            id: this.lastID,
            last_modified: now
          }, 'insert');
          resolve({ success: true, id: this.lastID });
        }
      }
    );

    stmt.finalize();
  });
});

// حذف معاملة العميل (حذف ناعم)
ipcMain.on('delete-customer-transaction', (event, transactionId) => {
  const now = new Date().toISOString();
  db.run(
    'UPDATE customer_transactions SET is_deleted = 1, last_modified = ? WHERE id = ?',
    [now, transactionId],
    function (err) {
      if (err) {
        console.error('Error deleting customer transaction:', err);
        event.reply('customer-transaction-deleted', { success: false, error: err.message });
      } else {
        // إضافة إلى قائمة مزامنة السحابة
        db.get('SELECT * FROM customer_transactions WHERE id = ?', [transactionId], (err, row) => {
          if (!err && row) {
            syncManager.addToSyncQueue('customer_transactions', row, 'delete');
          }
        });
        event.reply('customer-transaction-deleted', { success: true });
      }
    }
  );
});

// تحديث رصيد العميل
ipcMain.on('update-customer-balance', (event, { id, amount_due }) => {
  const now = new Date().toISOString();
  db.run(
    'UPDATE customers SET amount_due = ?, last_modified = ? WHERE id = ?',
    [amount_due, now, id],
    function (err) {
      if (err) {
        console.error('Error updating customer balance:', err);
      } else {
        // إضافة إلى قائمة مزامنة السحابة
        db.get('SELECT * FROM customers WHERE id = ?', [id], (err, row) => {
          if (!err && row) {
            syncManager.addToSyncQueue('customers', row, 'update');
          }
        });
      }
    }
  );
});

// إحضار رصيد العميل الحالي (amount_due)
ipcMain.handle('get-customer-previous-balance', async (event, customerId) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT amount_due FROM customers WHERE id = ? AND is_deleted = 0`,
      [customerId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.amount_due : 0);
      }
    );
  });
});

// إحضار مجموع المدفوعات لعميل في يوم محدد
ipcMain.handle('get-customer-paid-today', async (event, { customerId, date }) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT SUM(amount) as totalPaid 
       FROM payments 
       WHERE customer_id = ? AND date = ? AND is_deleted = 0`,
      [customerId, date],
      (err, row) => {
        if (err) {
          console.error("Error fetching customer payments today:", err);
          resolve(0);
        } else {
          resolve(Number(row?.totalPaid) || 0);
        }
      }
    );
  });
});

// إحضار الرصيد الكلي للعميل (إجمالي المبيعات - إجمالي المدفوعات)
ipcMain.handle('get-customer-total-balance', async (event, customerId) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT 
        (SELECT IFNULL(SUM(total),0) FROM customer_transactions WHERE customer_id = ? AND is_deleted = 0) AS total_sales,
        (SELECT IFNULL(SUM(amount),0) FROM payments WHERE customer_id = ? AND is_deleted = 0) AS total_paid
      `,
      [customerId, customerId],
      (err, row) => {
        if (err) {
          console.error('Error calculating total balance:', err);
          resolve(0);
        } else {
          const total_sales = Number(row?.total_sales) || 0;
          const total_paid = Number(row?.total_paid) || 0;
          resolve(total_sales - total_paid);
        }
      }
    );
  });
});

// إلغاء آخر دفعة (حذف ناعم)
ipcMain.on('cancel-last-payment', (event, { customerId, amount }) => {
  const now = new Date().toISOString();
  db.get(
    'SELECT * FROM payments WHERE customer_id = ? AND amount = ? AND is_deleted = 0 ORDER BY id DESC LIMIT 1',
    [customerId, amount],
    (err, payment) => {
      if (err || !payment) {
        console.error('Error finding payment to cancel:', err);
        return;
      }

      db.run('UPDATE payments SET is_deleted = 1, last_modified = ? WHERE id = ?', [now, payment.id], (err) => {
        if (err) {
          console.error('Error canceling payment:', err);
        } else {
          console.log('Payment canceled successfully');
          // إضافة إلى قائمة مزامنة السحابة
          syncManager.addToSyncQueue('payments', payment, 'delete');
          // إشعار العميل بالإلغاء
          event.reply('payment-canceled', { success: true });
        }
      });
    }
  );
});

// ========== معالجات أحداث الصفحة الرئيسية ==========
ipcMain.on('search-products-main', (event, searchTerm) => {
  console.log("Search term received:", searchTerm);

  db.all(
    'SELECT id, serial_number, name, price, wholesale_price, quantity FROM products WHERE (name LIKE ? OR serial_number LIKE ?) AND is_deleted = 0',
    [`%${searchTerm}%`, `%${searchTerm}%`],
    (err, products) => {
      if (err) {
        console.error('Error searching products:', err);
        event.reply('search-products-results', []);
      } else {
        console.log("Products found:", products);
        event.reply('search-products-results', products);
      }
    }
  );
});

// إغلاق قاعدة البيانات عند إغلاق التطبيق
let isQuitting = false;
app.on('before-quit', async (event) => {
  if (isQuitting) return;

  event.preventDefault();
  isQuitting = true;

  console.log('Finalizing sync and closing database connection...');

  if (syncManager && syncManager.isProcessing) {
    let waitCount = 0;
    while (syncManager.isProcessing && waitCount < 10) {
      await new Promise(r => setTimeout(r, 500));
      waitCount++;
    }
  }

  if (db) {
    db.close((err) => {
      if (err) console.error('Error closing database:', err.message);
      else console.log('Database connection closed');
      app.exit();
    });
  } else {
    app.exit();
  }
});
