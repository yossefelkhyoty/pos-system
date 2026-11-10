// backend/src/services/sync.js
const { BrowserWindow } = require('electron');
const { createClient } = require('@supabase/supabase-js');
const { supabaseUrl, supabaseKey, supabaseAdminEmail, supabaseAdminPassword } = require('../config/env');

class SyncManager {
  constructor(db) {
    this.db = db;
    this.supabase = null;
    this.isOnline = false;
    this.isProcessing = false;
    this.isPulling = false;
    this.authSession = null;

    this.initSupabase();
    this.startSyncInterval();
  }

  async initSupabase() {
    if (!supabaseUrl || !supabaseKey) {
      console.warn('⚠️ Supabase credentials missing! Set SUPABASE_URL & SUPABASE_KEY in .env');
      return;
    }

    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: true
      }
    });

    // إذا تم توفير إيميل وباسورد الأدمن، سجل الدخول لضمان تجاوز سياسة admin_only عند استخدام anon key
    if (supabaseAdminEmail && supabaseAdminPassword) {
      try {
        const { data, error } = await this.supabase.auth.signInWithPassword({
          email: supabaseAdminEmail,
          password: supabaseAdminPassword
        });
        if (error) {
          console.warn('⚠️ Desktop admin login failed:', error.message);
        } else {
          this.authSession = data.session;
          console.log('🔐 Desktop successfully authenticated with Supabase Admin account');
        }
      } catch (err) {
        console.warn('⚠️ Auth attempt error:', err.message);
      }
    }

    // فحص الاتصال الأولي
    await this.checkConnection();
    // فحص دوري كل 30 ثانية
    setInterval(() => this.checkConnection(), 30000);
  }

  async checkConnection() {
    if (!this.supabase) {
      this.isOnline = false;
      return;
    }

    try {
      // ✅ تم تصحيح الفحص إلى select('id') بدلاً من count التي كانت تسبب خطأ 400 وتفشل الاتصال دائماً
      const { error } = await this.supabase.from('products').select('id').limit(1);

      const wasOffline = !this.isOnline;
      this.isOnline = !error;

      // إرسال الحالة لكافة نوافذ الواجهة
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('connection-status', { online: this.isOnline });
        }
      });

      // عند عودة الاتصال، ابدأ المزامنة تلقائياً
      if (this.isOnline && wasOffline) {
        console.log('🌐 Internet is back! Starting automatic sync...');
        this.processSyncQueue();
      }
    } catch (err) {
      this.isOnline = false;
    }
  }

  async addToSyncQueue(table, record, operation) {
    if (!this.db) return;

    // استثناء الصفحة الرئيسية من المزامنة كلياً
    if (table === 'transactions') {
      return;
    }

    const recordData = JSON.stringify(record);

    try {
      await this.db.run(
        'INSERT INTO offline_sync_queue (table_name, record_data, operation) VALUES (?, ?, ?)',
        [table, recordData, operation]
      );
      console.log(`📝 Added to offline queue: ${operation} on ${table}`);

      if (this.isOnline && !this.isProcessing) {
        this.processSyncQueue();
      }
    } catch (err) {
      console.error('❌ Failed to add to offline queue:', err);
      throw err;
    }
  }

  async processSyncQueue() {
    if (this.isProcessing || !this.isOnline || !this.supabase || !this.db) return;

    this.isProcessing = true;

    try {
      // ترتيب الطابور: الآباء أولاً (customers -> products) ثم الحركات، والحذف أخيراً
      const query = `
        SELECT * FROM offline_sync_queue 
        ORDER BY 
          CASE 
            WHEN operation = 'delete' THEN 4
            WHEN table_name = 'customers' THEN 1
            WHEN table_name = 'products' THEN 2
            ELSE 3
          END ASC, 
          id ASC`;

      const rows = await this.db.all(query);

      if (!rows || rows.length === 0) {
        this.isProcessing = false;
        this.broadcastProgress(100, 'تمت المزامنة بنجاح');
        return;
      }

      console.log(`🔄 Processing ${rows.length} sync items...`);
      const totalItems = rows.length;
      let processedItems = 0;

      for (const item of rows) {
        if (!this.isOnline) break;

        processedItems++;
        const progress = Math.round((processedItems / totalItems) * 100);
        this.broadcastProgress(progress, `جاري مزامنة: ${item.table_name} (${processedItems}/${totalItems})`);

        // تجاهل معاملات الصفحة الرئيسية
        if (item.table_name === 'transactions') {
          await this.db.run('DELETE FROM offline_sync_queue WHERE id = ?', [item.id]);
          continue;
        }

        try {
          const record = JSON.parse(item.record_data);
          let result;

          switch (item.operation) {
            case 'insert':
              result = await this.supabase.from(item.table_name).upsert(record);
              break;
            case 'update':
              result = await this.supabase.from(item.table_name).update(record).eq('id', record.id);
              break;
            case 'delete':
              // ✅ الحذف الذكي: تحديث is_deleted = true سحابياً لمنع كسر المفاتيح الأجنبية
              result = await this.supabase.from(item.table_name).update({ is_deleted: true, last_modified: new Date().toISOString() }).eq('id', record.id);
              break;
          }

          if (result && result.error) {
            console.error(`❌ Sync error for item ${item.id} on ${item.table_name}:`, result.error.message);

            // معالجة فقدان الـ product_id
            if (item.table_name === 'customer_transactions' && result.error.message.includes('foreign key')) {
              const modified = { ...record, product_id: null };
              const retry = await this.supabase.from(item.table_name).upsert(modified);
              if (!retry.error) {
                result = retry;
              }
            } else if (result.error.message.includes('schema cache') || result.error.message.includes('not find the table')) {
              await this.db.run('DELETE FROM offline_sync_queue WHERE id = ?', [item.id]);
              continue;
            } else {
              continue;
            }
          }

          // مسح العنصر بعد المزامنة بنجاح
          await this.db.run('DELETE FROM offline_sync_queue WHERE id = ?', [item.id]);
          console.log(`✅ Synced item ${item.id}: ${item.operation} on ${item.table_name}`);
        } catch (itemErr) {
          console.error(`❌ Error processing sync item ${item.id}:`, itemErr);
          continue;
        }
      }
    } catch (globalErr) {
      console.error('❌ Global sync error:', globalErr);
    } finally {
      this.isProcessing = false;
    }
  }

  broadcastProgress(progress, message) {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('sync-progress', { progress, message });
      }
    });
  }

  startSyncInterval() {
    setInterval(() => {
      this.processSyncQueue();
    }, 120000);
  }

  async fetchAllFromSupabase(tableName) {
    const pageSize = 1000;
    let all = [];
    let from = 0;

    while (true) {
      const { data, error } = await this.supabase
        .from(tableName)
        .select('*')
        .range(from, from + pageSize - 1);

      if (error) throw new Error(`${tableName}: ${error.message}`);
      if (!data || data.length === 0) break;

      all = all.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    return all;
  }

  normalizeForLocal(tableName, record) {
    const TABLE_COLUMNS = {
      products: ['id', 'serial_number', 'name', 'price', 'wholesale_price', 'purchase_price', 'quantity', 'min_quantity', 'category', 'last_modified', 'is_deleted', 'sync_status'],
      customers: ['id', 'name', 'phone', 'amount_due', 'date', 'notes', 'portal_token', 'auth_id', 'last_modified', 'is_deleted', 'sync_status'],
      customer_transactions: ['id', 'customer_id', 'date', 'time', 'item', 'price', 'quantity', 'total', 'type', 'product_id', 'notes', 'last_modified', 'is_deleted', 'sync_status'],
      payments: ['id', 'customer_id', 'amount', 'payment_method', 'date', 'time', 'notes', 'last_modified', 'is_deleted', 'sync_status'],
      sales: ['id', 'customer_id', 'product_id', 'product_name', 'price', 'quantity', 'total', 'date', 'last_modified', 'is_deleted', 'sync_status']
    };

    const columns = TABLE_COLUMNS[tableName];
    if (!columns) return record;

    const normalized = {};

    for (const col of columns) {
      let value = record[col];

      if (col === 'is_deleted') {
        value = value === true || value === 1 ? 1 : 0;
      } else if (col === 'sync_status') {
        value = 'synced';
      } else if (value === undefined || value === null) {
        if (col === 'payment_method') value = 'cash';
        else if (col === 'type') value = 'sale';
        else if (col === 'purchase_price' || col === 'amount_due') value = 0;
        else if (col === 'quantity' && tableName === 'customer_transactions') value = 1;
        else value = null;
      }

      normalized[col] = value;
    }

    return normalized;
  }

  async upsertLocalRecord(tableName, record) {
    const normalized = this.normalizeForLocal(tableName, record);
    const columns = Object.keys(normalized);
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map((col) => normalized[col]);

    const sql = `INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    await this.db.run(sql, values);
  }

  async updateSqliteSequence(tableName) {
    const row = await this.db.get(`SELECT COALESCE(MAX(id), 0) AS maxId FROM ${tableName}`);
    const maxId = row?.maxId || 0;
    if (maxId === 0) return;

    const seqRow = await this.db.get('SELECT seq FROM sqlite_sequence WHERE name = ?', [tableName]);
    if (seqRow) {
      await this.db.run('UPDATE sqlite_sequence SET seq = ? WHERE name = ?', [maxId, tableName]);
    } else {
      await this.db.run('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)', [tableName, maxId]);
    }
  }

  async pullFromSupabase() {
    if (this.isProcessing || this.isPulling || !this.isOnline || !this.supabase || !this.db) {
      return {
        success: false,
        error: !this.isOnline ? 'لا يوجد اتصال بالإنترنت' : 'جاري تنفيذ عملية مزامنة أخرى'
      };
    }

    this.isPulling = true;
    const stats = {};
    const pullOrder = ['products', 'customers', 'customer_transactions', 'payments', 'sales'];

    try {
      this.broadcastProgress(0, 'جاري رفع أي بيانات محلية معلقة أولاً...');
      await this.processSyncQueue();

      this.isProcessing = true;

      await this.db.run('PRAGMA foreign_keys = OFF');
      await this.db.run('BEGIN TRANSACTION');

      for (let i = 0; i < pullOrder.length; i++) {
        const tableName = pullOrder[i];
        const progress = Math.round(((i + 0.2) / pullOrder.length) * 100);
        this.broadcastProgress(progress, `جاري جلب ${tableName} من السحابة...`);

        const rows = await this.fetchAllFromSupabase(tableName);

        for (const row of rows) {
          await this.upsertLocalRecord(tableName, row);
        }

        await this.updateSqliteSequence(tableName);
        stats[tableName] = rows.length;

        const doneProgress = Math.round(((i + 1) / pullOrder.length) * 100);
        this.broadcastProgress(doneProgress, `تم جلب ${rows.length} سجل من ${tableName}`);
      }

      await this.db.run('COMMIT');
      await this.db.run('PRAGMA foreign_keys = ON');

      // تنظيف الطابور من العمليات السابقة للجداول المجذوبة
      for (const tableName of pullOrder) {
        await this.db.run('DELETE FROM offline_sync_queue WHERE table_name = ?', [tableName]);
      }

      this.broadcastProgress(100, `تم جلب البيانات من السحابة بنجاح`);
      return { success: true, stats };
    } catch (err) {
      try {
        await this.db.run('ROLLBACK');
        await this.db.run('PRAGMA foreign_keys = ON');
      } catch (_) {}

      console.error('❌ Pull from Supabase failed:', err);
      this.broadcastProgress(0, `فشل جلب البيانات: ${err.message}`);
      return { success: false, error: err.message };
    } finally {
      this.isProcessing = false;
      this.isPulling = false;
    }
  }
}

module.exports = SyncManager;

