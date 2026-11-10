# Ali Elgdawy - POS & Financial Tracker System
نظام إدارة نقاط البيع والمحاسبة والعملاء مع المزامنة السحابية

نظام متكامل لإدارة المبيعات، المخازن، حسابات العملاء، وحركات الخزينة اليومية. مبني بتقنية **Electron + SQLite** ليعمل بكفاءة وسرعة فائقة بدون إنترنت (Offline-First)، مع المزامنة السحابية عبر **Supabase** وبوابة ويب مخصصة للعملاء بروابط مشفرة وآمنة (`UUID Tokens`).

---

## 📁 هيكل مجلدات المشروع (Project Structure)

```text
Pos System/
├── backend/                  # الباك إند (Electron Main Process)
│   ├── config/              # إعدادات الحزم وبناء التطبيق
│   │   └── electron-builder.yml
│   └── src/
│       ├── main.js          # نقطة انطلاق التطبيق وإدارة النوافذ والقوائم
│       ├── preload.js       # سكريبت الجسر الآمن
│       ├── config/
│       │   └── env.js       # قراءة وضبط متغيرات البيئة (.env)
│       ├── database/
│       │   ├── db.js        # اتصال SQLite والعمليات المتزامنة (WAL Mode)
│       │   └── schema.js    # إنشاء الجداول وتحديثات الأعمدة والـ UUID
│       ├── services/
│       │   ├── sync.js      # خدمة المزامنة السحابية مع Supabase
│       │   └── backup.js    # خدمة النسخ الاحتياطي التلقائي واليدوي
│       └── ipc/             # معالجات قنوات الاتصال المقسمة (IPC Handlers)
│           ├── index.js     # المجمع العام لجميع الـ IPC Handlers
│           ├── authIpc.js   # المصادقة وإدارة المستخدمين
│           ├── productsIpc.js # المنتجات، الأسعار، المخزون، والباركود
│           ├── customersIpc.js# العملاء، الروابط الآمنة، والأرصدة
│           ├── transactionsIpc.js # المعاملات، المدفوعات، والخزينة اليومية
│           ├── dashboardIpc.js    # لوحة التحكم والإحصائيات والأرباح
│           ├── backupIpc.js       # النسخ الاحتياطي واستعادة ودمج العملاء
│           └── syncIpc.js         # أوامر المزامنة الإجبارية والتنزيل
│
├── frontend/                 # واجهة تطبيق الديسكتوب (Electron Renderer)
│   ├── src/                 # صفحات HTML وملفات JavaScript
│   └── assets/              # ملفات التنسيق CSS، الأيقونات، والصور
│
├── web/                      # بوابة الويب للعملاء ولوحة الأدمن (React App)
│   ├── src/
│   │   ├── CustomerPortal.jsx # بوابة العميل برابط UUID الآمن
│   │   ├── AdminApp.jsx       # لوحة إدارة المتجر عبر الويب
│   │   └── supabaseClient.jsx # عميل الاتصال بـ Supabase
│   └── public/
│
├── docs/                     # سكربتات SQL وملفات المساعدة
├── pos_system.db             # قاعدة بيانات SQLite المحلية
├── package.json              # تبعيات المشروع وأوامر التشغيل
└── .env                      # متغيرات البيئة والربط السحابي
```

---

## 🚀 التثبيت والتشغيل (Quick Start)

### المتطلبات الأساسية
* **Node.js** (إصدار 18 أو أحدث)
* حساب **Supabase** (للمزامنة السحابية وبوابة الويب)

### 1. تثبيت الحزم
```bash
# تثبيت حزم الديسكتوب والباك إند
npm install

# تثبيت حزم بوابة الويب
cd web
npm install
cd ..
```

### 2. ضبط ملف المتغيرات (`.env`)
أنشئ ملف `.env` في المجلد الرئيسي للمشروع:
```env
# رابط ومفتاح Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-key

# رابط بوابة الويب (Vercel) لتوليد روابط العملاء والـ QR Code
WEB_PORTAL_URL=https://your-app.vercel.app

# (اختياري) بيانات حساب الأدمن لمزامنة الديسكتوب
SUPABASE_ADMIN_EMAIL=admin@example.com
SUPABASE_ADMIN_PASSWORD=your_secure_password
```

### 3. تشغيل التطبيق في بيئة التطوير
```bash
# تشغيل تطبيق الديسكتوب (Electron)
npm start

# تشغيل بوابة الويب (React)
npm run start:web
```

---

## 🔒 المزامنة وبوابة الويب الآمنة (Security & Portal Token)

1. **استثناء الصفحة الرئيسية:**
   * بيانات كشف الخزينة اليومي (`transactions`) تظل محلية 100% على جهاز الكاشير ولا يتم رفعها للسحابة للحفاظ على الخصوصية والسرعة.
2. **روابط العملاء المشفرة (`UUID v4`):**
   * بدلاً من استخدام أرقام متسلسلة (`/customer/1`) التي تتيح لأي شخص التجسس على حسابات العملاء، يحصل كل عميل على `portal_token` عشوائي مستحيل التخمين (`/customer/c84d9f6a-...`).
3. **دالة البوابة (`get_customer_portal`):**
   * المتصفح لا يملك وصولاً مباشراً لقاعدة البيانات؛ بل يستدعي دالة SQL مؤمنة بـ `SECURITY DEFINER` تُرجع فقط حساب العميل صاحب الـ Token في طلب واحد سريع جداً.

---

## 📦 بناء وتوزيع التطبيق (Production Build)

```bash
# إنشاء ملف التثبيت للويندوز (Setup.exe)
npm run build

# بناء نسخة الويب للرفع على استضافة Vercel
cd web
npm run build
```

---

## 👨‍💻 المطور
* **يوسف الخيوطي (Youssef Elkhyoty)**
* رقم التواصل: `01015985881`
* ترخيص المشروع: MIT
