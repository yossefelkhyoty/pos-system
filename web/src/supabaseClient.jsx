// src/supabaseClient.js - ملف جديد
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// تأكد من أن القيم موجودة
if (!supabaseUrl || !supabaseKey) {
  console.error('❌ إعدادات Supabase غير مكتملة في ملف .env');
  console.log('REACT_APP_SUPABASE_URL:', supabaseUrl ? 'موجود' : 'مفقود');
  console.log('REACT_APP_SUPABASE_ANON_KEY:', supabaseKey ? 'موجود' : 'مفقود');
}

// أنشئ client واحد فقط
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: localStorage
  }
});

// دالة للتحقق من الاتصال
export const checkSupabaseConnection = async () => {
  try {
    const { error } = await supabase.from('products').select('id').limit(1);
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    return { success: true, message: 'الاتصال مع Supabase يعمل بشكل جيد' };
  } catch (error) {
    return { success: false, message: `فشل الاتصال: ${error.message}` };
  }
};