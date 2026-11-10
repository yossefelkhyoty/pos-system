-- ============================================
-- Complete Supabase Schema for Financial Tracker
-- كود Supabase الكامل لجميع الجداول
-- ============================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. Products Table (جدول المنتجات)
-- ============================================
CREATE TABLE IF NOT EXISTS products (
    id BIGSERIAL PRIMARY KEY,
    serial_number TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    wholesale_price DECIMAL(10, 2) NOT NULL,
    purchase_price DECIMAL(10, 2) DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 0,
    min_quantity INTEGER NOT NULL DEFAULT 0,
    category TEXT NOT NULL DEFAULT '',
    last_modified TIMESTAMPTZ,
    is_deleted BOOLEAN DEFAULT FALSE,
    sync_status TEXT DEFAULT 'synced',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster searches
CREATE INDEX IF NOT EXISTS idx_products_serial_number ON products(serial_number);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_is_deleted ON products(is_deleted);

-- ============================================
-- 2. Customers Table (جدول العملاء)
-- ============================================
CREATE TABLE IF NOT EXISTS customers (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    amount_due DECIMAL(10, 2) DEFAULT 0,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    last_modified TIMESTAMPTZ,
    is_deleted BOOLEAN DEFAULT FALSE,
    sync_status TEXT DEFAULT 'synced',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for customers
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_is_deleted ON customers(is_deleted);
CREATE INDEX IF NOT EXISTS idx_customers_auth_id ON customers(auth_id);

-- ============================================
-- 3. Sales Table (جدول المبيعات)
-- ============================================
CREATE TABLE IF NOT EXISTS sales (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
    product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    quantity INTEGER NOT NULL,
    total DECIMAL(10, 2) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_modified TIMESTAMPTZ,
    is_deleted BOOLEAN DEFAULT FALSE,
    sync_status TEXT DEFAULT 'synced',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for sales
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_product_id ON sales(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
CREATE INDEX IF NOT EXISTS idx_sales_is_deleted ON sales(is_deleted);

-- ============================================
-- 4. Payments Table (جدول المدفوعات)
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'wallet')),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    time TIME,
    notes TEXT,
    last_modified TIMESTAMPTZ,
    is_deleted BOOLEAN DEFAULT FALSE,
    sync_status TEXT DEFAULT 'synced',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(date);
CREATE INDEX IF NOT EXISTS idx_payments_is_deleted ON payments(is_deleted);

-- ============================================
-- 5. Transactions Table (جدول المعاملات المالية)
-- ============================================
CREATE TABLE IF NOT EXISTS transactions (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    item TEXT,
    account DECIMAL(10, 2) DEFAULT 0,
    withdraw DECIMAL(10, 2) DEFAULT 0,
    notes TEXT,
    last_modified TIMESTAMPTZ,
    is_deleted BOOLEAN DEFAULT FALSE,
    sync_status TEXT DEFAULT 'synced',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for transactions
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_item ON transactions(item);
CREATE INDEX IF NOT EXISTS idx_transactions_is_deleted ON transactions(is_deleted);

-- ============================================
-- 6. Customer Transactions Table (جدول معاملات العملاء)
-- ============================================
CREATE TABLE IF NOT EXISTS customer_transactions (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT REFERENCES customers(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    time TIME,
    item TEXT,
    price DECIMAL(10, 2),
    quantity INTEGER DEFAULT 1,
    total DECIMAL(10, 2),
    type TEXT DEFAULT 'sale' CHECK (type IN ('sale', 'return')),
    product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
    notes TEXT,
    last_modified TIMESTAMPTZ,
    is_deleted BOOLEAN DEFAULT FALSE,
    sync_status TEXT DEFAULT 'synced',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for customer_transactions
CREATE INDEX IF NOT EXISTS idx_customer_transactions_customer_id ON customer_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_date ON customer_transactions(date);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_type ON customer_transactions(type);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_product_id ON customer_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_is_deleted ON customer_transactions(is_deleted);

-- ============================================
-- 7. Row Level Security (RLS) Policies
-- ============================================

-- Enable RLS on all tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_transactions ENABLE ROW LEVEL SECURITY;

-- Policies for Products (Allow all for authenticated users, or disable RLS for service role)
CREATE POLICY "Enable all operations for service role" ON products
    FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Enable all operations for service role" ON customers
    FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Enable all operations for service role" ON sales
    FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Enable all operations for service role" ON payments
    FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Enable all operations for service role" ON transactions
    FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Enable all operations for service role" ON customer_transactions
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- If you want to use RLS with authenticated users, use these policies instead:
-- CREATE POLICY "Users can view their own data" ON customers
--     FOR SELECT
--     USING (auth.uid() = auth_id);
-- 
-- CREATE POLICY "Users can update their own data" ON customers
--     FOR UPDATE
--     USING (auth.uid() = auth_id);

-- ============================================
-- 8. Functions and Triggers
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to auto-update updated_at
CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sales_updated_at
    BEFORE UPDATE ON sales
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customer_transactions_updated_at
    BEFORE UPDATE ON customer_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 9. Views (Optional - for easier queries)
-- ============================================

-- View for active products (not deleted)
CREATE OR REPLACE VIEW active_products AS
SELECT * FROM products
WHERE is_deleted = FALSE;

-- View for active customers (not deleted)
CREATE OR REPLACE VIEW active_customers AS
SELECT * FROM customers
WHERE is_deleted = FALSE;

-- View for customer balance summary
CREATE OR REPLACE VIEW customer_balance_summary AS
SELECT 
    c.id,
    c.name,
    c.phone,
    COALESCE(SUM(ct.total), 0) as total_sales,
    COALESCE(SUM(p.amount), 0) as total_payments,
    COALESCE(SUM(ct.total), 0) - COALESCE(SUM(p.amount), 0) as balance
FROM customers c
LEFT JOIN customer_transactions ct ON c.id = ct.customer_id AND ct.is_deleted = FALSE
LEFT JOIN payments p ON c.id = p.customer_id AND p.is_deleted = FALSE
WHERE c.is_deleted = FALSE
GROUP BY c.id, c.name, c.phone;

-- View for low stock products
CREATE OR REPLACE VIEW low_stock_products AS
SELECT * FROM products
WHERE is_deleted = FALSE
AND quantity <= min_quantity;

-- ============================================
-- 10. Sample Data (Optional - for testing)
-- ============================================

-- Uncomment to insert sample data:

-- INSERT INTO products (serial_number, name, price, wholesale_price, purchase_price, quantity, min_quantity, category)
-- VALUES 
--     ('PRD001', 'Product 1', 100.00, 80.00, 50.00, 10, 5, 'Category A'),
--     ('PRD002', 'Product 2', 200.00, 160.00, 100.00, 3, 5, 'Category B');

-- ============================================
-- END OF SCHEMA
-- ============================================

-- To verify tables were created:
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_type = 'BASE TABLE'
-- ORDER BY table_name;
