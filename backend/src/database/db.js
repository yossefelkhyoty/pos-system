// backend/src/database/db.js
const sqlite3 = require('sqlite3').verbose();
const { dbPath } = require('../config/env');

class DatabaseConnection {
  constructor() {
    this.rawDb = null;
  }

  connect(customPath = dbPath) {
    return new Promise((resolve, reject) => {
      this.rawDb = new sqlite3.Database(customPath, (err) => {
        if (err) {
          console.error('❌ Error opening SQLite database:', err.message);
          return reject(err);
        }

        console.log('✅ SQLite connected:', customPath);

        // تحسينات أداء SQLite
        this.rawDb.serialize(() => {
          this.rawDb.run('PRAGMA journal_mode = WAL');
          this.rawDb.run('PRAGMA synchronous = NORMAL');
          this.rawDb.run('PRAGMA cache_size = -2000');
          this.rawDb.run('PRAGMA foreign_keys = ON');
        });

        resolve(this);
      });
    });
  }

  getRaw() {
    return this.rawDb;
  }

  // دعم النمطين: Promise و Callback للتوافق الكامل
  run(sql, params = [], callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }

    if (callback) {
      return this.rawDb.run(sql, params, callback);
    }

    return new Promise((resolve, reject) => {
      this.rawDb.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = [], callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }

    if (callback) {
      return this.rawDb.get(sql, params, callback);
    }

    return new Promise((resolve, reject) => {
      this.rawDb.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }

  all(sql, params = [], callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }

    if (callback) {
      return this.rawDb.all(sql, params, callback);
    }

    return new Promise((resolve, reject) => {
      this.rawDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  prepare(sql, callback) {
    return this.rawDb.prepare(sql, callback);
  }

  serialize(callback) {
    return this.rawDb.serialize(callback);
  }

  close(callback) {
    if (callback) {
      return this.rawDb ? this.rawDb.close(callback) : callback();
    }
    return new Promise((resolve, reject) => {
      if (!this.rawDb) return resolve();
      this.rawDb.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

// كائن أحادي (Singleton) للاستخدام عبر كامل التطبيق
const db = new DatabaseConnection();
module.exports = db;

