// backup.js
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

class BackupManager {
  constructor(db, supabase = null) {
    this.db = db;
    this.supabase = supabase;
    this.backupDir = path.join(app.getPath('userData'), 'backups');
    this.autoBackupTask = null;

    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
      console.log("Created backup directory:", this.backupDir);
    }
  }

  // عمل نسخة احتياطية
  performBackup() {
    return new Promise((resolve, reject) => {
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(this.backupDir, `backup-${timestamp}.db`);

        const src = this.db.filename || 'pos_system.db';
        fs.copyFile(src, backupFile, (err) => {
          if (err) {
            console.error("Error creating backup:", err);
            reject(err);
          } else {
            console.log("Backup created successfully:", backupFile);
            resolve(backupFile);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // استعادة نسخة احتياطية
  restoreBackup(filePath) {
    return new Promise((resolve, reject) => {
      try {
        const dest = this.db.filename || 'pos_system.db';
        fs.copyFile(filePath, dest, (err) => {
          if (err) {
            console.error("Error restoring backup:", err);
            reject(err);
          } else {
            console.log("Backup restored successfully:", filePath);
            resolve(true);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // بدء النسخ الاحتياطي التلقائي
  startAutoBackup() {
    if (this.autoBackupTask) {
      console.log("Auto backup already running");
      return;
    }

    // تشغيل كل يوم الساعة 12 منتصف الليل
    this.autoBackupTask = cron.schedule('0 0 * * *', async () => {
      try {
        console.log("🔄 Starting daily backup sequence...");
        const backupPath = await this.performBackup();
        console.log("✅ Local backup completed.");

        if (this.supabase) {
          await this.uploadToCloud(backupPath);
          await this.cleanupOldBackups(); // تنظيف النسخ القديمة
          console.log("☁️ Cloud backup and cleanup completed.");
        }

        this.cleanupLocalBackups(); // تنظيف المحليات أيضاً
      } catch (err) {
        console.error("❌ Daily backup failed:", err);
      }
    });

    console.log("Auto backup scheduled for daily at midnight");
  }

  // رفع النسخة الاحتياطية إلى السحابة
  async uploadToCloud(filePath) {
    if (!this.supabase) return;

    try {
      const fileName = path.basename(filePath);
      const fileBuffer = fs.readFileSync(filePath);

      const { data, error } = await this.supabase.storage
        .from('backups')
        .upload(fileName, fileBuffer, {
          contentType: 'application/x-sqlite3',
          upsert: true
        });

      if (error) {
        // إذا لم يكن هناك Bucket باسم backups، نحاول التوضيح
        if (error.message.includes('bucket not found')) {
          console.error("⚠️ Supabase Storage Bucket 'backups' not found. Please create it in Supabase dashboard.");
        } else {
          throw error;
        }
      } else {
        console.log("🚀 Backup uploaded to Supabase Storage successfully:", data.path);
      }
    } catch (err) {
      console.error("❌ Error uploading to cloud storage:", err.message);
    }
  }

  // تنظيف النسخ الاحتياطية القديمة من السحابة (أقدم من 15 يوم)
  async cleanupOldBackups() {
    if (!this.supabase) return;

    try {
      // 1. جلب قائمة الملفات
      const { data: files, error } = await this.supabase.storage
        .from('backups')
        .list('', {
          limit: 100,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (error) throw error;

      // 2. إذا زاد العدد عن 30، نحذف الزيادة
      if (files && files.length > 30) {
        const foldersToRemove = files.slice(30).map(f => f.name);

        const { error: deleteError } = await this.supabase.storage
          .from('backups')
          .remove(foldersToRemove);

        if (deleteError) {
          console.error("❌ Error deleting old cloud backups:", deleteError.message);
        } else {
          console.log(`🧹 Done cleaning up ${foldersToRemove.length} old cloud backups.`);
        }
      }
    } catch (err) {
      console.error("❌ Failed to cleanup old backups:", err.message);
    }
  }

  // تنظيف النسخ الاحتياطية المحلية
  cleanupLocalBackups() {
    try {
      const files = fs.readdirSync(this.backupDir)
        .filter(f => f.startsWith('backup-') && f.endsWith('.db'))
        .map(f => ({
          name: f,
          path: path.join(this.backupDir, f),
          time: fs.statSync(path.join(this.backupDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      if (files.length > 30) {
        const toDelete = files.slice(30);
        toDelete.forEach(f => {
          fs.unlinkSync(f.path);
        });
        console.log(`🧹 Local cleanup done: deleted ${toDelete.length} old files.`);
      }
    } catch (err) {
      console.error("❌ Error cleaning up local backups:", err);
    }
  }

  // إيقاف النسخ الاحتياطي التلقائي
  stopAutoBackup() {
    if (this.autoBackupTask) {
      this.autoBackupTask.stop();
      this.autoBackupTask = null;
      console.log("Auto backup stopped");
    }
  }
}

module.exports = BackupManager;
