// src/AdminApp.jsx
import React, { useState, useEffect } from 'react';
import { supabase, checkSupabaseConnection } from './supabaseClient';
import { useDarkMode } from './useDarkMode';
import {
  Package,
  Users,
  AlertTriangle,
  Moon,
  Sun,
  LogOut,
  Search,
  Eye,
  EyeOff,
  Copy,
  Check,
  RefreshCw,
  Phone,
  LayoutGrid,
  Wifi,
  WifiOff,
  ExternalLink,
  ShieldCheck,
  TrendingDown,
  Layers,
  Bell
} from 'lucide-react';

import './AdminApp.css';

function AdminApp() {
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [authError, setAuthError] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'products', 'customers', 'low-stock'
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState('all');
  const [loading, setLoading] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [connectionChecked, setConnectionChecked] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('online');
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [copiedCustomerId, setCopiedCustomerId] = useState(null);
  const [showLowStockBanner, setShowLowStockBanner] = useState(true);
  const [darkMode, toggleDarkMode] = useDarkMode();

  useEffect(() => {
    const initializeApp = async () => {
      const connectionResult = await checkSupabaseConnection();
      if (!connectionResult.success) {
        setConnectionError(connectionResult.message);
        setConnectionChecked(true);
        return;
      }

      setConnectionChecked(true);
      await checkCurrentSession();
    };

    initializeApp();
    requestNotificationPermission();

    const handleOnline = () => setConnectionStatus('online');
    const handleOffline = () => setConnectionStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const checkLowStockInterval = setInterval(() => {
      checkLowStockProducts();
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(checkLowStockInterval);
    };
  }, []);

  const checkCurrentSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await loadData();
      }
    } catch (error) {
      console.error('Session check error:', error);
    }
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (error) {
        console.error('Notification error:', error);
      }
    }
  };

  const checkLowStockProducts = async () => {
    try {
      const { data: productsData, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_deleted', false);

      if (error) throw error;

      const lowStock = (productsData || []).filter(
        (product) => Number(product.quantity) <= Number(product.min_quantity)
      );

      if (lowStock.length > 0 && Notification.permission === 'granted') {
        const productNames = lowStock.slice(0, 3).map((p) => p.name).join('، ');
        new Notification('⚠️ تنبيه: منتجات منخفضة المخزون', {
          body: `يوجد ${lowStock.length} منتج بحاجة لإعادة الشراء: ${productNames}`,
          icon: '/favicon.ico',
          tag: 'low-stock'
        });
      }

      setLowStockProducts(lowStock);
    } catch (error) {
      console.error('Low stock check error:', error);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setAuthError('');

      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*')
        .eq('is_deleted', false);

      if (productsError) throw productsError;
      setProducts(productsData || []);

      const lowStock = (productsData || []).filter(
        (product) => Number(product.quantity) <= Number(product.min_quantity)
      );
      setLowStockProducts(lowStock);

      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('*')
        .eq('is_deleted', false);

      if (customersError) throw customersError;

      // حساب رصيد كل عميل
      const customersWithBalance = await Promise.all(
        (customersData || []).map(async (customer) => {
          try {
            const balance = await calculateCustomerBalance(customer.id);
            return { ...customer, totalBalance: balance };
          } catch (error) {
            return { ...customer, totalBalance: Number(customer.amount_due) || 0 };
          }
        })
      );

      setCustomers(customersWithBalance);
    } catch (error) {
      console.error('Load data error:', error);
      setAuthError('فشل في تحميل البيانات من قاعدة البيانات');
    } finally {
      setLoading(false);
    }
  };

  const calculateCustomerBalance = async (customerId) => {
    try {
      const { data: trxData } = await supabase
        .from('customer_transactions')
        .select('*')
        .eq('customer_id', customerId)
        .eq('is_deleted', false);

      const { data: payData } = await supabase
        .from('payments')
        .select('*')
        .eq('customer_id', customerId)
        .eq('is_deleted', false);

      const totalSales = (trxData || [])
        .filter((t) => t.type === 'sale')
        .reduce((sum, t) => sum + (Number(t.total) || 0), 0);

      const totalReturns = (trxData || [])
        .filter((t) => t.type === 'return')
        .reduce((sum, t) => sum + Math.abs(Number(t.total) || 0), 0);

      const totalPayments = (payData || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      return totalSales - totalReturns - totalPayments;
    } catch (err) {
      return 0;
    }
  };

  const handleSignIn = async (e) => {
    if (e) e.preventDefault();
    try {
      setAuthError('');
      setLoading(true);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setAuthError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
        } else {
          setAuthError(`خطأ في تسجيل الدخول: ${error.message}`);
        }
        return false;
      }

      if (data?.user) {
        setUser(data.user);
        await loadData();
        return true;
      }
      return false;
    } catch (error) {
      setAuthError('حدث خطأ غير متوقع أثناء تسجيل الدخول');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);
      await supabase.auth.signOut();
      setUser(null);
      setProducts([]);
      setCustomers([]);
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyCustomerLink = (customer) => {
    const tokenOrSlug = customer.portal_token || `${customer.name.replace(/\s+/g, '-')}-${customer.id}`;
    const link = `${window.location.origin}/customer/${tokenOrSlug}`;

    navigator.clipboard.writeText(link).then(() => {
      setCopiedCustomerId(customer.id);
      setTimeout(() => setCopiedCustomerId(null), 2500);
    }).catch(() => {
      const textArea = document.createElement('textarea');
      textArea.value = link;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedCustomerId(customer.id);
      setTimeout(() => setCopiedCustomerId(null), 2500);
    });
  };

  // فلترة البيانات
  const filterProducts = (list) => {
    let result = list;
    if (activeTab === 'low-stock') {
      result = result.filter((p) => Number(p.quantity) <= Number(p.min_quantity));
    }
    if (!searchTerm) return result;
    return result.filter(
      (p) =>
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.serial_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const filterCustomers = (list) => {
    if (activeTab === 'low-stock') return [];
    if (!searchTerm) return list;
    return list.filter((c) => {
      const nameMatch = c.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const phoneMatch = c.phone?.includes(searchTerm);
      if (searchType === 'name') return nameMatch;
      if (searchType === 'phone') return phoneMatch;
      return nameMatch || phoneMatch;
    });
  };

  const filteredProducts = filterProducts(products);
  const filteredCustomers = filterCustomers(customers);

  // شاشة التحقق
  if (!connectionChecked) {
    return (
      <div className="login-container" dir="rtl">
        <div className="loading">
          <div className="spinner"></div>
          <p>جاري التحقق من الاتصال السحابي...</p>
        </div>
      </div>
    );
  }

  // خطأ الاتصال
  if (connectionError) {
    return (
      <div className="login-container" dir="rtl">
        <div className="login-box">
          <div className="error-icon-box">
            <AlertTriangle size={48} color="#ef4444" />
          </div>
          <h1>تعذر الاتصال بـ Supabase</h1>
          <div className="error-message">
            <p>{connectionError}</p>
            <p className="mt-2 text-sm text-gray-400">تأكد من صحة المفاتيح في ملف .env وتوفر اتصال بالإنترنت.</p>
          </div>
          <button className="login-btn mt-4" onClick={() => window.location.reload()}>
            <RefreshCw size={18} className="inline ml-2" /> إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  // شاشة تسجيل الدخول
  if (!user) {
    return (
      <div className={`login-container ${darkMode ? 'dark-mode' : ''}`} dir="rtl">
        <button
          className="dark-mode-toggle-login"
          onClick={toggleDarkMode}
          title={darkMode ? 'الوضع الفاتح' : 'الوضع الداكن'}
        >
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <div className="login-box">
          <div className="brand-logo">
            <ShieldCheck size={40} className="brand-icon" />
          </div>
          <h1>لوحة إدارة علي الجداوي</h1>
          <p className="login-subtitle">سجل الدخول بحساب الأدمن لإدارة المبيعات والعملاء</p>

          {authError && <div className="error-message">{authError}</div>}

          <form onSubmit={handleSignIn}>
            <div className="input-group">
              <input
                type="email"
                placeholder="البريد الإلكتروني للأدمن"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="input-group password-group">
              <input
                type={showPassword ? 'text' : 'password'}
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
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? <RefreshCw className="animate-spin inline ml-2" size={18} /> : 'تسجيل الدخول'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // الواجهة الرئيسية للأدمن
  return (
    <div className={`admin-app ${darkMode ? 'dark-mode' : ''}`} dir="rtl">
      {/* شريط الحالة والاتصال */}
      <div className={`connection-status-pill ${connectionStatus}`}>
        {connectionStatus === 'online' ? (
          <>
            <Wifi size={14} /> <span>متصل بالسحابة</span>
          </>
        ) : (
          <>
            <WifiOff size={14} /> <span>غير متصل</span>
          </>
        )}
      </div>

      {/* الهيدر العلوي */}
      <header className="modern-header">
        <div className="header-info">
          <h1>لوحة تحكم المتجر</h1>
          <p className="welcome-admin">مرحباً بك، {user.email}</p>
        </div>

        <div className="header-actions">
          <button
            className="action-icon-btn"
            onClick={loadData}
            title="تحديث البيانات"
            disabled={loading}
          >
            <RefreshCw size={19} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            className="action-icon-btn"
            onClick={toggleDarkMode}
            title={darkMode ? 'الوضع الفاتح' : 'الوضع الداكن'}
          >
            {darkMode ? <Sun size={19} /> : <Moon size={19} />}
          </button>

          <button
            className="action-icon-btn logout-btn"
            onClick={signOut}
            title="تسجيل الخروج"
          >
            <LogOut size={19} />
          </button>
        </div>
      </header>

      {/* تنبيه المنتجات منخفضة المخزون - قابل للضغط والفلترة */}
      {lowStockProducts.length > 0 && showLowStockBanner && (
        <div className="stock-alert-banner">
          <div className="stock-alert-content">
            <div className="alert-icon-wrapper">
              <AlertTriangle size={24} className="alert-icon" />
            </div>
            <div>
              <strong>تنبيه نقص المخزون:</strong> يوجد{' '}
              <span className="badge-count">{lowStockProducts.length}</span> منتج قارب على النفاد
              <p className="stock-names">
                {lowStockProducts.slice(0, 4).map((p) => p.name).join(' • ')}
              </p>
            </div>
          </div>
          <div className="stock-alert-actions">
            <button
              className="view-stock-btn"
              onClick={() => setActiveTab('low-stock')}
            >
              عرض المنتجات
            </button>
            <button
              className="dismiss-alert-btn"
              onClick={() => setShowLowStockBanner(false)}
            >
              إخفاء
            </button>
          </div>
        </div>
      )}

      {/* بطاقات الإحصائيات السريعة */}
      <div className="stats-row">
        <div
          className={`stat-card ${activeTab === 'products' ? 'active' : ''}`}
          onClick={() => setActiveTab('products')}
        >
          <div className="stat-icon prod-icon">
            <Package size={24} />
          </div>
          <div className="stat-text">
            <span>إجمالي المنتجات</span>
            <strong>{products.length}</strong>
          </div>
        </div>

        <div
          className={`stat-card ${activeTab === 'customers' ? 'active' : ''}`}
          onClick={() => setActiveTab('customers')}
        >
          <div className="stat-icon cust-icon">
            <Users size={24} />
          </div>
          <div className="stat-text">
            <span>إجمالي العملاء</span>
            <strong>{customers.length}</strong>
          </div>
        </div>

        <div
          className={`stat-card ${activeTab === 'low-stock' ? 'active' : ''} ${lowStockProducts.length > 0 ? 'warning' : ''}`}
          onClick={() => setActiveTab('low-stock')}
        >
          <div className="stat-icon alert-icon-box">
            <TrendingDown size={24} />
          </div>
          <div className="stat-text">
            <span>نقص المخزون</span>
            <strong>{lowStockProducts.length}</strong>
          </div>
        </div>
      </div>

      {/* شريط البحث المودرن */}
      <div className="search-toolbar">
        <div className="search-input-box">
          <Search size={20} className="search-icon" />
          <input
            type="text"
            placeholder={
              activeTab === 'customers'
                ? 'ابحث باسم العميل أو رقم هاتفه...'
                : 'ابحث باسم المنتج أو الرقم التسلسلي...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="clear-search" onClick={() => setSearchTerm('')}>
              ×
            </button>
          )}
        </div>

        {activeTab === 'customers' && (
          <div className="search-type-filters">
            <button
              className={`pill ${searchType === 'all' ? 'active' : ''}`}
              onClick={() => setSearchType('all')}
            >
              الكل
            </button>
            <button
              className={`pill ${searchType === 'name' ? 'active' : ''}`}
              onClick={() => setSearchType('name')}
            >
              بالاسم
            </button>
            <button
              className={`pill ${searchType === 'phone' ? 'active' : ''}`}
              onClick={() => setSearchType('phone')}
            >
              بالهاتف
            </button>
          </div>
        )}
      </div>

      {/* ألسنة التبويب للديسكتوب */}
      <div className="desktop-tabs">
        <button
          className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          <LayoutGrid size={18} /> الكل
        </button>
        <button
          className={`tab-btn ${activeTab === 'products' ? 'active' : ''}`}
          onClick={() => setActiveTab('products')}
        >
          <Package size={18} /> المنتجات ({products.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'customers' ? 'active' : ''}`}
          onClick={() => setActiveTab('customers')}
        >
          <Users size={18} /> العملاء ({customers.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'low-stock' ? 'active' : ''}`}
          onClick={() => setActiveTab('low-stock')}
        >
          <AlertTriangle size={18} /> نواقص المخزون ({lowStockProducts.length})
        </button>
      </div>

      {/* المحتوى الرئيسي للبطاقات */}
      <main className="content-container">
        {/* قسم المنتجات */}
        {(activeTab === 'all' || activeTab === 'products' || activeTab === 'low-stock') && (
          <section className="section-block">
            <div className="section-header">
              <h2>
                <Package size={22} className="inline ml-2 text-indigo-500" />
                {activeTab === 'low-stock' ? 'المنتجات منخفضة المخزون' : 'قائمة المنتجات'}
                <span className="count-pill">{filteredProducts.length}</span>
              </h2>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="empty-state">
                <Package size={48} className="empty-icon" />
                <p>لا توجد منتجات مطابقة للبحث</p>
              </div>
            ) : (
              <div className="grid-cards">
                {filteredProducts.map((product) => {
                  const isLow = Number(product.quantity) <= Number(product.min_quantity);
                  return (
                    <div key={product.id} className={`item-card product-card ${isLow ? 'low-stock-border' : ''}`}>
                      <div className="card-top">
                        <span className="category-badge">{product.category || 'عام'}</span>
                        {isLow && (
                          <span className="stock-alert-tag">
                            <AlertTriangle size={14} className="inline ml-1" /> قارب على النفاد
                          </span>
                        )}
                      </div>

                      <h3 className="card-title">{product.name}</h3>
                      <p className="serial-num">سيريال: {product.serial_number}</p>

                      <div className="card-metrics">
                        <div className="metric">
                          <span className="label">سعر البيع</span>
                          <span className="value text-emerald-600">{Number(product.price).toFixed(2)} ج.م</span>
                        </div>
                        <div className="metric">
                          <span className="label">الكمية المتاحة</span>
                          <span className={`value font-bold ${isLow ? 'text-red-600' : 'text-indigo-600'}`}>
                            {product.quantity}
                          </span>
                        </div>
                        <div className="metric">
                          <span className="label">سعر الجملة</span>
                          <span className="value">{Number(product.wholesale_price).toFixed(2)} ج.م</span>
                        </div>
                        <div className="metric">
                          <span className="label">الحد الأدنى</span>
                          <span className="value">{product.min_quantity}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* قسم العملاء */}
        {(activeTab === 'all' || activeTab === 'customers') && (
          <section className="section-block">
            <div className="section-header">
              <h2>
                <Users size={22} className="inline ml-2 text-violet-500" />
                قائمة العملاء
                <span className="count-pill">{filteredCustomers.length}</span>
              </h2>
            </div>

            {filteredCustomers.length === 0 ? (
              <div className="empty-state">
                <Users size={48} className="empty-icon" />
                <p>لا يوجد عملاء مطابقين للبحث</p>
              </div>
            ) : (
              <div className="grid-cards">
                {filteredCustomers.map((customer) => {
                  const isCopied = copiedCustomerId === customer.id;
                  const tokenOrSlug = customer.portal_token || `${customer.name.replace(/\s+/g, '-')}-${customer.id}`;
                  return (
                    <div key={customer.id} className="item-card customer-card">
                      <div className="card-top">
                        <span className="cust-date">{customer.date || '—'}</span>
                        <span className={`balance-badge ${(customer.totalBalance || 0) > 0 ? 'debt' : 'clear'}`}>
                          {(customer.totalBalance || 0) > 0 ? 'مديونية' : 'خالص'}
                        </span>
                      </div>

                      <h3 className="card-title">{customer.name}</h3>

                      {customer.phone && (
                        <p className="phone-line">
                          <Phone size={14} className="inline ml-1" />
                          <a href={`tel:${customer.phone}`}>{customer.phone}</a>
                        </p>
                      )}

                      <div className="balance-box">
                        <span className="balance-label">الرصيد الإجمالي</span>
                        <strong className="balance-number">
                          {Number(customer.totalBalance || 0).toFixed(2)} ج.م
                        </strong>
                      </div>

                      {customer.notes && <p className="notes-line">ملاحظة: {customer.notes}</p>}

                      <div className="card-actions-footer">
                        <button
                          className={`copy-link-btn ${isCopied ? 'copied' : ''}`}
                          onClick={() => copyCustomerLink(customer)}
                        >
                          {isCopied ? (
                            <>
                              <Check size={16} /> تم النسخ بنجاح!
                            </>
                          ) : (
                            <>
                              <Copy size={16} /> نسخ رابط البوابة
                            </>
                          )}
                        </button>

                        <a
                          href={`/customer/${tokenOrSlug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="open-portal-btn"
                          title="فتح بوابة العميل"
                        >
                          <ExternalLink size={16} />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {/* شريط التنقل السفلي الاحترافي للموبايل (Bottom Navigation Bar) */}
      <nav className="mobile-bottom-nav">
        <button
          className={`nav-item ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('all');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <LayoutGrid size={20} />
          <span>الكل</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'products' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('products');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <Package size={20} />
          <span>المنتجات</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'customers' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('customers');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <Users size={20} />
          <span>العملاء</span>
        </button>

        <button
          className={`nav-item alert-nav ${activeTab === 'low-stock' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('low-stock');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <div className="icon-with-badge">
            <AlertTriangle size={20} />
            {lowStockProducts.length > 0 && <span className="mini-badge">{lowStockProducts.length}</span>}
          </div>
          <span>النواقص</span>
        </button>

        <button className="nav-item" onClick={toggleDarkMode}>
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          <span>المظهر</span>
        </button>
      </nav>
    </div>
  );
}

export default AdminApp;
