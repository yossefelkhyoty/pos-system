// sync.js
const { ipcMain, BrowserWindow } = require('electron');
const { createClient } = require('@supabase/supabase-js');

class SyncManager {
  constructor(db) {
    this.db = db;
    this.supabase = null;
    this.isOnline = false;
    this.isProcessing = false;
    this.isPulling = false;
    this.initSupabase();
    this.startSyncInterval();
  }

  initSupabase() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("❌ Supabase credentials missing! Check your .env file.");
      return;
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);

    // Initial check
    this.checkConnection();
    // Check connection status every 30 seconds
    setInterval(() => this.checkConnection(), 30000);
  }

  async checkConnection() {
    try {
      // Use a simple query to check connection
      const { error } = await this.supabase.from('products').select('count').limit(1);

      const wasOffline = !this.isOnline;
      this.isOnline = !error;

      // Send status to renderer
      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send('connection-status', { online: this.isOnline });
        }
      });

      // If we were offline and now online, trigger sync
      if (this.isOnline && wasOffline) {
        console.log("🌐 Internet is back! Starting sync...");
        this.processSyncQueue();
      }
    } catch (err) {
      this.isOnline = false;
    }
  }

  async addToSyncQueue(table, record, operation) {
    if (!this.db) return;

    const recordData = JSON.stringify(record);

    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO offline_sync_queue (table_name, record_data, operation) VALUES (?, ?, ?)',
        [table, recordData, operation],
        (err) => {
          if (err) {
            console.error('❌ Failed to add to offline queue:', err);
            reject(err);
          } else {
            console.log(`📝 Added to offline queue: ${operation} on ${table}`);
            if (this.isOnline) {
              this.processSyncQueue();
            }
            resolve();
          }
        }
      );
    });
  }

  async processSyncQueue() {
    if (this.isProcessing || !this.isOnline || !this.supabase || !this.db) return;

    this.isProcessing = true;

    try {
      // Get all pending items from SQLite with smart ordering to prevent FK issues
      const query = `
        SELECT * FROM offline_sync_queue 
        ORDER BY 
          CASE 
            WHEN operation = 'delete' THEN 4        -- Deletes go last
            WHEN table_name = 'customers' THEN 1   -- Parents first
            WHEN table_name = 'products' THEN 2    -- Products next
            ELSE 3                                 -- Transactions/Payments in between
          END ASC, 
          id ASC`;

      this.db.all(query, async (err, rows) => {
        if (err) {
          console.error('❌ Error reading sync queue:', err);
          this.isProcessing = false;
          return;
        }

        if (!rows || rows.length === 0) {
          this.isProcessing = false;
          // إرسال إشعار باكتمال المزامنة
          this.broadcastProgress(100, 'تمت المزامنة بنجاح');
          return;
        }

        console.log(`🔄 Processing ${rows.length} sync items in priority order...`);
        const totalItems = rows.length;
        let processedItems = 0;

        for (const item of rows) {
          if (!this.isOnline) break;

          processedItems++;
          const progress = Math.round((processedItems / totalItems) * 100);
          this.broadcastProgress(progress, `جاري مزامنة: ${item.table_name} (${processedItems}/${totalItems})`);

          // تجاهل جدول معاملات الصفحة الرئيسية بناءً على طلب المستخدم
          if (item.table_name === 'transactions') {
            await new Promise((resolve) => {
              this.db.run('DELETE FROM offline_sync_queue WHERE id = ?', [item.id], () => resolve());
            });
            continue;
          }

          try {
            const record = JSON.parse(item.record_data);
            console.log(`📤 Syncing ${item.operation} on ${item.table_name}:`, record);

            let result;

            switch (item.operation) {
              case 'insert':
                result = await this.supabase.from(item.table_name).upsert(record);
                break;
              case 'update':
                result = await this.supabase.from(item.table_name)
                  .update(record)
                  .eq('id', record.id);
                break;
              case 'delete':
                result = await this.supabase.from(item.table_name)
                  .delete()
                  .eq('id', record.id);
                break;
              case 'delete-where':
                result = await this.supabase.from(item.table_name)
                  .delete()
                  .match(record);
                break;
            }

            if (result && result.error) {
              console.error(`❌ Sync error for item ${item.id} on ${item.table_name}:`, result.error.message);

              // 🛡️ معالجة مشكلة المفتاح الأجنبي للمنتج (Product ID Foreign Key)
              if (item.table_name === 'customer_transactions' &&
                result.error.message.includes('customer_transactions_product_id_fkey')) {
                console.log(`⚠️ Product ID is missing on Supabase for transaction ${record.id}. Retrying with product_id = null...`);

                const modifiedRecord = { ...record, product_id: null };
                let retryResult;

                if (item.operation === 'insert') {
                  retryResult = await this.supabase.from(item.table_name).upsert(modifiedRecord);
                } else if (item.operation === 'update') {
                  retryResult = await this.supabase.from(item.table_name).update(modifiedRecord).eq('id', record.id);
                }

                if (retryResult && !retryResult.error) {
                  console.log(`✅ Fixed and synced item ${item.id} with product_id = null`);
                  // استمر بنجاح للمسح من الطابور
                  result = retryResult;
                } else {
                  console.error(`❌ Failed even after removing product_id:`, retryResult?.error?.message);
                  continue;
                }
              } else if (result.error.message.includes('schema cache') || result.error.message.includes('not find the table')) {
                // إذا كان الجدول غير موجود، نبه المستخدم ولكن استمر في معالجة الباقي
                console.warn(`⚠️ Table "${item.table_name}" is missing on Supabase. Skipping.`);
                await new Promise((resolve) => {
                  this.db.run('DELETE FROM offline_sync_queue WHERE id = ?', [item.id], () => resolve());
                });
                continue;
              } else {
                // خطأ آخر، انتقل للتالي
                continue;
              }
            }

            // Success! Delete from local queue
            await new Promise((resolve, reject) => {
              this.db.run('DELETE FROM offline_sync_queue WHERE id = ?', [item.id], (delErr) => {
                if (delErr) reject(delErr);
                else resolve();
              });
            });

            console.log(`✅ Synced item ${item.id}: ${item.operation} on ${item.table_name}`);
          } catch (itemErr) {
            console.error(`❌ Error processing sync item ${item.id}:`, itemErr);
            // قد نختار الاستمرار أيضاً هنا
            continue;
          }
        }

        this.isProcessing = false;
      });
    } catch (globalErr) {
      console.error('❌ Global sync error:', globalErr);
      this.isProcessing = false;
    }
  }

  broadcastProgress(progress, message) {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('sync-progress', { progress, message });
      }
    });
  }

  startSyncInterval() {
    // Every 2 minutes, check if there's anything to sync
    setInterval(() => {
      this.processSyncQueue();
    }, 120000);
  }

  dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
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
      customers: ['id', 'name', 'phone', 'amount_due', 'date', 'notes', 'last_modified', 'is_deleted', 'sync_status'],
      customer_transactions: ['id', 'customer_id', 'date', 'time', 'item', 'price', 'quantity', 'total', 'type', 'product_id', 'notes', 'last_modified', 'is_deleted', 'sync_status'],
      payments: ['id', 'customer_id', 'amount', 'payment_method', 'date', 'time', 'notes', 'last_modified', 'is_deleted', 'sync_status'],
      sales: ['id', 'customer_id', 'product_id', 'product_name', 'price', 'quantity', 'total', 'date', 'last_modified', 'is_deleted', 'sync_status']
    };

    const columns = TABLE_COLUMNS[tableName];
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
    const values = columns.map(col => normalized[col]);

    const sql = `INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    await this.dbRun(sql, values);
  }

  async updateSqliteSequence(tableName) {
    const row = await this.dbGet(`SELECT COALESCE(MAX(id), 0) AS maxId FROM ${tableName}`);
    const maxId = row?.maxId || 0;
    if (maxId === 0) return;

    const seqRow = await this.dbGet('SELECT seq FROM sqlite_sequence WHERE name = ?', [tableName]);
    if (seqRow) {
      await this.dbRun('UPDATE sqlite_sequence SET seq = ? WHERE name = ?', [maxId, tableName]);
    } else {
      await this.dbRun('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)', [tableName, maxId]);
    }
  }

  dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  waitUntilIdle() {
    return new Promise((resolve) => {
      const check = () => {
        if (!this.isProcessing) {
          resolve();
          return;
        }
        setTimeout(check, 500);
      };
      check();
    });
  }

  /**
   * Pull all data from Supabase into local SQLite.
   * Cloud is treated as the source of truth.
   */
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
      if (this.isProcessing) {
        await this.waitUntilIdle();
      } else {
        await this.processSyncQueueAndWait();
      }

      this.isProcessing = true;

      await this.dbRun('PRAGMA foreign_keys = OFF');
      await this.dbRun('BEGIN TRANSACTION');

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

      await this.dbRun('COMMIT');
      await this.dbRun('PRAGMA foreign_keys = ON');

      // منع إعادة رفع بيانات قديمة من الطابور بعد الجلب
      for (const tableName of pullOrder) {
        await this.dbRun('DELETE FROM offline_sync_queue WHERE table_name = ?', [tableName]);
      }

      this.broadcastProgress(100, `تم جلب البيانات من السحابة بنجاح (${Object.values(stats).reduce((a, b) => a + b, 0)} سجل)`);
      console.log('✅ Pull from Supabase completed:', stats);

      return { success: true, stats };
    } catch (err) {
      try {
        await this.dbRun('ROLLBACK');
        await this.dbRun('PRAGMA foreign_keys = ON');
      } catch (_) { /* ignore rollback errors */ }

      console.error('❌ Pull from Supabase failed:', err);
      this.broadcastProgress(0, `فشل جلب البيانات: ${err.message}`);
      return { success: false, error: err.message };
    } finally {
      this.isProcessing = false;
      this.isPulling = false;
    }
  }

  processSyncQueueAndWait() {
    return new Promise((resolve) => {
      if (!this.isOnline) {
        resolve();
        return;
      }

      this.processSyncQueue();

      const check = () => {
        if (!this.isProcessing) {
          resolve();
          return;
        }
        setTimeout(check, 500);
      };

      setTimeout(check, 300);
    });
  }
}

module.exports = SyncManager;
