// backend/src/services/backup.js
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { dbPath } = require('../config/env');

class BackupManager {
  constructor(db) {
    this.db = db;
    this.backupDir = path.join(app.getPath('userData'), 'backups');
    this.autoBackupTask = null;

    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
      console.log('📁 Created backup directory:', this.backupDir);
    }
  }

  // عمل نسخة احتياطية آمنة مع دعم WAL
  async performBackup() {
    try {
      // 1. تفريغ الـ WAL إلى الملف الرئيسي قبل النسخ
      if (this.db) {
        await this.db.run('PRAGMA wal_checkpoint(PASSIVE)');
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(this.backupDir, `backup-${timestamp}.db`);
      const src = dbPath;

      await fs.promises.copyFile(src, backupFile);
      console.log('✅ Backup created successfully:', backupFile);
      return backupFile;
    } catch (err) {
      console.error('❌ Error creating backup:', err);
      throw err;
    }
  }

  // استعادة نسخة احتياطية
  async restoreBackup(filePath) {
    try {
      const dest = dbPath;
      await fs.promises.copyFile(filePath, dest);
      console.log('✅ Backup restored successfully from:', filePath);
      return true;
    } catch (err) {
      console.error('❌ Error restoring backup:', err);
      throw err;
    }
  }

  // بدء النسخ الاحتياطي التلقائي (منتصف كل ليلة)
  startAutoBackup() {
    if (this.autoBackupTask) {
      console.log('Auto backup already scheduled');
      return;
    }

    this.autoBackupTask = cron.schedule('0 0 * * *', async () => {
      console.log('⏰ Running automatic daily backup...');
      try {
        await this.performBackup();
      } catch (err) {
        console.error('Failed auto backup:', err);
      }
    });

    console.log('⏰ Auto backup scheduled daily at midnight');
  }
}

module.exports = BackupManager;

