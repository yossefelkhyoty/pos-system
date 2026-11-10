# دليل الإعداد - Setup Guide

## المتطلبات الأساسية

قبل البدء، تأكد من تثبيت:

- **Node.js** (الإصدار 16 أو أحدث)
- **npm** (يأتي مع Node.js)
- **Git** (اختياري)

## خطوات الإعداد

### 1. استنساخ المشروع

```bash
git clone <repository-url>
cd app
```

### 2. تثبيت التبعيات

```bash
npm install
```

هذا سيقوم بتثبيت جميع التبعيات المطلوبة للتطبيق.

### 3. إعداد متغيرات البيئة

أنشئ ملف `.env` في المجلد الرئيسي للمشروع:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key
```

**ملاحظة**: احصل على هذه القيم من لوحة تحكم Supabase.

### 4. التحقق من قاعدة البيانات

تأكد من وجود ملف `pos_system.db` في المجلد الرئيسي. إذا لم يكن موجوداً، سيتم إنشاؤه تلقائياً عند أول تشغيل.

## التشغيل

### تشغيل تطبيق Electron

```bash
npm start
```

أو:

```bash
npm run start:backend
```

### تشغيل النسخة الويب

```bash
npm run start:web
```

أو:

```bash
cd web
npm install
npm start
```

## البناء

### بناء تطبيق Electron للتوزيع

```bash
npm run build
```

سيتم إنشاء ملف التثبيت في مجلد `build/`.

### بناء النسخة الويب

```bash
cd web
npm run build
```

سيتم إنشاء ملفات البناء في مجلد `web/build/`.

## هيكل الملفات بعد التنظيم

```
app/
├── backend/              # Backend Code
│   ├── src/
│   │   ├── main.js      # Main entry point
│   │   ├── database.js
│   │   ├── sync.js
│   │   ├── backup.js
│   │   └── preload.js
│   └── config/
│
├── frontend/            # Frontend Code
│   ├── src/            # HTML & JS files
│   └── assets/         # CSS & Images
│
├── web/                # Web App (React)
│   ├── src/
│   └── build/
│
├── docs/               # Documentation
├── shared/             # Shared files
├── package.json        # Main package.json
└── .env               # Environment variables
```

## استكشاف الأخطاء

### المشكلة: التطبيق لا يبدأ

**الحل**:
1. تحقق من تثبيت Node.js
2. تأكد من تثبيت التبعيات: `npm install`
3. تحقق من ملف `.env`

### المشكلة: خطأ في المسارات

**الحل**:
- تأكد من أنك تقوم بتشغيل الأوامر من المجلد الرئيسي
- تحقق من هيكل المجلدات

### المشكلة: خطأ في الاتصال بـ Supabase

**الحل**:
1. تحقق من ملف `.env`
2. تأكد من صحة `SUPABASE_URL` و `SUPABASE_KEY`
3. تحقق من اتصال الإنترنت

### المشكلة: قاعدة البيانات لا تعمل

**الحل**:
1. تحقق من وجود `pos_system.db`
2. تحقق من الصلاحيات
3. حاول حذف الملف وإعادة التشغيل (سيتم إنشاؤه تلقائياً)

## التطوير

### إضافة ميزة جديدة

1. **Backend**: أضف الكود في `backend/src/`
2. **Frontend**: أضف الكود في `frontend/src/`
3. **Database**: حدث الجداول في `backend/src/database.js`

### اختبار التغييرات

```bash
# إعادة تشغيل التطبيق بعد التغييرات
npm start
```

## النشر

### نشر تطبيق Electron

```bash
npm run build
```

سيتم إنشاء ملف `.exe` في مجلد `build/`.

### نشر النسخة الويب

```bash
cd web
npm run build
```

ثم قم برفع محتويات `web/build/` إلى خادم الويب.

## الدعم

للمساعدة والدعم:
- WhatsApp: [01015985881](https://wa.me/201015985881)
- Email: (إذا كان متوفراً)

---

**ملاحظة**: تأكد دائماً من عمل نسخة احتياطية من قاعدة البيانات قبل التحديثات الكبيرة.

