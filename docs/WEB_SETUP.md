# دليل تشغيل النسخة الويب - Web App Setup Guide

## 🚀 طريقة التشغيل

### 1. الانتقال إلى مجلد Web

```bash
cd web
```

### 2. تثبيت التبعيات (إذا لم تكن مثبتة)

```bash
npm install
```

### 3. إعداد Supabase

تأكد من وجود ملف `.env` في مجلد `web/`:

```env
REACT_APP_SUPABASE_URL=https://xxxxx.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key-here
```

**ملاحظة**: في React، يجب أن تبدأ متغيرات البيئة بـ `REACT_APP_`

### 4. تشغيل التطبيق

```bash
npm start
```

سيتم فتح التطبيق تلقائياً في المتصفح على `http://localhost:3000`

---

## 📝 من المجلد الرئيسي

يمكنك أيضاً تشغيله من المجلد الرئيسي:

```bash
# من المجلد الرئيسي
npm run start:web
```

أو:

```bash
cd web && npm start
```

---

## 🔧 المشاكل الشائعة

### خطأ: "Module not found"

```bash
# احذف node_modules وأعد التثبيت
cd web
rm -rf node_modules
npm install
```

**في Windows:**
```powershell
cd web
Remove-Item -Recurse -Force node_modules
npm install
```

### خطأ: "Cannot find module 'react-scripts'"

```bash
cd web
npm install react-scripts --save
```

### خطأ: "EADDRINUSE: address already in use"

البورت 3000 مستخدم، يمكنك:
1. إيقاف التطبيق الآخر
2. أو تغيير البورت:

```bash
# Windows (PowerShell)
$env:PORT=3001; npm start

# Linux/Mac
PORT=3001 npm start
```

---

## 🏗️ بناء التطبيق للإنتاج

```bash
cd web
npm run build
```

سيتم إنشاء مجلد `build/` يحتوي على الملفات الجاهزة للنشر.

### نشر على Vercel (مثال)

```bash
# تثبيت Vercel CLI
npm install -g vercel

# نشر المشروع
cd web
vercel
```

### نشر على Netlify

1. اربط مستودع GitHub
2. Build command: `cd web && npm run build`
3. Publish directory: `web/build`

---

## 📁 هيكل ملفات Web

```
web/
├── src/
│   ├── App.jsx           # المكون الرئيسي
│   ├── AdminApp.jsx      # لوحة التحكم
│   ├── CustomerPortal.jsx # بوابة العميل
│   ├── supabaseClient.jsx # إعداد Supabase
│   └── index.js          # نقطة البداية
├── public/
│   └── index.html
├── package.json
└── .env                  # متغيرات البيئة (يجب إنشاؤه)
```

---

## 🔐 إعداد Supabase للـ Web

### 1. إنشاء ملف .env

في مجلد `web/`، أنشئ ملف `.env`:

```env
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
```

### 2. تحديث supabaseClient.jsx

تأكد من أن الملف يستخدم متغيرات البيئة:

```javascript
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
```

---

## 🌐 الوصول للتطبيق

بعد التشغيل:
- **Development**: http://localhost:3000
- **Build**: بعد `npm run build`، افتح `web/build/index.html`

---

## 📦 التبعيات المطلوبة

تأكد من وجود:
- Node.js (v16 أو أحدث)
- npm أو yarn
- React 18+

---

## ⚠️ ملاحظات مهمة

1. **ملف .env**: لا ترفعه على GitHub (يجب أن يكون في .gitignore)
2. **API Keys**: استخدم `anon/public` key، وليس `service_role` key
3. **CORS**: تأكد من أن Supabase يسمح بالطلبات من `localhost:3000`

---

## 🐛 استكشاف الأخطاء

### التطبيق لا يفتح

```bash
# تحقق من البورت
netstat -ano | findstr :3000

# أو استخدم بورت آخر
PORT=3001 npm start
```

### خطأ في الاتصال بـ Supabase

1. تحقق من ملف `.env`
2. تأكد من أن المفاتيح صحيحة
3. تحقق من RLS Policies في Supabase

---

**للمزيد**: راجع `README.md` في المجلد الرئيسي
