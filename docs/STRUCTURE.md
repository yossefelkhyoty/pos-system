# هيكل المشروع - Project Structure

## نظرة عامة

تم تنظيم المشروع بشكل منفصل بين Backend و Frontend و Web لسهولة الصيانة والتطوير.

## Backend (`backend/`)

### الملفات الرئيسية

- **main.js**: نقطة البداية للتطبيق Electron
  - إدارة النوافذ
  - معالجات IPC
  - إعداد القوائم
  - تهيئة قاعدة البيانات

- **database.js**: إدارة قاعدة البيانات SQLite
  - الاتصال بقاعدة البيانات
  - إنشاء الجداول
  - عمليات CRUD

- **sync.js**: مزامنة البيانات مع Supabase
  - فحص الاتصال
  - قائمة انتظار المزامنة
  - معالجة المزامنة

- **backup.js**: نظام النسخ الاحتياطي
  - نسخ احتياطي تلقائي
  - استعادة النسخ الاحتياطية
  - جدولة النسخ

- **preload.js**: Preload Script
  - جسر بين Main و Renderer
  - APIs آمنة

## Frontend (`frontend/`)

### الصفحات HTML

- **index.html**: الصفحة الرئيسية
  - تتبع المعاملات المالية
  - البحث والفلترة
  - ملخص مالي

- **products.html**: إدارة المنتجات
  - إضافة/تعديل/حذف المنتجات
  - تتبع المخزون
  - الفلترة حسب الفئة

- **customers.html**: إدارة العملاء
  - إضافة/تعديل/حذف العملاء
  - البحث عن العملاء
  - عرض الحسابات

- **customer.html**: صفحة حساب العميل
  - معاملات العميل
  - المدفوعات
  - الرصيد الحالي

- **alerts.html**: تنبيهات المخزون
  - المنتجات قليلة المخزون
  - إشعارات

### ملفات JavaScript

- **renderer.js**: منطق الصفحة الرئيسية
- **products.js**: منطق إدارة المنتجات
- **customers.js**: منطق إدارة العملاء
- **customer.js**: منطق صفحة العميل

### الموارد (Assets)

- **css/**: ملفات التنسيق
  - styles.css: التنسيقات العامة
  - loky.css: تنسيقات خاصة

- **img/**: الصور والأيقونات
  - icon.ico: أيقونة التطبيق

## Web (`web/`)

تطبيق React منفصل للوصول عبر المتصفح.

### الملفات الرئيسية

- **src/App.jsx**: المكون الرئيسي
- **src/AdminApp.jsx**: لوحة التحكم
- **src/CustomerPortal.jsx**: بوابة العميل
- **src/supabaseClient.jsx**: عميل Supabase

## Shared (`shared/`)

ملفات مشتركة بين Backend و Frontend (إن وجدت).

## Docs (`docs/`)

- **STRUCTURE.md**: هذا الملف
- **supabase_migration_add_time_to_payments.sql**: سكريبتات الهجرة
- **syncCustomers.mjs**: سكريبتات المزامنة

## مسارات الملفات

### من Backend إلى Frontend

```javascript
// في main.js
path.join(__dirname, '../../frontend/src/index.html')
path.join(__dirname, '../../frontend/assets/img/icon.ico')
```

### من Frontend إلى Assets

```html
<!-- في HTML -->
<link rel="stylesheet" href="../assets/css/styles.css">
```

### قاعدة البيانات

```javascript
// في main.js
path.join(__dirname, '../../pos_system.db')
```

## أفضل الممارسات

1. **الفصل بين الاهتمامات**: Backend و Frontend منفصلان تماماً
2. **المسارات النسبية**: استخدام `path.join()` للمسارات
3. **الملفات المشتركة**: وضعها في `shared/`
4. **التوثيق**: توثيق كل ميزة جديدة

