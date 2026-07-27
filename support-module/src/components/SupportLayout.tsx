// SupportLayout.tsx
import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSupportAuth } from "../context/SupportAuthContext";

const SupportLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { logout } = useSupportAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) =>
    location.pathname === path
      ? "text-indigo-600 font-semibold"
      : "text-gray-600 hover:text-indigo-600";

  return (
    <div className="flex min-h-screen bg-gray-50">

      {/* Sidebar */}
      <aside className="w-64 bg-white border-r shadow-sm p-6 hidden md:block">
        <h2 className="text-xl font-bold text-indigo-600 mb-8">
          SabbPe Support
        </h2>

        <div className="space-y-5 text-sm">
          <div
            onClick={() => navigate("/support")}
            className={`cursor-pointer ${isActive("/support")}`}
          >
            My Tickets
          </div>

          <div
            onClick={() => navigate("/support-kyc")}
            className={`cursor-pointer ${isActive("/support-kyc")}`}
          >
            KYC Review
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        <div className="flex justify-between items-center bg-white px-8 py-4 shadow-sm">
          <div className="text-lg font-semibold text-gray-700">
            Support Panel
          </div>

          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="px-4 py-2 bg-red-500 text-white rounded-lg"
          >
            Logout
          </button>
        </div>

        <div className="flex-1 p-8">{children}</div>
      </div>
    </div>
  );
};

export default SupportLayout;