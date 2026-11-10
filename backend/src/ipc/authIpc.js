// backend/src/ipc/authIpc.js
const { ipcMain } = require('electron');

let currentUser = null;

function registerAuthIpc({ db, loadPageSilently }) {
  // تسجيل الدخول
  ipcMain.handle('login', async (event, { username, password }) => {
    try {
      const user = await db.get(
        'SELECT * FROM users WHERE username = ? AND password = ? AND is_deleted = 0',
        [username, password]
      );

      if (user) {
        currentUser = {
          id: user.id,
          username: user.username,
          role: user.role,
          permissions: user.permissions ? JSON.parse(user.permissions) : null
        };
        return { success: true, user: currentUser };
      }

      return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    } catch (err) {
      console.error('Login error:', err);
      return { success: false, error: 'خطأ في قاعدة البيانات' };
    }
  });

  // تسجيل الخروج
  ipcMain.on('logout', () => {
    currentUser = null;
    loadPageSilently('login.html');
  });

  // المستخدم الحالي
  ipcMain.handle('get-current-user', () => {
    return currentUser;
  });

  // إضافة مستخدم (للأدمن)
  ipcMain.handle('add-user', async (event, user) => {
    try {
      const now = new Date().toISOString();
      const res = await db.run(
        `INSERT INTO users (username, password, role, permissions, last_modified) VALUES (?, ?, ?, ?, ?)`,
        [user.username, user.password, user.role || 'user', JSON.stringify(user.permissions || []), now]
      );
      return { success: true, id: res.id };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // قائمة المستخدمين
  ipcMain.handle('get-users', async () => {
    try {
      const rows = await db.all('SELECT id, username, role, permissions FROM users WHERE is_deleted = 0');
      return rows.map((r) => ({
        ...r,
        permissions: r.permissions ? JSON.parse(r.permissions) : []
      }));
    } catch (err) {
      return [];
    }
  });

  // تحديث مستخدم
  ipcMain.handle('update-user', async (event, user) => {
    try {
      const now = new Date().toISOString();
      await db.run(
        `UPDATE users SET username = ?, password = ?, permissions = ?, last_modified = ? WHERE id = ?`,
        [user.username, user.password, JSON.stringify(user.permissions || []), now, user.id]
      );
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // حذف مستخدم بعد التحقق من كلمة مرور الأدمن
  ipcMain.handle('secure-delete-user', async (event, { id, password }) => {
    try {
      const admin = await db.get("SELECT password FROM users WHERE username = 'admin'");
      if (!admin || admin.password !== password) {
        return { success: false, error: 'كلمة مرور الأدمن غير صحيحة' };
      }

      const now = new Date().toISOString();
      await db.run('UPDATE users SET is_deleted = 1, last_modified = ? WHERE id = ?', [now, id]);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // تغيير كلمة مرور الأدمن
  ipcMain.handle('change-admin-password', async (event, { oldPassword, newPassword }) => {
    try {
      const admin = await db.get("SELECT password FROM users WHERE username = 'admin'");
      if (!admin || admin.password !== oldPassword) {
        return { success: false, error: 'كلمة المرور الحالية غير صحيحة' };
      }

      const now = new Date().toISOString();
      await db.run("UPDATE users SET password = ?, last_modified = ? WHERE username = 'admin'", [newPassword, now]);
      return { success: true };
    } catch (err) {
      return { success: false, error: 'خطأ في قاعدة البيانات' };
    }
  });
}

module.exports = registerAuthIpc;

