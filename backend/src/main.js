// backend/src/main.js
const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('path');

const config = require('./config/env');
const db = require('./database/db');
const { initializeSchema } = require('./database/schema');
const SyncManager = require('./services/sync');
const BackupManager = require('./services/backup');
const registerAllIpc = require('./ipc');

let mainWindow = null;
let syncManager = null;
let backupManager = null;
let isQuitting = false;

// دالة تحميل الصفحات
function loadPageSilently(page) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadFile(path.join(__dirname, '../../frontend/src', page));
  }
}

// بناء قائمة التطبيق
function buildApplicationMenu() {
  const menuTemplate = [
    {
      label: 'ملف',
      submenu: [
        {
          label: 'إنشاء نسخة احتياطية',
          click: async () => {
            try {
              const file = await backupManager.performBackup();
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'نسخة احتياطية',
                message: `تم إنشاء النسخة الاحتياطية بنجاح:\n${file}`
              });
            } catch (err) {
              dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'خطأ',
                message: `فشل إنشاء النسخة الاحتياطية: ${err.message}`
              });
            }
          }
        },
        {
          label: 'استعادة من نسخة احتياطية',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              title: 'استعادة نسخة احتياطية',
              filters: [{ name: 'SQLite Database', extensions: ['db'] }],
              properties: ['openFile']
            });
            if (!result.canceled && result.filePaths.length > 0) {
              try {
                await backupManager.restoreBackup(result.filePaths[0]);
                dialog.showMessageBox(mainWindow, {
                  type: 'info',
                  title: 'تم بنجاح',
                  message: 'تمت استعادة النسخة الاحتياطية بنجاح. سيتم إعادة تشغيل التطبيق.'
                });
                app.relaunch();
                app.exit();
              } catch (err) {
                dialog.showMessageBox(mainWindow, {
                  type: 'error',
                  title: 'خطأ',
                  message: `فشل استعادة النسخة: ${err.message}`
                });
              }
            }
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
        { role: 'forcereload', label: 'إعادة تحميل قسرية' },
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
            if (syncManager && syncManager.isOnline) {
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
            if (!syncManager || !syncManager.isOnline) {
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
              message: 'سيتم تحديث البيانات المحلية بالبيانات الموجودة على Supabase.\n\nهل تريد المتابعة؟',
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
                ? `تم تحديث البيانات المحلية بنجاح:\n${Object.entries(result.stats || {})
                    .map(([t, n]) => `- ${t}: ${n} سجل`)
                    .join('\n')}\n\nأعد تحميل الصفحة لرؤية البيانات.`
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
              message: syncManager?.isOnline ? 'متصل بالإنترنت - المزامنة نشطة' : 'غير متصل - العمل في وضع عدم الاتصال'
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
}

// إنشاء النافذة الرئيسية
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

  mainWindow.webContents.on('did-finish-load', () => {
    if (syncManager) {
      mainWindow.webContents.send('connection-status', { online: syncManager.isOnline });
    }
  });

  // قائمة الزر الأيمن (Context Menu) للنسخ واللصق
  mainWindow.webContents.on('context-menu', (event, params) => {
    const template = [];

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

    if (params.isEditable) {
      template.push({ type: 'separator' });
      template.push({ role: 'undo', label: 'تراجع' });
      template.push({ role: 'redo', label: 'إعادة' });
    }

    const contextMenu = Menu.buildFromTemplate(template);
    contextMenu.popup();
  });
}

// بدء تشغيل التطبيق
app.whenReady().then(async () => {
  try {
    // 1. الاتصال بقاعدة البيانات وتهيئة الجداول
    await db.connect();
    await initializeSchema(db);

    // 2. تشغيل خدمات المزامنة والنسخ الاحتياطي
    syncManager = new SyncManager(db);
    backupManager = new BackupManager(db);
    backupManager.startAutoBackup();

    // 3. بناء القوائم وتسجيل IPC Handlers
    buildApplicationMenu();
    registerAllIpc({
      db,
      syncManager,
      backupManager,
      getMainWindow: () => mainWindow,
      loadPageSilently
    });

    // 4. إنشاء النافذة
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (err) {
    console.error('Fatal initialization error:', err);
    dialog.showErrorBox('خطأ في تشغيل النظام', err.message);
  }
});

// إغلاق التطبيق بأمان
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  if (isQuitting) return;

  event.preventDefault();
  isQuitting = true;

  console.log('Finalizing sync and closing database connection...');

  if (syncManager && syncManager.isProcessing) {
    let waitCount = 0;
    while (syncManager.isProcessing && waitCount < 10) {
      await new Promise((r) => setTimeout(r, 500));
      waitCount++;
    }
  }

  if (db) {
    try {
      await db.close();
      console.log('Database connection closed cleanly');
    } catch (err) {
      console.error('Error closing database:', err.message);
    }
  }

  app.exit();
});
