# 🚀 رفع التطبيق على Vercel - دليل شامل

## الطريقة الأولى: من خلال Vercel CLI (الأسرع)

### 1. تثبيت Vercel CLI
```bash
npm install -g vercel
```

### 2. الانتقال لمجلد المشروع
```bash
cd web
```

### 3. تسجيل الدخول لـ Vercel
```bash
vercel login
```

### 4. رفع المشروع
```bash
vercel
```

سيسألك CLI عدة أسئلة:
- **Set up and deploy?** → اضغط `Y` (نعم)
- **Which scope?** → اختر حسابك
- **Link to existing project?** → `N` (مشروع جديد)
- **What's your project's name?** → اسم المشروع (مثلاً: `alijadawy-admin`)
- **In which directory is your code located?** → `./` (المجلد الحالي)
- **Want to override the settings?** → `N` (لا)

### 5. رفع للإنتاج
```bash
vercel --prod
```

---

## الطريقة الثانية: من خلال GitHub (الموصى بها)

### 1. رفع الكود على GitHub

#### أ) إنشاء مستودع جديد
```bash
cd web
git init
git add .
git commit -m "Initial commit"
```

#### ب) إنشاء مستودع على GitHub
- اذهب إلى [github.com](https://github.com)
- اضغط على "New repository"
- اختر اسم للمستودع (مثلاً: `alijadawy-web`)
- لا تقم بتفعيل README أو .gitignore
- اضغط "Create repository"

#### ج) ربط المشروع بـ GitHub
```bash
git remote add origin https://github.com/YOUR_USERNAME/alijadawy-web.git
git branch -M main
git push -u origin main
```

### 2. ربط المشروع بـ Vercel

#### أ) إنشاء حساب على Vercel
- اذهب إلى [vercel.com](https://vercel.com)
- اضغط "Sign Up"
- اختر "Continue with GitHub"

#### ب) استيراد المشروع
1. اضغط على "Add New Project"
2. اختر المستودع `alijadawy-web`
3. اضبط الإعدادات:
   - **Framework Preset:** Create React App
   - **Root Directory:** `./web` (إذا كان المشروع في مجلد فرعي)
   - **Build Command:** `npm run build`
   - **Output Directory:** `build`

#### ج) إضافة Environment Variables
في صفحة الإعدادات، أضف المتغيرات التالية:
```
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
```

#### د) النشر
- اضغط "Deploy"
- انتظر حتى يكتمل النشر (عادة 1-3 دقائق)

---

## الطريقة الثالثة: من خلال Vercel Dashboard (الأسهل)

### 1. إنشاء حساب
- اذهب إلى [vercel.com](https://vercel.com)
- سجل دخول بحساب GitHub/GitLab/Bitbucket

### 2. استيراد المشروع
1. اضغط "Add New Project"
2. اختر "Import Git Repository"
3. اختر مستودع GitHub الخاص بك
4. اضغط "Import"

### 3. إعداد المشروع
- **Framework Preset:** Create React App
- **Root Directory:** `web` (إذا كان في مجلد فرعي)
- **Build Command:** `npm run build`
- **Output Directory:** `build`
- **Install Command:** `npm install`

### 4. Environment Variables
أضف المتغيرات التالية:
```
REACT_APP_SUPABASE_URL
REACT_APP_SUPABASE_ANON_KEY
```

### 5. النشر
- اضغط "Deploy"
- انتظر حتى يكتمل النشر

---

## ⚙️ إعدادات Environment Variables

### المتغيرات المطلوبة:
```
REACT_APP_SUPABASE_URL=https://xxxxx.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your_anon_key_here
```

### كيفية الحصول عليها:
1. افتح Supabase Dashboard
2. اذهب إلى Settings → API
3. انسخ:
   - **Project URL** → `REACT_APP_SUPABASE_URL`
   - **anon public key** → `REACT_APP_SUPABASE_ANON_KEY`

---

## 📝 ملاحظات مهمة

### 1. ملف `.env`
تأكد من وجود ملف `.env` في مجلد `web/`:
```env
REACT_APP_SUPABASE_URL=your_url
REACT_APP_SUPABASE_ANON_KEY=your_key
```

**⚠️ مهم:** لا ترفع ملف `.env` على GitHub! تأكد أنه موجود في `.gitignore`

### 2. إعدادات Build
في `package.json` تأكد من وجود:
```json
{
  "scripts": {
    "build": "react-scripts build"
  }
}
```

### 3. ملف `vercel.json`
تم إنشاء الملف تلقائياً، وهو يضمن:
- توجيه جميع المسارات إلى `index.html` (لـ React Router)
- Cache للـ static files

---

## 🔧 استكشاف الأخطاء

### خطأ: Build Failed
- تأكد من وجود جميع المتغيرات في Environment Variables
- تحقق من logs في Vercel Dashboard

### خطأ: Routing لا يعمل
- تأكد من وجود `vercel.json` مع الإعدادات الصحيحة
- تأكد من أن جميع المسارات ترجع إلى `index.html`

### خطأ: Environment Variables غير موجودة
- تأكد من أن المتغيرات تبدأ بـ `REACT_APP_`
- راجع Vercel Dashboard → Settings → Environment Variables

---

## 🌐 بعد النشر

### الحصول على الرابط:
- بعد النشر، ستحصل على رابط مثل: `https://your-project.vercel.app`
- يمكنك تغيير الاسم في Settings → General

### Custom Domain (اختياري):
1. اذهب إلى Settings → Domains
2. أضف domain خاص بك
3. اتبع التعليمات لربط الـ DNS

---

## ✅ التحقق من النشر

بعد النشر، افتح الرابط وتحقق من:
- ✅ صفحة تسجيل الدخول تعمل
- ✅ التصفح بين الصفحات سلس
- ✅ Dark Mode يعمل
- ✅ الاتصال بـ Supabase يعمل

---

## 📚 روابط مفيدة
- [Vercel Documentation](https://vercel.com/docs)
- [React Deployment Guide](https://create-react-app.dev/docs/deployment/)
- [Supabase Setup](https://supabase.com/docs)

---

## 🎉 تهانينا!

تم نشر تطبيقك على Vercel بنجاح! 🚀
