-- ============================================
-- Migration Script: SQLite to Supabase
-- سكريبت نقل البيانات من SQLite إلى Supabase
-- ============================================

-- This script is for reference only
-- Run the main schema.sql first, then migrate data using application code

-- ============================================
-- Notes:
-- ============================================
-- 1. SQLite uses INTEGER PRIMARY KEY AUTOINCREMENT
--    Supabase uses BIGSERIAL PRIMARY KEY
--
-- 2. SQLite uses TEXT for dates
--    Supabase uses DATE or TIMESTAMPTZ
--
-- 3. SQLite uses INTEGER for booleans (0/1)
--    Supabase uses BOOLEAN (true/false)
--
-- 4. SQLite uses REAL for decimals
--    Supabase uses DECIMAL(10, 2)
--
-- 5. Foreign keys in Supabase need explicit ON DELETE actions

-- ============================================
-- Data Type Conversions
-- ============================================

-- SQLite INTEGER → Supabase BIGINT
-- SQLite TEXT → Supabase TEXT
-- SQLite REAL → Supabase DECIMAL(10, 2)
-- SQLite INTEGER (boolean) → Supabase BOOLEAN
-- SQLite DATETIME → Supabase TIMESTAMPTZ

-- ============================================
-- Example Migration Queries (if migrating data)
-- ============================================

-- Products Migration Example:
-- INSERT INTO products (serial_number, name, price, wholesale_price, purchase_price, quantity, min_quantity, category, created_at)
-- SELECT 
--     serial_number,
--     name,
--     price,
--     wholesale_price,
--     COALESCE(purchase_price, 0),
--     quantity,
--     min_quantity,
--     category,
--     COALESCE(created_at, NOW())
-- FROM sqlite_products;

-- Customers Migration Example:
-- INSERT INTO customers (name, phone, amount_due, date, notes, created_at)
-- SELECT 
--     name,
--     phone,
--     amount_due,
--     date::DATE,
--     notes,
--     COALESCE(created_at, NOW())
-- FROM sqlite_customers;

-- ============================================
-- Important: Use application-level migration
-- ============================================
-- Instead of SQL migration, it's recommended to:
-- 1. Read data from SQLite
-- 2. Transform data types
-- 3. Insert into Supabase using the sync.js code
