// src/AdminApp.jsx - النسخة المصححة
import React, { useState, useEffect } from 'react';
import { supabase, checkSupabaseConnection } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import { useDarkMode } from './useDarkMode';

import './AdminApp.css';

function AdminApp() {
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [authError, setAuthError] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState('all');
  const [loading, setLoading] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [connectionChecked, setConnectionChecked] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('online');
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [darkMode, toggleDarkMode] = useDarkMode();

  const navigate = useNavigate();

  // التحقق من اتصال Supabase مرة واحدة عند التحميل
  useEffect(() => {
    const initializeApp = async () => {
      // التحقق من اتصال Supabase
      const connectionResult = await checkSupabaseConnection();
      if (!connectionResult.success) {
        setConnectionError(connectionResult.message);
        setConnectionChecked(true);
        return;
      }

      setConnectionChecked(true);

      // التحقق من بيانات تسجيل الدخول المحفوظة
      const savedCredentials = localStorage.getItem('adminCredentials');
      if (savedCredentials) {
        try {
          const { email: savedEmail, password: savedPassword } = JSON.parse(savedCredentials);
          setEmail(savedEmail);
          setPassword(savedPassword);
          setRememberMe(true);
          await handleSignIn(savedEmail, savedPassword);
        } catch (error) {
          console.error('خطأ في تحميل البيانات المحفوظة:', error);
          localStorage.removeItem('adminCredentials');
        }
      } else {
        // التحقق من الجلسة الحالية
        await checkCurrentSession();
      }
    };

    initializeApp();
    
    // طلب إذن الإشعارات
    requestNotificationPermission();
    
    // مراقبة حالة الاتصال
    const handleOnline = () => setConnectionStatus('online');
    const handleOffline = () => setConnectionStatus('offline');
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // فحص المنتجات منخفضة المخزون كل 30 ثانية
    const checkLowStockInterval = setInterval(() => {
      checkLowStockProducts();
    }, 30000);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(checkLowStockInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkCurrentSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await loadData();
      }
    } catch (error) {
      console.error('خطأ في التحقق من الجلسة:', error);
    }
  };

  // طلب إذن الإشعارات
  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          console.log('تم منح إذن الإشعارات');
        }
      } catch (error) {
        console.error('خطأ في طلب إذن الإشعارات:', error);
      }
    }
  };

  // فحص المنتجات منخفضة المخزون
  const checkLowStockProducts = async () => {
    try {
      const { data: productsData, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_deleted', false);

      if (error) throw error;

      const lowStock = (productsData || []).filter(
        product => product.quantity <= product.min_quantity
      );

      // إرسال إشعار إذا كان هناك منتجات منخفضة المخزون
      if (lowStock.length > 0 && Notification.permission === 'granted') {
        const productNames = lowStock.map(p => p.name).join(', ');
        new Notification('⚠️ تنبيه: منتجات منخفضة المخزون', {
          body: `هناك ${lowStock.length} منتج منخفض المخزون: ${productNames}`,
          icon: '/favicon.ico',
          tag: 'low-stock',
          requireInteraction: true
        });
      }

      setLowStockProducts(lowStock);
    } catch (error) {
      console.error('خطأ في فحص المنتجات منخفضة المخزون:', error);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setAuthError('');

      // تحميل المنتجات
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*');

      if (productsError) throw productsError;
      setProducts(productsData || []);
      
      // فحص المنتجات منخفضة المخزون
      await checkLowStockProducts();

      // تحميل العملاء
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('*');

      if (customersError) throw customersError;

      // حساب الرصيد الكلي لكل عميل
      const customersWithBalance = await Promise.all(
        (customersData || []).map(async (customer) => {
          try {
            const balance = await calculateCustomerBalance(customer.id);
            return { ...customer, totalBalance: balance };
          } catch (error) {
            console.error(`خطأ في حساب رصيد العميل ${customer.id}:`, error);
            return { ...customer, totalBalance: 0 };
          }
        })
      );

      setCustomers(customersWithBalance);
    } catch (error) {
      console.error('خطأ في تحميل البيانات:', error);
      setAuthError('فشل في تحميل البيانات من قاعدة البيانات');
    } finally {
      setLoading(false);
    }
  };

  const calculateCustomerBalance = async (customerId) => {
    try {
      // جلب جميع المعاملات للعميل
      const { data: transactionsData, error: transactionsError } = await supabase
        .from('customer_transactions')
        .select('*')
        .eq('customer_id', customerId);

      if (transactionsError) throw transactionsError;

      // جلب جميع المدفوعات للعميل
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('*')
        .eq('customer_id', customerId);

      if (paymentsError) throw paymentsError;

      // حساب الرصيد الكلي
      const totalSales = (transactionsData || [])
        .filter(t => t.type === 'sale')
        .reduce((sum, t) => sum + (Number(t.total) || 0), 0);

      const totalReturns = (transactionsData || [])
        .filter(t => t.type === 'return')
        .reduce((sum, t) => sum + Math.abs(Number(t.total) || 0), 0);

      const totalPayments = (paymentsData || [])
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      return totalSales - totalReturns - totalPayments;
    } catch (err) {
      console.error('خطأ في حساب رصيد العميل:', err);
      return 0;
    }
  };

  const handleSignIn = async (email, password) => {
    try {
      setAuthError('');
      setLoading(true);

      console.log('محاولة تسجيل الدخول بـ:', email);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password
      });

      if (error) {
        console.error('خطأ المصادقة:', error);

        if (error.message.includes('Invalid login credentials')) {
          setAuthError('⚠️ البريد الإلكتروني أو كلمة المرور غير صحيحة');
        } else if (error.message.includes('Email not confirmed')) {
          setAuthError('⚠️ يرجى تأكيد البريد الإلكتروني أولاً');
        } else {
          setAuthError(`❌ خطأ في تسجيل الدخول: ${error.message}`);
        }
        return false;
      }

      console.log('تم تسجيل الدخول بنجاح:', data.user);
      setUser(data.user);

      // حفظ بيانات تسجيل الدخول إذا تم اختيار "تذكرني"
      if (rememberMe) {
        localStorage.setItem('adminCredentials', JSON.stringify({
          email: email,
          password: password
        }));
      } else {
        localStorage.removeItem('adminCredentials');
      }

      await loadData();
      return true;
    } catch (err) {
      console.error('خطأ غير متوقع:', err);
      setAuthError('❌ خطأ في الاتصال بالسيرفر - تأكد من اتصال الإنترنت');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    if (e) {
      e.preventDefault();
    }
    await handleSignIn(email, password);
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setAuthError('خطأ في تسجيل الخروج: ' + error.message);
      } else {
        setUser(null);
        setProducts([]);
        setCustomers([]);
        localStorage.removeItem('adminCredentials');
      }
    } catch (error) {
      console.error('خطأ في تسجيل الخروج:', error);
    }
  };

  // فلترة البيانات
  const filteredData = () => {
    if (activeTab === 'products') {
      return { products: filterProducts(products), customers: [] };
    } else if (activeTab === 'customers') {
      return { products: [], customers: filterCustomers(customers) };
    } else {
      return { products: filterProducts(products), customers: filterCustomers(customers) };
    }
  };

  const filterProducts = (productsList) => {
    if (!searchTerm) return productsList;

    return productsList.filter(product =>
      product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.serial_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const filterCustomers = (customersList) => {
    if (!searchTerm) return customersList;

    return customersList.filter(customer => {
      const nameMatch = customer.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const phoneMatch = customer.phone?.includes(searchTerm);

      if (searchType === 'name') return nameMatch;
      if (searchType === 'phone') return phoneMatch;

      return nameMatch || phoneMatch;
    });
  };

  const copyLink = (customer) => {
    const customerName = customer.name.replace(/\s+/g, '-');
    const link = `${window.location.origin}/customer/${customerName}-${customer.id}`;

    navigator.clipboard.writeText(link)
      .then(() => alert('✅ تم نسخ الرابط!'))
      .catch(err => {
        console.error('فشل النسخ:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = link;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('✅ تم نسخ الرابط!');
      });
  };

  const { products: filteredProducts, customers: filteredCustomers } = filteredData();

  if (!connectionChecked) {
    return (
      <div className="login-container" dir="rtl">
        <div className="loading">
          <div className="spinner"></div>
          <p>جاري التحقق من الاتصال...</p>
        </div>
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="login-container" dir="rtl">
        <div className="login-box">
          <h1>❌ خطأ في الاتصال</h1>
          <div className="error-message">
            <p>{connectionError}</p>
            <p>يرجى التحقق من:</p>
            <ul>
              <li>ملف .env وإعدادات Supabase</li>
              <li>اتصال الإنترنت</li>
              <li>أن المشروع مفعل في Supabase Dashboard</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={`login-container ${darkMode ? 'dark-mode' : ''}`} dir="rtl">
        <button 
          className="dark-mode-toggle-login"
          onClick={toggleDarkMode}
          title={darkMode ? 'الوضع الفاتح' : 'الوضع الداكن'}
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
        <div className="login-box">
          <h1>تسجيل الدخول إلى نظام علي الجداوي</h1>

          {authError && (
            <div className="error-message">
              {authError}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <input
                type="email"
                placeholder="البريد الإلكتروني"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="input-group password-group">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="كلمة المرور"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>

            <div className="remember-me">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <label htmlFor="rememberMe">تذكرني</label>
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'جاري التسجيل...' : 'تسجيل الدخول'}
            </button>
          </form>


        </div>
      </div>
    );
  }

  return (
    <div className={`admin-app ${darkMode ? 'dark-mode' : ''}`} dir="rtl">
      {/* حالة الاتصال */}
      <div className={`connection-status ${connectionStatus}`}>
        {connectionStatus === 'online' ? '🟢 متصل' : '🔴 غير متصل'}
      </div>
      
      <header>
        <h1>لوحة تحكم علي الجداوي</h1>
        <div className="header-actions">
          <button 
            className="dark-mode-toggle"
            onClick={toggleDarkMode}
            title={darkMode ? 'الوضع الفاتح' : 'الوضع الداكن'}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button onClick={signOut} disabled={loading}>
            {loading ? '...' : 'تسجيل الخروج'}
          </button>
        </div>
      </header>
      
      {/* إشعار المنتجات منخفضة المخزون */}
      {lowStockProducts.length > 0 && (
        <div className="low-stock-alert">
          <strong>⚠️ تنبيه:</strong> هناك {lowStockProducts.length} منتج منخفض المخزون
          <ul>
            {lowStockProducts.map(product => (
              <li key={product.id}>
                {product.name} - الكمية: {product.quantity} (الحد الأدنى: {product.min_quantity})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="nav-tabs">
        <button
          className={`nav-tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          الكل
        </button>
        <button
          className={`nav-tab ${activeTab === 'products' ? 'active' : ''}`}
          onClick={() => setActiveTab('products')}
        >
          المنتجات ({products.length})
        </button>
        <button
          className={`nav-tab ${activeTab === 'customers' ? 'active' : ''}`}
          onClick={() => setActiveTab('customers')}
        >
          العملاء ({customers.length})
        </button>
      </div>

      <div className="search-section">
        <input
          type="text"
          className="search-input"
          placeholder={activeTab === 'customers' ? "ابحث بالاسم أو الهاتف..." : "ابحث عن المنتجات..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        {(activeTab === 'customers' || activeTab === 'all') && (
          <div className="search-options">
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value)}
            >
              <option value="all">الكل</option>
              <option value="name">بالاسم</option>
              <option value="phone">بالهاتف</option>
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
          <p>جاري تحميل البيانات...</p>
        </div>
      ) : (
        <div className="dashboard">
          {(activeTab === 'all' || activeTab === 'products') && (
            <>
              <h2>المنتجات ({filteredProducts.length})</h2>
              {filteredProducts.length === 0 ? (
                <p className="no-data">لا توجد منتجات</p>
              ) : (
                <div className="products-list">
                  {filteredProducts.map(product => (
                    <div key={product.id} className="product-card">
                      <div className="product-header">
                        <h3>{product.name}</h3>
                        <span className="serial">{product.serial_number}</span>
                      </div>
                      <div className="price-section">
                        <span>السعر: {product.price} جنيها</span>
                        <span>السعر العملاء: {product.wholesale_price} جنيها</span>
                        <span>الكمية: {product.quantity}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {(activeTab === 'all' || activeTab === 'customers') && (
            <>
              <h2>العملاء ({filteredCustomers.length})</h2>
              {filteredCustomers.length === 0 ? (
                <p className="no-data">لا توجد عملاء</p>
              ) : (
                <div className="customers-list">
                  {filteredCustomers.map(customer => (
                    <div
                      key={customer.id}
                      className="customer-card"
                      onClick={() => {
                        const customerName = customer.name.replace(/\s+/g, '-');
                        navigate(`/customer/${customerName}-${customer.id}`);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <h3>{customer.name}</h3>
                      <p>الهاتف: {customer.phone || 'غير متوفر'}</p>
                      <div className={`balance ${customer.totalBalance >= 0 ? 'positive' : 'negative'}`}>
                        الرصيد الكلي: {customer.totalBalance?.toFixed(2)} جنيها
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyLink(customer);
                        }}
                      >
                        نسخ رابط العميل
                      </button>
                    </div>
                  ))}

                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminApp;