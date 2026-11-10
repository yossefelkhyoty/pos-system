# Supabase Schema - Complete Database Setup

## 📋 الملفات المتوفرة

1. **supabase_schema.sql** - الكود الكامل لإنشاء جميع الجداول
2. **supabase_setup_guide.md** - دليل الإعداد خطوة بخطوة
3. **supabase_migration.sql** - ملاحظات حول نقل البيانات

## 🚀 الاستخدام السريع

### 1. إنشاء المشروع في Supabase

- اذهب إلى [supabase.com](https://supabase.com)
- أنشئ مشروع جديد

### 2. تشغيل الكود

1. افتح **SQL Editor** في Supabase Dashboard
2. انسخ محتوى `supabase_schema.sql`
3. الصق الكود واضغط **Run**

### 3. الحصول على المفاتيح

- **Settings** → **API**
- انسخ `Project URL` و `anon/public key`

### 4. إعداد ملف .env

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=your-anon-key
```

## 📊 الجداول المتضمنة

1. ✅ **products** - المنتجات والمخزون
2. ✅ **customers** - العملاء
3. ✅ **sales** - المبيعات
4. ✅ **payments** - المدفوعات
5. ✅ **transactions** - المعاملات المالية
6. ✅ **customer_transactions** - معاملات العملاء

## 🔐 الأمان

- Row Level Security (RLS) مفعل
- جميع الجداول محمية
- يمكن تخصيص السياسات حسب الحاجة

## 📝 الميزات

- ✅ Indexes لتحسين الأداء
- ✅ Foreign Keys مع ON DELETE CASCADE
- ✅ Triggers لتحديث timestamps
- ✅ Views للاستعلامات السهلة
- ✅ Constraints للتحقق من البيانات

## 🐛 استكشاف الأخطاء

راجع `supabase_setup_guide.md` للمزيد من التفاصيل.
