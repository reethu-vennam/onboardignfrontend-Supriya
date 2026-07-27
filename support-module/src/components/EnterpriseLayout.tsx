
import React from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut } from "lucide-react";

interface Props {
  children: React.ReactNode;
  title: string;
  userRole?: string;
  onLogout: () => void;
}

export const EnterpriseLayout: React.FC<Props> = ({
  children,
  title,
  userRole,
  onLogout,
}) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex">

      {/* Glass Sidebar */}
      <aside className="w-60 backdrop-blur-xl bg-white/60 border-r border-white/40 shadow-lg">

        <div className="p-6 border-b border-white/40">
          <h2 className="text-lg font-semibold text-gray-800">
            SabbPe
          </h2>
          <p className="text-xs text-gray-500">
            Support Portal
          </p>
        </div>

        <nav className="p-4 space-y-2">
          <button
            onClick={() => navigate("/admin")}
            className="flex items-center gap-3 w-full px-4 py-2 rounded-xl text-gray-700 hover:bg-white/70 transition"
          >
            <LayoutDashboard size={18} />
            Dashboard
          </button>
        </nav>

        <div className="p-4 mt-auto border-t border-white/40">
          <button
            onClick={onLogout}
            className="flex items-center gap-3 w-full px-4 py-2 rounded-xl text-red-600 hover:bg-red-50 transition"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>

      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">

        <header className="backdrop-blur-xl bg-white/60 border-b border-white/40 px-8 py-4 flex justify-between items-center shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-800">
            {title}
          </h1>

          <span className="px-3 py-1 text-xs rounded-lg bg-blue-100 text-blue-600 font-medium">
            {userRole}
          </span>
        </header>

        <main className="p-10">
          {children}
        </main>

      </div>
    </div>
  );
};