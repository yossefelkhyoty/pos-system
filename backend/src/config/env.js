// backend/src/config/env.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const config = {
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_KEY || '',
  supabaseAdminEmail: process.env.SUPABASE_ADMIN_EMAIL || '',
  supabaseAdminPassword: process.env.SUPABASE_ADMIN_PASSWORD || '',
  webPortalUrl: (process.env.WEB_PORTAL_URL || 'https://your-domain.vercel.app').replace(/\/+$/, ''),
  dbPath: path.join(__dirname, '../../../pos_system.db')
};

module.exports = config;

