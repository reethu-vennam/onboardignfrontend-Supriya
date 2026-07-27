import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { BankAuthProvider, useBankAuth } from './context/BankAuthContext';
import { BankLogin } from './pages/BankLogin';

import { BankDashboard } from './pages/BankDashboard';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated, loading } = useBankAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
};

function AppContent() {
    return (
        <Routes>
            <Route path="/login" element={<BankLogin />} />
            <Route path="/dashboard" element={<ProtectedRoute><BankDashboard /></ProtectedRoute>} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<div className="min-h-screen flex items-center justify-center"><h1 className="text-4xl font-bold">404</h1></div>} />
        </Routes>
    );
}

function App() {
    return (
        <BrowserRouter>
            <BankAuthProvider>
                <AppContent />
            </BankAuthProvider>
        </BrowserRouter>
    );
}

export default App;