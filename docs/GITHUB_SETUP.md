# دليل رفع المشروع على GitHub - GitHub Setup Guide

## الخطوات الأساسية

### 1. إنشاء مستودع جديد على GitHub

1. اذهب إلى [GitHub](https://github.com)
2. اضغط على زر **"New"** أو **"+"** في الزاوية العلوية
3. املأ التفاصيل:
   - **Repository name**: `financial-tracker` (أو أي اسم تفضله)
   - **Description**: "Financial Management System built with Electron"
   - اختر **Private** أو **Public** حسب رغبتك
   - **لا** تضع علامة على "Initialize this repository with a README"
4. اضغط **"Create repository"**

### 2. تثبيت Git (إذا لم يكن مثبتاً)

```bash
# تحقق من تثبيت Git
git --version

# إذا لم يكن مثبتاً، حمله من:
# https://git-scm.com/downloads
```

### 3. تهيئة Git في المشروع

افتح Terminal في مجلد المشروع وقم بتنفيذ الأوامر التالية:

```bash
# الانتقال إلى مجلد المشروع
cd "D:\0)Projects\app"

# تهيئة Git
git init

# إضافة جميع الملفات
git add .

# عمل Commit أولي
git commit -m "Initial commit: Financial Tracker project"
```

### 4. إضافة Remote Repository

```bash
# استبدل YOUR_USERNAME و REPOSITORY_NAME بقيمك
git remote add origin https://github.com/YOUR_USERNAME/REPOSITORY_NAME.git

# مثال:
# git remote add origin https://github.com/youssef/financial-tracker.git
```

### 5. رفع المشروع

```bash
# رفع المشروع إلى GitHub
git branch -M main
git push -u origin main
```

## الأوامر الكاملة (نسخ ولصق)

```bash
# 1. تهيئة Git
git init

# 2. إضافة جميع الملفات
git add .

# 3. عمل Commit
git commit -m "Initial commit: Financial Tracker project"

# 4. إضافة Remote (استبدل القيم)
git remote add origin https://github.com/YOUR_USERNAME/REPOSITORY_NAME.git

# 5. رفع المشروع
git branch -M main
git push -u origin main
```

## تحديث المشروع لاحقاً

عندما تقوم بتعديلات جديدة:

```bash
# إضافة التغييرات
git add .

# عمل Commit
git commit -m "Description of your changes"

# رفع التغييرات
git push
```

## نصائح مهمة

### 1. ملف .gitignore

تأكد من وجود ملف `.gitignore` في المشروع (موجود بالفعل) لحماية:
- `node_modules/`
- `.env` (مفاتيح API)
- `*.db` (قاعدة البيانات)
- ملفات البناء

### 2. ملف .env

**مهم جداً**: لا ترفع ملف `.env` على GitHub لأنه يحتوي على مفاتيح API السرية.

### 3. قاعدة البيانات

لا ترفع `pos_system.db` على GitHub. يمكن للمستخدمين إنشاؤها تلقائياً.

## حل المشاكل الشائعة

### خطأ: "remote origin already exists"

```bash
# حذف الـ remote القديم
git remote remove origin

# إضافة الـ remote الجديد
git remote add origin https://github.com/YOUR_USERNAME/REPOSITORY_NAME.git
```

### خطأ: "Authentication failed"

```bash
# استخدم Personal Access Token بدلاً من كلمة المرور
# أو استخدم GitHub CLI
gh auth login
```

### خطأ: "Large files"

```bash
# إذا كان لديك ملفات كبيرة، استخدم Git LFS
git lfs install
git lfs track "*.db"
git add .gitattributes
```

## استخدام GitHub CLI (أسهل طريقة)

### تثبيت GitHub CLI

```bash
# Windows (باستخدام Chocolatey)
choco install gh

# أو حمله من: https://cli.github.com/
```

### استخدام GitHub CLI

```bash
# تسجيل الدخول
gh auth login

# إنشاء مستودع جديد ورفع المشروع
gh repo create financial-tracker --public --source=. --remote=origin --push
```

## إضافة معلومات إضافية

### 1. إضافة License

```bash
# إنشاء ملف LICENSE
# يمكنك استخدام: https://choosealicense.com/
```

### 2. إضافة Badges (اختياري)

يمكنك إضافة badges في README.md:

```markdown
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)
```

### 3. إضافة Topics

في صفحة المستودع على GitHub:
- اضغط على **⚙️ Settings**
- اذهب إلى **Topics**
- أضف: `electron`, `sqlite`, `financial-management`, `javascript`

## التحقق من النجاح

بعد الرفع، تأكد من:
1. ✅ جميع الملفات موجودة على GitHub
2. ✅ README.md يظهر بشكل صحيح
3. ✅ ملف `.env` غير موجود (محمي بواسطة .gitignore)
4. ✅ `node_modules/` غير موجود

## الأمان

### قبل الرفع، تأكد من:

- [ ] ملف `.env` في `.gitignore`
- [ ] لا توجد مفاتيح API في الكود
- [ ] قاعدة البيانات غير مرفوعة
- [ ] ملفات البناء في `.gitignore`

---

**ملاحظة**: إذا كنت تستخدم حساب GitHub لأول مرة، قد تحتاج إلى إنشاء Personal Access Token بدلاً من استخدام كلمة المرور.

