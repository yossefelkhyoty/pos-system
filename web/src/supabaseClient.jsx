// src/supabaseClient.jsx
import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && process.env?.REACT_APP_SUPABASE_URL) ||
  '';

const supabaseKey =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && process.env?.REACT_APP_SUPABASE_ANON_KEY) ||
  '';

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ Supabase credentials missing! Check your .env file in the web folder.');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: localStorage
  }
});

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
