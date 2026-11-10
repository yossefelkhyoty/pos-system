// src/CustomerPortal.jsx - النسخة المحسنة
import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from './supabaseClient';
import Select from 'react-select';
import { useDarkMode } from './useDarkMode';

import './CustomerPortal.css';

const CustomerPortal = () => {
  const { customerSlug } = useParams();

  // استخراج الـ ID من الرابط (customer/اسم العميل-رقمid)
  const customerId = customerSlug ? customerSlug.split('-').pop() : null;

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
    if (customerId) {
      loadCustomerData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, selectedMonth, selectedYear]);

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

      // تحميل بيانات العميل
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single();

      if (customerError) {
        console.error('Error loading customer:', customerError);
        setError('العميل غير موجود');
        setLoading(false);
        return;
      }

      setCustomer(customerData);

      // حساب رصيد الشهور السابقة (حتى نهاية الشهر المحدد)
      const previousBalance = await calculatePreviousBalance(customerId, selectedYear, selectedMonth);
      setPreviousBalance(previousBalance);

      // تحميل المعاملات للشهر المحدد
      const monthStr = String(selectedMonth).padStart(2, '0');
      const startDate = `${selectedYear}-${monthStr}-01`;
      const endDate = `${selectedYear}-${monthStr}-${new Date(selectedYear, selectedMonth, 0).getDate()}`;

      const { data: transactionsData, error: transactionsError } = await supabase
        .from('customer_transactions')
        .select('*, products(name, serial_number)')
        .eq('customer_id', customerId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true }); // الأقدم أولاً

      if (transactionsError) {
        console.error('Error loading transactions:', transactionsError);
        setTransactions([]);
      } else {
        setTransactions(transactionsData || []);
      }

      // تحميل المدفوعات للشهر المحدد
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('*')
        .eq('customer_id', customerId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true }); // الأقدم أولاً

      // ترتيب المدفوعات حسب الوقت إذا كان التاريخ نفسه
      if (paymentsData) {
        paymentsData.sort((a, b) => {
          if (a.date !== b.date) {
            return a.date.localeCompare(b.date);
          }
          const timeA = a.time || '';
          const timeB = b.time || '';
          return timeA.localeCompare(timeB);
        });
      }

      if (paymentsError) {
        console.error('Error loading payments:', paymentsError);
        setPayments([]);
      } else {
        setPayments(paymentsData || []);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading customer data:', err);
      setError('فشل في تحميل البيانات');
      setLoading(false);
    }
  };

  // دالة محسنة لحساب الرصيد السابق (حتى نهاية الشهر المحدد)
  const calculatePreviousBalance = async (customerId, year, month) => {
    try {
      // حساب التاريخ حتى نهاية الشهر المحدد
      const startOfSelectedMonth = `${year}-${String(month).padStart(2, '0')}-01`;

      // جلب جميع المعاملات حتى نهاية الشهر المحدد
      const { data: prevTransactionsData, error: prevTransactionsError } = await supabase
        .from('customer_transactions')
        .select('*')
        .eq('customer_id', customerId)
        .lt('date', startOfSelectedMonth)


      if (prevTransactionsError) {
        console.error('Error loading previous transactions:', prevTransactionsError);
        return 0;
      }

      // جلب جميع المدفوعات حتى نهاية الشهر المحدد
      const { data: prevPaymentsData, error: prevPaymentsError } = await supabase
        .from('payments')
        .select('*')
        .eq('customer_id', customerId)
        .lt('date', startOfSelectedMonth)


      if (prevPaymentsError) {
        console.error('Error loading previous payments:', prevPaymentsError);
        return 0;
      }

      // حساب الرصيد حتى نهاية الشهر المحدد
      const prevSales = (prevTransactionsData || [])
        .filter(t => t.type === 'sale')
        .reduce((sum, t) => sum + (Number(t.total) || 0), 0);

      const prevReturns = (prevTransactionsData || [])
        .filter(t => t.type === 'return')
        .reduce((sum, t) => sum + Math.abs(Number(t.total) || 0), 0);

      const prevPayments = (prevPaymentsData || [])
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      return prevSales - prevReturns - prevPayments;
    } catch (err) {
      console.error('Error calculating previous balance:', err);
      return 0;
    }
  };

  const calculateTotals = () => {
    const totalSales = transactions
      .filter(t => t.type === 'sale')
      .reduce((sum, t) => sum + (Number(t.total) || 0), 0);

    const totalReturns = transactions
      .filter(t => t.type === 'return')
      .reduce((sum, t) => sum + Math.abs(Number(t.total) || 0), 0);

    const totalPayments = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // الرصيد الحالي للشهر المحدد فقط
    const currentMonthBalance = totalSales - totalReturns - totalPayments;

    // الرصيد الإجمالي حتى نهاية الشهر المحدد (يشمل الشهور السابقة)
    const totalBalance = previousBalance + currentMonthBalance;

    return {
      totalSales,
      totalReturns,
      totalPayments,
      currentMonthBalance,
      totalBalance
    };
  };

  const { totalSales, totalReturns, totalPayments, totalBalance } = calculateTotals();

  const months = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);

  // دالة لدمج المعاملات والمدفوعات وترتيبها زمنياً
  const getCombinedRecords = () => {
    const combined = [];

    // إضافة المعاملات
    transactions.forEach(transaction => {
      combined.push({
        id: `t-${transaction.id}`,
        type: 'transaction',
        date: transaction.date,
        data: transaction,
        amount: transaction.type === 'sale'
          ? Math.abs(Number(transaction.total) || 0)
          : -Math.abs(Number(transaction.total) || 0)
      });
    });

    // إضافة المدفوعات
    payments.forEach(payment => {
      combined.push({
        id: `p-${payment.id}`,
        type: 'payment',
        date: payment.date,
        data: payment,
        amount: -Number(payment.amount)
      });
    });

    // ترتيب حسب التاريخ (من الأقدم للأحدث)
    return combined.sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  // فتح المودال لعرض التفاصيل
  const openRecordDetails = (record) => {
    setSelectedRecord(record);
    setShowModal(true);
  };

  // إغلاق المودال
  const closeModal = () => {
    setShowModal(false);
    setSelectedRecord(null);
  };


  const handleScrollButtonClick = () => {
    const scrollY = window.scrollY;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;

    if (scrollY + windowHeight >= documentHeight - 50) {
      // لو تحت → ارجع فوق
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setScrollDirection('down');
    } else {
      // لو فوق → انزل لآخر الصفحة
      window.scrollTo({ top: documentHeight, behavior: 'smooth' });
      setScrollDirection('up');
    }
  };

  // تحديث اتجاه الزرار حسب مكان التمرير
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;

      if (scrollY + windowHeight >= documentHeight - 50) {
        setScrollDirection('up');
      } else {
        setScrollDirection('down');
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (loading) {
    return (
      <div className="customer-portal loading" dir="rtl">
        <div className="spinner"></div>
        <p>جاري تحميل البيانات...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="customer-portal error" dir="rtl">
        <h2>خطأ</h2>
        <p>{error}</p>
        <button onClick={() => window.history.back()} className="btn btn-primary">
          العودة للخلف
        </button>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="customer-portal error" dir="rtl">
        <h2>العميل غير موجود</h2>
        <p>تعذر العثور على بيانات العميل المطلوبة</p>
        <button onClick={() => window.history.back()} className="btn btn-primary">
          العودة للخلف
        </button>
      </div>
    );
  }

  const combinedRecords = getCombinedRecords();

  // فلترة حسب الاختيار (المعاملات / المدفوعات / الكل)
  const filteredRecords = combinedRecords.filter(record => {
    if (activeFilter === 'transactions') return record.type === 'transaction';
    if (activeFilter === 'payments') return record.type === 'payment';
    return true; // الكل
  });


  return (
    <div className={`customer-portal ${darkMode ? 'dark-mode' : ''}`} dir="rtl">
      <div ref={topRef}></div>

      {/* زر التنقل العائم المحسن */}
      <button
        className={`scroll-button ${scrollDirection}`}
        onClick={handleScrollButtonClick}
        title={scrollDirection === 'down' ? 'انتقال للأسفل' : 'انتقال للأعلى'}
      >
        {scrollDirection === 'down' ? '▼' : '▲'}
      </button>

      {/* زر Dark Mode العائم */}
      <button
        className="dark-mode-toggle-floating"
        onClick={toggleDarkMode}
        title={darkMode ? 'الوضع الفاتح' : 'الوضع الداكن'}
      >
        {darkMode ? '☀️' : '🌙'}
      </button>

      {/* مودال عرض التفاصيل */}
      {showModal && selectedRecord && (
        <div className="modal-overlay">
          <div className="modal-content" ref={modalRef}>
            <div className="modal-header">
              <h3>تفاصيل {selectedRecord.type === 'transaction' ? 'المعاملة' : 'الدفعة'}</h3>
              <button className="close-button" onClick={closeModal}>×</button>
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
                    <span className="value">{selectedRecord.data.type === 'sale' ? 'بيع' : 'مرتجع'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">اسم المنتج:</span>
                    <span className="value">{selectedRecord.data.products?.name || selectedRecord.data.item}</span>
                  </div>
                  {selectedRecord.data.products?.serial_number && (
                    <div className="detail-row">
                      <span className="label">الرقم التسلسلي:</span>
                      <span className="value">{selectedRecord.data.products.serial_number}</span>
                    </div>
                  )}
                  <div className="detail-row">
                    <span className="label">الكمية:</span>
                    <span className="value">{selectedRecord.data.quantity}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">سعر الوحدة:</span>
                    <span className="value">{Number(selectedRecord.data.price).toFixed(2)} جنيها</span>
                  </div>
                  <div className="detail-row total">
                    <span className="label">الإجمالي:</span>
                    <span className="value">{Math.abs(Number(selectedRecord.data.total)).toFixed(2)} جنيها</span>
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
                  {selectedRecord.data.time && (
                    <div className="detail-row">
                      <span className="label">الوقت:</span>
                      <span className="value">{selectedRecord.data.time}</span>
                    </div>
                  )}
                  <div className="detail-row">
                    <span className="label">طريقة الدفع:</span>
                    <span className="value">
                      {selectedRecord.data.payment_method === 'cash' ? 'نقدي' :
                        selectedRecord.data.payment_method === 'wallet' ? 'محفظة إلكترونية' :
                          selectedRecord.data.payment_method || 'غير محدد'}
                    </span>
                  </div>
                  <div className="detail-row total">
                    <span className="label">المبلغ:</span>
                    <span className="value">{Number(selectedRecord.data.amount).toFixed(2)} جنيها</span>
                  </div>
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
              <button onClick={closeModal} className="btn btn-primary">إغلاق</button>
            </div>
          </div>
        </div>
      )}

      <header className="portal-header">
        <div className="portal-header-top">
          <h1>حساب العميل: {customer?.name}</h1>
          <button
            className="dark-mode-toggle-header"
            onClick={toggleDarkMode}
            title={darkMode ? 'الوضع الفاتح' : 'الوضع الداكن'}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
        <div className="customer-info">
          <p><strong>رقم الهاتف:</strong> {customer?.phone || 'غير متوفر'}</p>
          <p><strong>تاريخ التسجيل:</strong> {customer?.date}</p>
          <p><strong>الشهر المعروض:</strong> {months[selectedMonth - 1]} {selectedYear}</p>
        </div>
      </header>

      <div className="filters-section">
        <h2>عرض بيانات شهر</h2>
        <div className="filters">
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

          <Select
            options={years.map(year => ({ value: year, label: year }))}
            value={{ value: selectedYear, label: selectedYear }}
            onChange={(selectedOption) => setSelectedYear(selectedOption.value)}
            placeholder="اختر السنة"
            className="year-select"
            classNamePrefix="select"
          />

          <div className="filter-buttons">
            <button
              className={activeFilter === 'all' ? 'active' : ''}
              onClick={() => setActiveFilter('all')}
            >
              الكل
            </button>
            <button
              className={activeFilter === 'transactions' ? 'active' : ''}
              onClick={() => setActiveFilter('transactions')}
            >
              المعاملات فقط
            </button>
            <button
              className={activeFilter === 'payments' ? 'active' : ''}
              onClick={() => setActiveFilter('payments')}
            >
              المدفوعات فقط
            </button>
          </div>

          <button onClick={loadCustomerData} className="refresh-btn">تحديث البيانات</button>
        </div>
      </div>

      {/* بطاقة الرصيد الحالي */}
      <div className="current-balance-card">
        <h3>الرصيد الحالي</h3>
        <p className="balance-amount">{totalBalance.toFixed(2)} جنيها</p>
        <small>يشمل جميع الشهور حتى نهاية {months[selectedMonth - 1]} {selectedYear}</small>
      </div>

      {(activeFilter === 'all' || activeFilter === 'transactions' || activeFilter === 'payments') && (
        <div ref={transactionsRef} className="transactions-section">
          <h2>سجل المعاملات والمدفوعات لشهر {months[selectedMonth - 1]} ({combinedRecords.length})</h2>
          {combinedRecords.length === 0 ? (
            <p className="no-data">لا توجد معاملات أو مدفوعات لهذا الشهر</p>
          ) : (
            <div className="horizontal-cards">
              {filteredRecords.map((record, index) => {
                // حساب الرصيد التراكمي
                let runningBalance = previousBalance;

                // جمع جميع المعاملات السابقة
                for (let i = 0; i <= index; i++) {
                  runningBalance += combinedRecords[i].amount;
                }

                return (
                  <div
                    key={record.id}
                    className={`horizontal-card ${record.type} ${record.data.type || ''}`}
                    onClick={() => openRecordDetails(record)}
                  >
                    <div className="card-left">
                      <div className="date-type">
                        <span className="date">
                          {record.date}
                          {record.data.time && ` ${record.data.time}`}
                        </span>
                        <span className="type-badge">
                          {record.type === 'transaction'
                            ? (record.data.type === 'sale' ? 'بيع' : 'مرتجع')
                            : 'دفعة'}
                        </span>
                      </div>
                      <div className="details">
                        {record.type === 'transaction' ? (
                          <>
                            <span className="product-name">{record.data.products?.name || record.data.item}</span>
                            {record.data.quantity && (
                              <span className="quantity-price">({record.data.quantity} × {Number(record.data.price).toFixed(2)})</span>
                            )}
                          </>
                        ) : (
                          <span className="payment-method">
                            دفعة {record.data.payment_method === 'cash' ? 'نقدي' :
                              record.data.payment_method === 'wallet' ? 'محفظة' :
                                record.data.payment_method || 'غير محدد'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="card-right">
                      <div className="amount-section">
                        <span className="amount">
                          {record.type === 'transaction' && record.data.type === 'sale'
                            ? '+' + record.amount.toFixed(2)
                            : '-' + Math.abs(record.amount).toFixed(2)
                          }
                        </span>

                      </div>
                      <div className="balance-section">
                        <span className="balance">الرصيد: {runningBalance.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* بطاقة الإجمالي النهائي */}
              {/* بطاقة الإجمالي النهائي */}
              <div className="horizontal-card total-card">
                <div className="card-left">
                  <div className="date-type">
                    <span className="date">الإجمالي النهائي</span>
                  </div>
                  <div className="details">
                    <div className="summary-details">
                      <span>المبيعات: +{totalSales.toFixed(2)}</span>
                      <span>المرتجعات: -{totalReturns.toFixed(2)}</span>
                      <span>المدفوعات: -{totalPayments.toFixed(2)}</span>
                    </div>
                    <hr className="total-divider" />
                    <div className="final-row">
                      <span className="label">الرصيد:</span>
                      <span className="value">
                        {totalBalance >= 0 ? '' : ''}{totalBalance.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      <footer className="portal-footer">
        <p>© {new Date().getFullYear()} نظام علي الجداوي. جميع الحقوق محفوظة.</p>
        <p>آخر تحديث: {new Date().toLocaleDateString('ar-EG')}</p>
      </footer>
    </div>
  );
};

export default CustomerPortal;