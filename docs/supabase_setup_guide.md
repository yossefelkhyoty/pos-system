# دليل إعداد Supabase - Supabase Setup Guide

## خطوات إعداد Supabase

### 1. إنشاء مشروع Supabase

1. اذهب إلى [Supabase](https://supabase.com)
2. سجل الدخول أو أنشئ حساب جديد
3. اضغط **"New Project"**
4. املأ البيانات:
   - **Name**: financial-tracker
   - **Database Password**: اختر كلمة مرور قوية
   - **Region**: اختر المنطقة الأقرب
5. اضغط **"Create new project"**

### 2. تشغيل SQL Schema

1. بعد إنشاء المشروع، اذهب إلى **SQL Editor**
2. اضغط **"New Query"**
3. انسخ محتوى ملف `docs/supabase_schema.sql`
4. الصق الكود في المحرر
5. اضغط **"Run"** أو **Ctrl+Enter**

### 3. الحصول على API Keys

1. اذهب إلى **Settings** → **API**
2. انسخ:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: المفتاح العام

### 4. إعداد ملف .env

أنشئ ملف `.env` في المجلد الرئيسي:

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=your-anon-key-here
```

### 5. اختبار الاتصال

شغّل التطبيق:

```bash
npm start
```

تحقق من أن المزامنة تعمل بشكل صحيح.

## Row Level Security (RLS)

### الإعداد الافتراضي

الكود الموجود يفترض استخدام **Service Role Key** للوصول الكامل.

### إذا كنت تريد استخدام RLS مع المستخدمين:

1. قم بتعطيل السياسات الحالية
2. استخدم السياسات المخصصة في الملف

## مزامنة البيانات

### من SQLite إلى Supabase

الكود في `backend/src/sync.js` يقوم بمزامنة البيانات تلقائياً.

### يدوياً

يمكنك استخدام السكريبتات في `docs/` لمزامنة البيانات.

## المشاكل الشائعة

### خطأ: "relation does not exist"

- تأكد من تشغيل `supabase_schema.sql` بالكامل
- تحقق من أن جميع الجداول تم إنشاؤها

### خطأ: "permission denied"

- تحقق من RLS Policies
- استخدم Service Role Key بدلاً من anon key

### خطأ: "duplicate key"

- تحقق من أن `serial_number` في products فريد
- تأكد من عدم وجود بيانات مكررة

## التحقق من البيانات

### في Supabase Dashboard

1. اذهب إلى **Table Editor**
2. يجب أن ترى جميع الجداول:
   - products
   - customers
   - sales
   - payments
   - transactions
   - customer_transactions

### من خلال SQL Editor

```sql
-- عرض جميع المنتجات
SELECT * FROM products;

-- عرض جميع العملاء
SELECT * FROM customers;

-- عرض رصيد العملاء
SELECT * FROM customer_balance_summary;
```

## ملاحظات مهمة

1. **Backup**: احتفظ بنسخة احتياطية من قاعدة البيانات
2. **Security**: لا تشارك Service Role Key أبداً
3. **Performance**: استخدم الفهارس (Indexes) لتحسين الأداء
4. **Monitoring**: راقب استخدام API من Dashboard

---

للمزيد من المعلومات: [Supabase Documentation](https://supabase.com/docs)
