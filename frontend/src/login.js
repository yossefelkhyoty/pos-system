// login.js
const { ipcRenderer } = require('electron');

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');

    errorDiv.style.display = 'none';

    try {
        const result = await ipcRenderer.invoke('login', { username, password });

        if (result.success) {
            // حفظ بيانات المستخدم في sessionStorage للوصول السريع في الصفحات الأخرى
            sessionStorage.setItem('currentUser', JSON.stringify(result.user));

            // التوجه للصفحة الرئيسية
            ipcRenderer.send('load-page', 'index.html');
        } else {
            errorDiv.textContent = result.error;
            errorDiv.style.display = 'block';
        }
    } catch (err) {
        console.error('Login error:', err);
        errorDiv.textContent = 'حدث خطأ أثناء تسجيل الدخول';
        errorDiv.style.display = 'block';
    }
});
