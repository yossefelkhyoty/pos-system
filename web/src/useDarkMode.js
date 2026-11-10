// src/useDarkMode.js - Hook لإدارة Dark Mode
import { useState, useEffect } from 'react';

export const useDarkMode = () => {
  // قراءة التفضيل المحفوظ من localStorage أو استخدام النظام الافتراضي
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) {
      return JSON.parse(saved);
    }
    // إذا لم يكن هناك تفضيل محفوظ، استخدم تفضيل النظام
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    // حفظ التفضيل في localStorage
    localStorage.setItem('darkMode', JSON.stringify(darkMode));

    // تطبيق الـ class على body
    if (darkMode) {
      document.documentElement.classList.add('dark-mode');
      document.body.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
      document.body.classList.remove('dark-mode');
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  return [darkMode, toggleDarkMode];
};
