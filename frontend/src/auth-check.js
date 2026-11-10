const { ipcRenderer: authIpc } = require('electron');

// دالة تنقل موحدة لو لم تكن موجودة
if (typeof window.loadPage !== 'function') {
    window.loadPage = function (page) {
        authIpc.send('load-page', page);
    };
}

async function checkAuth() {
    const userJson = sessionStorage.getItem('currentUser');
    let user = userJson ? JSON.parse(userJson) : null;

    if (!user) {
        user = await authIpc.invoke('get-current-user');
        if (user) {
            sessionStorage.setItem('currentUser', JSON.stringify(user));
        }
    }

    if (!user && !window.location.href.includes('login.html')) {
        authIpc.send('logout');
        return null;
    }

    return user;
}

function updateNavForRole(user) {
    if (!user) return;

    const nav = document.querySelector('nav');
    if (!nav) return;

    // إضافة زر إدارة المستخدمين للأدمن
    if (user.role === 'admin' && !document.getElementById('nav-users')) {
        const usersBtn = document.createElement('button');
        usersBtn.id = 'nav-users';
        usersBtn.textContent = 'إدارة المستخدمين';
        usersBtn.onclick = () => loadPage('users.html');
        nav.appendChild(usersBtn);
    }

    // إضافة زر تسجيل الخروج
    if (!document.getElementById('nav-logout')) {
        const logoutBtn = document.createElement('button');
        logoutBtn.id = 'nav-logout';
        logoutBtn.textContent = 'تسجيل خروج';
        logoutBtn.style.backgroundColor = '#f44336';
        logoutBtn.onclick = () => {
            sessionStorage.removeItem('currentUser');
            authIpc.send('logout');
        };
        nav.appendChild(logoutBtn);
    }

    const isFullAccess = user.role === 'admin' || (user.permissions && user.permissions.includes('full_access'));

    // التحكم في الصلاحيات لليوزر العادي
    if (user.role === 'user' && !isFullAccess) {
        const pages = {
            'index.html': 'page_index',
            'products.html': 'page_products',
            'customers.html': 'page_customers',
            'dashboard.html': 'page_dashboard',
            'alerts.html': 'page_alerts'
        };

        // 1. صلاحيات الدخول للصفحات
        Object.keys(pages).forEach(page => {
            const permKey = pages[page];
            const btnId = `nav-${page.replace('.html', '') === 'index' ? 'home' : page.replace('.html', '')}`;
            const btn = document.getElementById(btnId);

            const hasPermission = user.permissions && user.permissions.includes(permKey);

            if (btn && !hasPermission) {
                btn.style.display = 'none';

                // إذا كان يحاول الدخول لصفحة ممنوعة
                if (window.location.href.includes(page)) {
                    const firstAllowedPage = Object.keys(pages).find(p => user.permissions.includes(pages[p]));
                    if (firstAllowedPage) loadPage(firstAllowedPage);
                    else authIpc.send('logout');
                }
            }
        });

        // 2. صلاحيات الإضافة والحذف (حسب الصفحة الحالية)
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const pageName = currentPage.replace('.html', '');

        const canAdd = user.permissions && user.permissions.includes(`add_${pageName}`);
        const canDelete = user.permissions && user.permissions.includes(`delete_${pageName}`);

        // مراقبة العناصر للتحكم في الإضافة والحذف
        const applyRestrictions = () => {
            if (!canDelete) {
                const deleteButtons = document.querySelectorAll('.danger, .btn-danger, button[onclick*="delete"], button[onclick*="cancel"]');
                deleteButtons.forEach(b => b.style.display = 'none');
            }

            if (!canAdd) {
                const addButtons = document.querySelectorAll('.btn-add, .btn-payment, .btn-primary, button[onclick*="add"], button[onclick*="save"], button[onclick*="modify"], button[type="submit"]:not(#loginForm button):not(#userForm button)');
                addButtons.forEach(b => b.style.display = 'none');

                // في الصفحة الرئيسية، يتم منع تعديل الحساب/السحب لو لا يملك صلاحية إضافة/تعديل
                if (pageName === 'index') {
                    const inputs = document.querySelectorAll('.account, .withdraw, .item, .notes');
                    inputs.forEach(input => {
                        if (!input.readOnly) input.readOnly = true;
                    });
                }
            }
        };

        applyRestrictions();

        // مراقبة التغييرات في الصفحة (للجداول الديناميكية)
        const observer = new MutationObserver(applyRestrictions);
        const container = document.querySelector('.container') || document.body;
        observer.observe(container, { childList: true, subtree: true });
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    if (window.location.href.includes('login.html')) return;

    const user = await checkAuth();
    if (user) {
        updateNavForRole(user);
        if (typeof highlightActiveNavButton === 'function') {
            highlightActiveNavButton();
        }
    }
});
