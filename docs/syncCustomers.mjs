import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import Database from './database.js'; // لو عندك ملف database.js

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_KEY; // هنا استخدم SUPABASE_KEY بدل SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('❌ تأكد من تعريف SUPABASE_URL و SUPABASE_KEY في ملف .env');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function syncCustomers() {
  const db = new Database();
  await db.connect();

  const customers = await db.all('SELECT * FROM customers');

  for (const customer of customers) {
    try {
      // إنشاء مستخدم جديد في Supabase لو مش موجود
      const { user, error } = await supabase.auth.admin.createUser({
        email: `${customer.id}@customer.com`,
        password: `${customer.id}`, // أو استخدم كلمة سر مؤقتة
        email_confirm: true,
        user_metadata: {
          name: customer.name,
          role: 'customer',
        }
      });

      if (error && error.code === 'email_exists') {
        // لو المستخدم موجود، نجيب الـ UID
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const foundUser = users.find(u => u.email === `${customer.id}@customer.com`);

        if (!foundUser) {
          console.log('لم يتم العثور على المستخدم:', customer.id);
          continue;
        }
        await db.run(
          'UPDATE customers SET auth_id = ? WHERE id = ?',
          [foundUser.id, customer.id]
        );
        console.log(`تم تحديث auth_id للعميل: ${customer.name}`);
      } else if (user) {
        // خزّن UID الجديد في جدول العملاء
        await db.run(
          'UPDATE customers SET auth_id = ? WHERE id = ?',
          [user.id, customer.id]
        );
        console.log(`تم إنشاء المستخدم وربطه بالعميل: ${customer.name}`);
      }
    } catch (err) {
      console.error('خطأ في معالجة العميل:', customer.name, err);
    }
  }

  await db.close();
}

syncCustomers().then(() => {
  console.log('تم مزامنة كل العملاء بنجاح ✅');
}).catch(console.error);
