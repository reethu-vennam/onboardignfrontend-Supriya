
import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSupportAuth } from "../context/SupportAuthContext";

interface Props {
  children: React.ReactNode;
}

const AdminLayout: React.FC<Props> = ({ children }) => {
  const { logout } = useSupportAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) =>
    location.pathname === path
      ? "text-indigo-600 font-semibold"
      : "text-gray-600 hover:text-indigo-600";

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* ===================== */}
      {/* SIDEBAR */}
      {/* ===================== */}
      <aside className="w-64 bg-white border-r shadow-sm p-6 hidden md:block">
        <h2 className="text-xl font-bold text-indigo-600 mb-8">
          SabbPe Admin
        </h2>

        <div className="space-y-5 text-sm">
          <div
            onClick={() => navigate("/admin")}
            className={`cursor-pointer transition ${isActive("/admin")}`}
          >
            Dashboard
          </div>

          <div
            onClick={() => navigate("/ticket-management")}
            className={`cursor-pointer transition ${isActive("/ticket-management")}`}
          >
            Ticket Management
          </div>

          <div
            onClick={() => navigate("/kyc-details")}
            className={`cursor-pointer transition ${isActive("/kyc-details")}`}
          >
            KYC Details
          </div>
        </div>
      </aside>

      {/* ===================== */}
      {/* MAIN CONTENT */}
      {/* ===================== */}
      <div className="flex-1 flex flex-col">
        {/* TOP BAR */}
        <div className="flex justify-between items-center bg-white px-8 py-4 shadow-sm">
          <div className="text-lg font-semibold text-gray-700">
            Admin Panel
          </div>

          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
          >
            Logout
          </button>
        </div>

        {/* PAGE CONTENT */}
        <div className="flex-1 p-8">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;