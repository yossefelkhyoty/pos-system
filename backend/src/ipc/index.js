// backend/src/ipc/index.js
const { ipcMain } = require('electron');
const registerAuthIpc = require('./authIpc');
const registerProductsIpc = require('./productsIpc');
const registerCustomersIpc = require('./customersIpc');
const registerTransactionsIpc = require('./transactionsIpc');
const registerDashboardIpc = require('./dashboardIpc');
const registerBackupIpc = require('./backupIpc');
const registerSyncIpc = require('./syncIpc');

function registerAllIpc({ db, syncManager, backupManager, getMainWindow, loadPageSilently }) {
  // قناة التنقل العامة
  ipcMain.on('load-page', (event, page) => {
    loadPageSilently(page);
  });

  // تسجيل كافة الوحدات
  registerAuthIpc({ db, loadPageSilently });
  registerProductsIpc({ db, syncManager, getMainWindow });
  registerCustomersIpc({ db, syncManager });
  registerTransactionsIpc({ db, syncManager });
  registerDashboardIpc({ db });
  registerBackupIpc({ db, syncManager, getMainWindow });
  registerSyncIpc({ db, syncManager });

  console.log('🔗 All IPC modules registered successfully');
}

module.exports = registerAllIpc;

