// src/CustomerPortal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from './supabaseClient';
import Select from 'react-select';
import { useDarkMode } from './useDarkMode';
import {
  Calendar,
  Clock,
  CreditCard,
  ShoppingBag,
  Receipt,
  Sun,
  Moon,
  RefreshCw,
  ArrowDown,
  ArrowUp,
  Phone,
  Wallet,
  X,
  Layers,
  ChevronDown,
  UserCheck
} from 'lucide-react';

import './CustomerPortal.css';

const CustomerPortal = () => {
  const { customerSlug } = useParams();

  // استخراج الـ ID أو فحص إذا كان UUID
  const isUUID = customerSlug && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerSlug);
  const customerId = !isUUID && customerSlug ? customerSlug.split('-').pop() : null;

  const [customer, setCustomer] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [previousBalance, setPreviousBalance] = useState(0);
  const [scrollDirection, setScrollDirection] = useState('down');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [darkMode, toggleDarkMode] = useDarkMode();

  const transactionsRef = useRef(null);
  const topRef = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    if (customerSlug) {
      loadCustomerData();
    }
  }, [customerSlug, selectedMonth, selectedYear]);

  // إغلاق المودال عند النقر خارج المحتوى
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        setShowModal(false);
      }
    };

    if (showModal) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showModal]);

  const loadCustomerData = async () => {
    try {
      setLoading(true);
      setError('');

      // إذا كان الرابط باستخدام UUID ودالة الـ RPC الآمنة
      if (isUUID) {
        const { data: portalData, error: portalError } = await supabase.rpc('get_customer_portal', {
          p_token: customerSlug
        });

        if (portalError || !portalData) {
          console.error('Portal Error:', portalError);
          setError('العميل غير موجود أو الرابط غير صالح');
          setLoading(false);
          return;
        }

        setCustomer({
          id: portalData.id,
          name: portalData.name,
          phone: portalData.phone,
          amount_due: portalData.amount_due
        });

        const monthStr = String(selectedMonth).padStart(2, '0');
        const startOfSelectedMonth = `${selectedYear}-${monthStr}-01`;
        const endOfSelectedMonth = `${selectedYear}-${monthStr}-${new Date(selectedYear, selectedMonth, 0).getDate()}`;

        const allTrx = portalData.transactions || [];
        const allPay = portalData.payments || [];

        // حساب الرصيد السابق
        const prevSales = allTrx
          .filter((t) => t.date < startOfSelectedMonth && t.type === 'sale')
          .reduce((sum, t) => sum + (Number(t.total) || 0), 0);
        const prevReturns = allTrx
          .filter((t) => t.date < startOfSelectedMonth && t.type === 'return')
          .reduce((sum, t) => sum + Math.abs(Number(t.total) || 0), 0);
        const prevPayments = allPay
          .filter((p) => p.date < startOfSelectedMonth)
          .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

        setPreviousBalance(prevSales - prevReturns - prevPayments);

        const currentMonthTrx = allTrx.filter((t) => t.date >= startOfSelectedMonth && t.date <= endOfSelectedMonth);
        const currentMonthPay = allPay.filter((p) => p.date >= startOfSelectedMonth && p.date <= endOfSelectedMonth);

        setTransactions(currentMonthTrx);
        setPayments(currentMonthPay);
        setLoading(false);
        return;
      }

      // النمط الاحتياطي للروابط القديمة (بالـ ID)
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single();

      if (customerError) {
        setError('العميل غير موجود');
        setLoading(false);
        return;
      }

      setCustomer(customerData);

      const previousBalanceVal = await calculatePreviousBalance(customerId, selectedYear, selectedMonth);
      setPreviousBalance(previousBalanceVal);

      const monthStr = String(selectedMonth).padStart(2, '0');
      const startDate = `${selectedYear}-${monthStr}-01`;
      const endDate = `${selectedYear}-${monthStr}-${new Date(selectedYear, selectedMonth, 0).getDate()}`;

      const { data: transactionsData } = await supabase
        .from('customer_transactions')
        .select('*, products(name, serial_number)')
        .eq('customer_id', customerId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

      setTransactions(transactionsData || []);

      const { data: paymentsData } = await supabase
        .from('payments')
        .select('*')
        .eq('customer_id', customerId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

      setPayments(paymentsData || []);
      setLoading(false);
    } catch (err) {
      console.error('Error loading customer data:', err);
      setError('فشل في تحميل البيانات');
      setLoading(false);
    }
  };

  const calculatePreviousBalance = async (custNumber, year, month) => {
    try {
      const startOfSelectedMonth = `${year}-${String(month).padStart(2, '0')}-01`;

      const { data: prevTrx } = await supabase
        .from('customer_transactions')
        .select('*')
        .eq('customer_id', custNumber)
        .lt('date', startOfSelectedMonth);

      const { data: prevPay } = await supabase
        .from('payments')
        .select('*')
        .eq('customer_id', custNumber)
        .lt('date', startOfSelectedMonth);

      const prevSales = (prevTrx || [])
        .filter((t) => t.type === 'sale')
        .reduce((sum, t) => sum + (Number(t.total) || 0), 0);

      const prevReturns = (prevTrx || [])
        .filter((t) => t.type === 'return')
        .reduce((sum, t) => sum + Math.abs(Number(t.total) || 0), 0);

      const prevPaymentsTotal = (prevPay || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      return prevSales - prevReturns - prevPaymentsTotal;
    } catch (err) {
      return 0;
    }
  };

  const calculateTotals = () => {
    const totalSales = transactions
      .filter((t) => t.type === 'sale')
      .reduce((sum, t) => sum + (Number(t.total) || 0), 0);

    const totalReturns = transactions
      .filter((t) => t.type === 'return')
      .reduce((sum, t) => sum + Math.abs(Number(t.total) || 0), 0);

    const totalPayments = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const currentMonthBalance = totalSales - totalReturns - totalPayments;
    const totalBalance = previousBalance + currentMonthBalance;

    return { totalSales, totalReturns, totalPayments, currentMonthBalance, totalBalance };
  };

  const { totalSales, totalReturns, totalPayments, totalBalance } = calculateTotals();

  const months = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);

  const getCombinedRecords = () => {
    const combined = [];

    transactions.forEach((transaction) => {
      combined.push({
        id: `t-${transaction.id}`,
        type: 'transaction',
        date: transaction.date,
        data: transaction,
        amount:
          transaction.type === 'sale'
            ? Math.abs(Number(transaction.total) || 0)
            : -Math.abs(Number(transaction.total) || 0)
      });
    });

    payments.forEach((payment) => {
      combined.push({
        id: `p-${payment.id}`,
        type: 'payment',
        date: payment.date,
        data: payment,
        amount: -Number(payment.amount)
      });
    });

    return combined.sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  const openRecordDetails = (record) => {
    setSelectedRecord(record);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedRecord(null);
  };

  const handleScrollButtonClick = () => {
    const scrollY = window.scrollY;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;

    if (scrollY + windowHeight >= documentHeight - 50) {
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setScrollDirection('down');
    } else {
      window.scrollTo({ top: documentHeight, behavior: 'smooth' });
      setScrollDirection('up');
    }
  };

  if (loading) {
    return (
      <div className={`customer-portal loading-state ${darkMode ? 'dark-mode' : ''}`} dir="rtl">
        <div className="spinner"></div>
        <p>جاري تحميل كشف الحساب...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`customer-portal error-state ${darkMode ? 'dark-mode' : ''}`} dir="rtl">
        <div className="error-card">
          <X size={44} className="text-red-500 mb-3" />
          <h2>عذراً، حدث خطأ</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()} className="refresh-btn mt-3">
            <RefreshCw size={16} /> إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  const combinedRecords = getCombinedRecords();
  const filteredRecords = combinedRecords.filter((record) => {
    if (activeFilter === 'transactions') return record.type === 'transaction';
    if (activeFilter === 'payments') return record.type === 'payment';
    return true;
  });

  return (
    <div className={`customer-portal ${darkMode ? 'dark-mode' : ''}`} dir="rtl">
      <div ref={topRef}></div>

      {/* زر التنقل العائم */}
      <button
        className={`scroll-button ${scrollDirection}`}
        onClick={handleScrollButtonClick}
        title={scrollDirection === 'down' ? 'انتقال للأسفل' : 'انتقال للأعلى'}
      >
        {scrollDirection === 'down' ? <ArrowDown size={20} /> : <ArrowUp size={20} />}
      </button>

      {/* زر Dark Mode العائم */}
      <button
        className="dark-mode-toggle-floating"
        onClick={toggleDarkMode}
        title={darkMode ? 'الوضع الفاتح' : 'الوضع الداكن'}
      >
        {darkMode ? <Sun size={22} /> : <Moon size={22} />}
      </button>

      {/* مودال تفاصيل المعاملة / الدفعة */}
      {showModal && selectedRecord && (
        <div className="modal-overlay">
          <div className="modal-content" ref={modalRef}>
            <div className="modal-header">
              <h3>تفاصيل {selectedRecord.type === 'transaction' ? 'المعاملة' : 'الدفعة'}</h3>
              <button className="close-button" onClick={closeModal}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {selectedRecord.type === 'transaction' ? (
                <div className="transaction-details">
                  <div className="detail-row">
                    <span className="label">التاريخ:</span>
                    <span className="value">{selectedRecord.date}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">نوع المعاملة:</span>
                    <span className="value">{selectedRecord.data.type === 'sale' ? 'شراء / فاتورة' : 'مرتجع'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">اسم الصنف:</span>
                    <span className="value font-bold">{selectedRecord.data.products?.name || selectedRecord.data.item}</span>
                  </div>
                  {selectedRecord.data.quantity && (
                    <div className="detail-row">
                      <span className="label">الكمية:</span>
                      <span className="value">{selectedRecord.data.quantity}</span>
                    </div>
                  )}
                  {selectedRecord.data.price && (
                    <div className="detail-row">
                      <span className="label">سعر الوحدة:</span>
                      <span className="value">{Number(selectedRecord.data.price).toFixed(2)} ج.م</span>
                    </div>
                  )}
                  <div className="detail-row total">
                    <span className="label">الإجمالي:</span>
                    <span className="value text-indigo-600 font-bold">{Math.abs(Number(selectedRecord.data.total)).toFixed(2)} ج.م</span>
                  </div>
                  {selectedRecord.data.time && (
                    <div className="detail-row">
                      <span className="label">الوقت:</span>
                      <span className="value">{selectedRecord.data.time}</span>
                    </div>
                  )}
                  {selectedRecord.data.notes && (
                    <div className="detail-row">
                      <span className="label">ملاحظات:</span>
                      <span className="value">{selectedRecord.data.notes}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="payment-details">
                  <div className="detail-row">
                    <span className="label">التاريخ:</span>
                    <span className="value">{selectedRecord.date}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">طريقة الدفع:</span>
                    <span className="value">
                      {selectedRecord.data.payment_method === 'cash'
                        ? 'نقدي'
                        : selectedRecord.data.payment_method === 'wallet'
                        ? 'محفظة إلكترونية'
                        : selectedRecord.data.payment_method || 'نقدي'}
                    </span>
                  </div>
                  <div className="detail-row total">
                    <span className="label">المبلغ المدفوع:</span>
                    <span className="value text-emerald-600 font-bold">{Number(selectedRecord.data.amount).toFixed(2)} ج.م</span>
                  </div>
                  {selectedRecord.data.time && (
                    <div className="detail-row">
                      <span className="label">الوقت:</span>
                      <span className="value">{selectedRecord.data.time}</span>
                    </div>
                  )}
                  {selectedRecord.data.notes && (
                    <div className="detail-row">
                      <span className="label">ملاحظات:</span>
                      <span className="value">{selectedRecord.data.notes}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={closeModal} className="btn btn-primary">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* هيدر صفحة العميل المودرن */}
      <header className="portal-header">
        <div className="portal-header-top">
          <div className="customer-avatar-badge">
            <UserCheck size={28} />
          </div>
          <div className="portal-header-titles">
            <h1>كشف حساب: {customer?.name}</h1>
            <p className="portal-subtitle">بوابة متابعة الحسابات والمدفوعات</p>
          </div>
          <button
            className="dark-mode-toggle-header"
            onClick={toggleDarkMode}
            title={darkMode ? 'الوضع الفاتح' : 'الوضع الداكن'}
          >
            {darkMode ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>

        <div className="customer-info-bar">
          {customer?.phone && (
            <div className="info-chip">
              <Phone size={15} />
              <span>{customer.phone}</span>
            </div>
          )}
          <div className="info-chip">
            <Calendar size={15} />
            <span>عرض شهر: {months[selectedMonth - 1]} {selectedYear}</span>
          </div>
        </div>
      </header>

      {/* فلترة الشهور والسنوات */}
      <div className="filters-section">
        <div className="filters-row">
          <div className="date-selectors">
            <div className="select-wrapper">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              >
                {months.map((month, index) => (
                  <option key={index} value={index + 1}>
                    {month}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="select-arrow" />
            </div>

            <div className="select-wrapper">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="select-arrow" />
            </div>
          </div>

          <div className="filter-buttons">
            <button
              className={`filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setActiveFilter('all')}
            >
              <Layers size={15} /> الكل
            </button>
            <button
              className={`filter-btn ${activeFilter === 'transactions' ? 'active' : ''}`}
              onClick={() => setActiveFilter('transactions')}
            >
              <Receipt size={15} /> المعاملات
            </button>
            <button
              className={`filter-btn ${activeFilter === 'payments' ? 'active' : ''}`}
              onClick={() => setActiveFilter('payments')}
            >
              <CreditCard size={15} /> المدفوعات
            </button>
          </div>

          <button onClick={loadCustomerData} className="refresh-btn" title="تحديث">
            <RefreshCw size={16} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* بطاقة الرصيد الحالي المتوهجة والمودرن */}
      <div className={`current-balance-card ${totalBalance > 0 ? 'debt-glow' : 'clear-glow'}`}>
        <div className="balance-card-inner">
          <div className="balance-icon-wrap">
            <Wallet size={32} />
          </div>
          <div className="balance-content">
            <span className="balance-title">الرصيد المستحق حتى نهاية {months[selectedMonth - 1]} {selectedYear}</span>
            <div className="balance-amount-display">
              <strong>{Math.abs(totalBalance).toFixed(2)}</strong>
              <small>جنيهاً {totalBalance > 0 ? '(عليك)' : totalBalance < 0 ? '(لك)' : '(خالص)'}</small>
            </div>
          </div>
        </div>
      </div>

      {/* عرض البطاقات الأفقية (المعاملات والمدفوعات) بالشكل الذي يفضله المستخدم */}
      <div ref={transactionsRef} className="transactions-section">
        <div className="section-title-wrap">
          <h2>
            سجل العمليات لشهر {months[selectedMonth - 1]}
            <span className="record-count">{filteredRecords.length}</span>
          </h2>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="no-data-card">
            <Receipt size={40} className="empty-icon" />
            <p>لا توجد معاملات أو مدفوعات مسجلة لهذا الشهر</p>
          </div>
        ) : (
          <div className="horizontal-cards">
            {filteredRecords.map((record, index) => {
              let runningBalance = previousBalance;
              for (let i = 0; i <= index; i++) {
                runningBalance += combinedRecords[i].amount;
              }

              const isSale = record.type === 'transaction' && record.data.type === 'sale';
              const isPayment = record.type === 'payment';

              return (
                <div
                  key={record.id}
                  className={`horizontal-card ${record.type} ${record.data.type || ''}`}
                  onClick={() => openRecordDetails(record)}
                >
                  <div className="card-left">
                    <div className="date-type">
                      <span className="date-badge">
                        <Clock size={12} className="inline ml-1" />
                        {record.date} {record.data.time || ''}
                      </span>
                      <span className={`type-badge ${isPayment ? 'payment-tag' : isSale ? 'sale-tag' : 'return-tag'}`}>
                        {isPayment ? (
                          <>
                            <CreditCard size={12} className="inline ml-1" /> دفعة سداد
                          </>
                        ) : isSale ? (
                          <>
                            <ShoppingBag size={12} className="inline ml-1" /> شراء
                          </>
                        ) : (
                          'مرتجع'
                        )}
                      </span>
                    </div>

                    <div className="details">
                      {record.type === 'transaction' ? (
                        <>
                          <span className="product-name">
                            {record.data.products?.name || record.data.item}
                          </span>
                          {record.data.quantity && (
                            <span className="quantity-price">
                              ({record.data.quantity} × {Number(record.data.price).toFixed(2)})
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="payment-method">
                          سداد {record.data.payment_method === 'cash' ? 'نقدي' : record.data.payment_method === 'wallet' ? 'محفظة' : 'نقدي'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="card-right">
                    <div className="amount-section">
                      <span className={`amount ${isSale ? 'text-red' : 'text-green'}`}>
                        {isSale ? '+' + record.amount.toFixed(2) : '-' + Math.abs(record.amount).toFixed(2)}
                      </span>
                    </div>
                    <div className="balance-section">
                      <span className="balance-sub">الرصيد: {runningBalance.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* بطاقة الإجمالي النهائي */}
            <div className="horizontal-card total-card">
              <div className="card-left">
                <div className="date-type">
                  <span className="total-title font-bold">ملخص الحساب النهائي لشهر {months[selectedMonth - 1]}</span>
                </div>
                <div className="summary-pills">
                  <span className="sum-pill sale">مشتريات: +{totalSales.toFixed(2)}</span>
                  <span className="sum-pill return">مرتجعات: -{totalReturns.toFixed(2)}</span>
                  <span className="sum-pill pay">سدادات: -{totalPayments.toFixed(2)}</span>
                </div>
              </div>
              <div className="card-right">
                <span className="final-label">صافي الرصيد:</span>
                <strong className="final-total">{totalBalance.toFixed(2)} ج.م</strong>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="portal-footer">
        <p>© {new Date().getFullYear()} نظام علي الجداوي • جميع الحقوق محفوظة</p>
      </footer>
    </div>
  );
};

export default CustomerPortal;
