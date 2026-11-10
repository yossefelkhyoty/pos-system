-- ============================================
-- إضافة عمود time لجدول payments في Supabase
-- ============================================

-- التحقق من وجود العمود وإضافته إذا لم يكن موجوداً
DO $$ 
BEGIN
    -- إضافة عمود time إذا لم يكن موجوداً
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='payments' 
        AND column_name='time'
    ) THEN
        ALTER TABLE payments 
        ADD COLUMN time TEXT;
        
        RAISE NOTICE 'تم إضافة عمود time بنجاح';
    ELSE
        RAISE NOTICE 'عمود time موجود بالفعل';
    END IF;
END $$;

-- التحقق من النتيجة
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'payments'
ORDER BY ordinal_position;

