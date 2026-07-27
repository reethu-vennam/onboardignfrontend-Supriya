import React from "react";
import { useNavigate } from "react-router-dom";

interface Props {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  onLogout: () => void;
}

export const Layout: React.FC<Props> = ({
  children,
  title,
  subtitle,
  onLogout,
}) => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-gray-50">

      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-lg border-r border-gray-200">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold text-blue-600">SabbPe Admin</h2>
          <p className="text-xs text-gray-400">Support System</p>
        </div>

        <nav className="p-4 space-y-2">
          <button
            onClick={() => navigate("/admin")}
            className="w-full text-left px-4 py-2 rounded-lg hover:bg-blue-50 text-gray-700"
          >
            Dashboard
          </button>

          <button
            onClick={onLogout}
            className="w-full text-left px-4 py-2 rounded-lg hover:bg-red-50 text-red-600"
          >
            Logout
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800">{title}</h1>
          {subtitle && (
            <p className="text-gray-500 text-sm mt-1">{subtitle}</p>
          )}
        </div>

        {children}
      </div>
    </div>
  );
};