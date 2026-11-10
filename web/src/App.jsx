/* src/App.jsx */

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import CustomerPortal from './CustomerPortal';
import AdminApp from './AdminApp.jsx';
import './App.css';

// في App.jsx - تحديث المسار
function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/customer/:customerSlug" element={<CustomerPortal />} />
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="/" element={<AdminApp />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;