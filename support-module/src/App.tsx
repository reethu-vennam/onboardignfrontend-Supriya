
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import {
  SupportAuthProvider,
  useSupportAuth,
} from "./context/SupportAuthContext";
import { SupportLogin } from "./pages/SupportLogin";
import { SupportDashboard } from "./pages/SupportDashboard";
import { AdminDashboard } from "./pages/AdminDashboard";
import MerchantReview from "./pages/MerchantReview";
import TicketManagement from "./pages/TicketManagement";
import AdminLayout from "./components/AdminLayout";
import KYCDetails from "./pages/KYCDetails";
import SupportLayout from "./components/SupportLayout";
import SupportKYC from "./pages/SupportKYC";
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isAuthenticated, loading } = useSupportAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
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
      <Route path="/login" element={<SupportLogin />} />

      {/* SUPPORT DASHBOARD */}
      <Route
  path="/support"
  element={
    <ProtectedRoute>
      <SupportLayout>
        <SupportDashboard />
      </SupportLayout>
    </ProtectedRoute>
  }
/>
<Route
  path="/support-kyc"
  element={
    <ProtectedRoute>
      <SupportLayout>
        <SupportKYC />
      </SupportLayout>
    </ProtectedRoute>
  }
/>
      {/* ADMIN DASHBOARD */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <AdminDashboard />
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      {/* TICKET MANAGEMENT */}
      <Route
        path="/ticket-management"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <TicketManagement />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
  path="/kyc-details"
  element={
    <ProtectedRoute>
      <AdminLayout>
        <KYCDetails />
      </AdminLayout>
    </ProtectedRoute>
  }
/>

      <Route
        path="/merchant-review/:merchantId"
        element={
          <ProtectedRoute>
            <MerchantReview />
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<Navigate to="/support" replace />} />

      <Route
        path="*"
        element={<div className="p-10 text-center">404 - Page not found</div>}
      />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <SupportAuthProvider>
        <AppContent />
      </SupportAuthProvider>
    </BrowserRouter>
  );
}

export default App;
