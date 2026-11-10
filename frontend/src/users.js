// users.js
const { ipcRenderer } = require('electron');

let currentUsers = [];

async function loadUsers() {
    const users = await ipcRenderer.invoke('get-users');
    currentUsers = users;
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';

    users.forEach(user => {
        const row = document.createElement('tr');

        if (user.username === 'admin') {
            row.innerHTML = `
          <td>${user.username}</td>
          <td>مدير نظام</td>
          <td>كامل الصلاحيات</td>
          <td>-</td>
       `;
        } else {
            row.innerHTML = `
          <td>${user.username}</td>
          <td>مستخدم</td>
          <td>${formatPermissions(user.permissions)}</td>
          <td>
            <button onclick="prepareEdit(${user.id})" class="btn-small">✏️ تعديل</button>
            <button onclick="deleteUser(${user.id}, '${user.username}')" class="danger btn-small">🗑️ حذف</button>
          </td>
       `;
        }
        tbody.appendChild(row);
    });
}

function formatPermissions(perms) {
    if (!perms || perms.length === 0) return 'لا يوجد';
    if (perms.includes('full_access')) return 'كامل الصلاحيات';

    // اختصار الصلاحيات للعرض
    const summary = [];
    if (perms.some(p => p.startsWith('page_'))) summary.push('دخول صفحات');
    if (perms.some(p => p.startsWith('add_'))) summary.push('إضافة');
    if (perms.some(p => p.startsWith('delete_'))) summary.push('حذف');

    return summary.join(' + ') || 'دخول صامت';
}

function toggleAllPermissions(checked) {
    const checkboxes = document.querySelectorAll('.perm-check');
    checkboxes.forEach(cb => cb.checked = checked);
}

function prepareEdit(userId) {
    const user = currentUsers.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('formTitle').textContent = 'تعديل المستخدم: ' + user.username;
    document.getElementById('editUserId').value = user.id;
    document.getElementById('username').value = user.username;
    document.getElementById('password').value = ''; // نترك كلمة المرور فارغة أو نطلب إدخالها
    document.getElementById('password').placeholder = 'اتركه فارغاً للإبقاء على الحالية';
    document.getElementById('password').required = false;

    // ملء الصلاحيات
    const checkboxes = document.querySelectorAll('.perm-check');
    checkboxes.forEach(cb => {
        cb.checked = user.permissions && user.permissions.includes(cb.value);
    });

    // تحديث checkbox "تحديد الكل" إذا كانت كل الصلاحيات موجودة
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    document.getElementById('selectAllPerms').checked = allChecked || (user.permissions && user.permissions.includes('full_access'));

    document.getElementById('submitBtn').textContent = 'حفظ التعديلات';
    document.getElementById('cancelEditBtn').classList.remove('hidden');

    // الانتقال للنموذج
    document.getElementById('formTitle').scrollIntoView({ behavior: 'smooth' });
}

function resetForm() {
    document.getElementById('formTitle').textContent = 'إضافة مستخدم جديد';
    document.getElementById('editUserId').value = '';
    document.getElementById('userForm').reset();
    document.getElementById('password').placeholder = 'كلمة المرور';
    document.getElementById('password').required = true;
    document.getElementById('submitBtn').textContent = 'إضافة مستخدم';
    document.getElementById('cancelEditBtn').classList.add('hidden');
    document.getElementById('selectAllPerms').checked = false;
}

document.getElementById('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const idValue = document.getElementById('editUserId').value;
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const permissionChecks = document.querySelectorAll('.perm-check:checked');
    const permissions = Array.from(permissionChecks).map(c => c.value);

    if (document.getElementById('selectAllPerms').checked) {
        permissions.push('full_access');
    }

    let result;
    if (idValue) {
        // تعديل
        const userToUpdate = { id: parseInt(idValue), username, permissions };
        if (password) userToUpdate.password = password;
        else {
            // جلب كلمة المرور القديمة لو كانت فارغة
            const oldUser = currentUsers.find(u => u.id === parseInt(idValue));
            userToUpdate.password = oldUser.password;
        }
        result = await ipcRenderer.invoke('update-user', userToUpdate);
    } else {
        // إضافة
        result = await ipcRenderer.invoke('add-user', {
            username,
            password,
            role: 'user',
            permissions
        });
    }

    if (result.success) {
        showNotification(idValue ? 'تم تحديث المستخدم بنجاح' : 'تم إضافة المستخدم بنجاح');
        resetForm();
        loadUsers();
    } else {
        showNotification('خطأ: ' + result.error, 'error');
    }
});

async function deleteUser(id, username) {
    const result = await appSecureDelete(
        `أنت على وشك حذف المستخدم <strong>"${username}"</strong>.<br>الرجاء إدخال اسم المستخدم وكلمة مرور الأدمن للتأكيد:`,
        'تأمين حذف مستخدم',
        { extra: 'اسم المستخدم', password: 'كلمة مرور الأدمن' }
    );

    if (!result) return;

    if (result.extra !== username) {
        showNotification('❌ اسم المستخدم غير متطابق', 'error');
        return;
    }

    const deleteResult = await ipcRenderer.invoke('secure-delete-user', { id, password: result.password });
    if (deleteResult.success) {
        showNotification('تم حذف المستخدم بنجاح', 'info');
        loadUsers();
    } else {
        showNotification('❌ فشل: ' + deleteResult.error, 'error');
    }
}


function showNotification(message, type = "info") {
    const box = document.getElementById("globalNotification");
    if (!box) return;
    box.className = "alert " + type;
    box.textContent = message;
    box.style.display = "block";
    setTimeout(() => box.style.display = "none", 3000);
}

window.addEventListener('load', loadUsers);

// --- وظائف تغيير كلمة مرور الأدمن ---

function openChangePasswordModal() {
    document.getElementById('changePasswordModal').classList.remove('hidden');
}

function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').classList.add('hidden');
    document.getElementById('changePasswordForm').reset();
}

document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const oldPassword = document.getElementById('oldPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;

    if (newPassword !== confirmNewPassword) {
        showNotification('كلمة المرور الجديدة غير متطابقة', 'error');
        return;
    }

    const result = await ipcRenderer.invoke('change-admin-password', { oldPassword, newPassword });

    if (result.success) {
        showNotification('تم تغيير كلمة المرور بنجاح', 'info');
        closeChangePasswordModal();
    } else {
        showNotification(result.error, 'error');
    }
});
