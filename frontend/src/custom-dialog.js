// custom-dialog.js
(function () {
    // Check if style is already loaded, otherwise injection might be late
    const modalHTML = `
    <div id="appModalOverlay" class="app-modal-overlay">
        <div class="app-modal-content">
            <div id="appModalHeader" class="app-modal-header">تنبيه</div>
            <div class="app-modal-body">
                <div id="appModalMessage" class="app-modal-message"></div>
                <input type="text" id="appModalExtraInput" class="app-modal-input" autocomplete="off">
                <input type="password" id="appModalPasswordInput" class="app-modal-input" autocomplete="current-password">
            </div>
            <div class="app-modal-footer">
                <button id="appModalCancelBtn" class="btn-modal btn-modal-cancel">لا</button>
                <button id="appModalConfirmBtn" class="btn-modal btn-modal-primary">نعم</button>
            </div>
        </div>
    </div>
    `;

    // Prepend to body to ensure it's at the top of DOM (helps with some focus issues)
    document.body.insertAdjacentHTML('afterbegin', modalHTML);

    const overlay = document.getElementById('appModalOverlay');
    const messageEl = document.getElementById('appModalMessage');
    const extraInput = document.getElementById('appModalExtraInput');
    const passwordInput = document.getElementById('appModalPasswordInput');
    const confirmBtn = document.getElementById('appModalConfirmBtn');
    const cancelBtn = document.getElementById('appModalCancelBtn');
    const headerEl = document.getElementById('appModalHeader');

    let resolvePromise;

    function showModal(message, type = 'confirm', header = 'تأكيد العملية', placeholders = {}) {
        return new Promise((resolve) => {
            resolvePromise = resolve;
            messageEl.innerHTML = message;
            headerEl.textContent = header;

            // Header state
            if (type === 'danger' || type === 'secure-delete') {
                headerEl.classList.add('danger-header');
                confirmBtn.className = 'btn-modal btn-modal-danger';
            } else {
                headerEl.classList.remove('danger-header');
                confirmBtn.className = 'btn-modal btn-modal-primary';
            }

            // UI Reset
            extraInput.style.display = 'none';
            passwordInput.style.display = 'none';
            extraInput.value = '';
            passwordInput.value = '';

            if (type === 'prompt') {
                passwordInput.style.display = 'block';
                passwordInput.placeholder = placeholders.password || 'كلمة المرور';
            } else if (type === 'secure-delete') {
                extraInput.style.display = 'block';
                passwordInput.style.display = 'block';
                extraInput.placeholder = placeholders.extra || 'ادخل الاسم للتأكيد';
                passwordInput.placeholder = placeholders.password || 'كلمة مرور الأدمن';
            }

            // Lock scroll
            document.body.style.overflow = 'hidden';

            overlay.style.display = 'flex';
            // Force reflow for animation
            overlay.offsetHeight;
            overlay.classList.add('active');

            // Handle Focus
            if (type === 'secure-delete') {
                setTimeout(() => extraInput.focus(), 150);
            } else if (type === 'prompt') {
                setTimeout(() => passwordInput.focus(), 150);
            } else {
                setTimeout(() => confirmBtn.focus(), 150);
            }
        });
    }

    confirmBtn.onclick = (e) => {
        e.preventDefault();
        const isShown = (el) => el.style.display === 'block';

        if (isShown(extraInput) && isShown(passwordInput)) {
            closeModal({
                extra: extraInput.value,
                password: passwordInput.value
            });
        } else if (isShown(passwordInput)) {
            closeModal(passwordInput.value);
        } else {
            closeModal(true);
        }
    };

    cancelBtn.onclick = (e) => {
        e.preventDefault();
        closeModal(null);
    };

    overlay.onclick = (e) => {
        if (e.target === overlay) closeModal(null);
    };

    // Keyboard support
    window.addEventListener('keydown', (e) => {
        if (!overlay.classList.contains('active')) return;

        if (e.key === 'Escape') {
            closeModal(null);
        } else if (e.key === 'Enter') {
            confirmBtn.click();
        }
    });

    function closeModal(result) {
        overlay.classList.remove('active');
        // Unlock scroll after animation
        setTimeout(() => {
            if (!overlay.classList.contains('active')) {
                overlay.style.display = 'none';
                document.body.style.overflow = '';
            }
            if (resolvePromise) {
                const tempResolve = resolvePromise;
                resolvePromise = null;
                tempResolve(result);
            }
        }, 300);
    }

    // Expose to window
    window.appConfirm = (msg, header) => showModal(msg, 'confirm', header);
    window.appPrompt = (msg, header) => showModal(msg, 'prompt', header || 'إدخال بيانات');
    window.appDangerConfirm = (msg, header) => showModal(msg, 'danger', header || 'تحذير حذف');
    window.appSecureDelete = (msg, header, placeholders) => showModal(msg, 'secure-delete', header || 'حذف آمن', placeholders);

})();
