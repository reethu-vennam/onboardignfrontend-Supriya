
import React, { useEffect, useState } from "react";
import { useSupportAuth } from "../context/SupportAuthContext";
import { getTicketStats } from "../lib/supportApi";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";

export const AdminDashboard: React.FC = () => {
  const { token } = useSupportAuth();
  const [stats, setStats] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  useEffect(() => {
    fetchStats();

    const interval = setInterval(() => {
      fetchStats();
    }, 15000); // auto refresh every 15 sec

    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const data = await getTicketStats(token!);
      setStats(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Dashboard fetch failed");
    }
  };

  if (!stats) return <div className="p-6">Loading dashboard...</div>;

  const chartData = [
    { name: "Open", value: stats.open },
    { name: "Assigned", value: stats.assigned },
    { name: "In Progress", value: stats.in_progress },
    { name: "Resolved", value: stats.resolved },
    { name: "Closed", value: stats.closed },
  ];

  return (
    <div className="space-y-10">

      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">
            Admin Control Center
          </h1>
          <p className="text-gray-500 mt-1">
            Hybrid Executive + Operations Dashboard
          </p>
        </div>

        <div className="text-sm text-gray-400">
          Last updated: {lastUpdated}
        </div>
      </div>

      {/* ========================= */}
      {/* 1️⃣ EXECUTIVE KPI CARDS */}
      {/* ========================= */}
      <div className="grid md:grid-cols-5 gap-6">
        <StatCard title="Total Tickets" value={stats.total} />
        <StatCard title="Open" value={stats.open} color="bg-blue-500" />
        <StatCard title="In Progress" value={stats.in_progress} color="bg-yellow-500" />
        <StatCard title="Resolved" value={stats.resolved} color="bg-green-500" />
        <StatCard title="Closed" value={stats.closed} color="bg-gray-600" />
      </div>

      {/* ========================= */}
      {/* 2️⃣ OPERATIONS ALERT PANEL */}
      {/* ========================= */}
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-red-700 mb-3">
          Operations Alerts
        </h2>

        {stats.open > 10 ? (
          <div className="text-red-600">
            ⚠ High number of open tickets. Immediate action required.
          </div>
        ) : (
          <div className="text-green-600">
            ✅ System operating normally.
          </div>
        )}
      </div>

      {/* ========================= */}
      {/* 3️⃣ ANALYTICS SECTION */}
      {/* ========================= */}
      <div className="grid md:grid-cols-2 gap-8">

        {/* BAR CHART */}
        <div className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">
            Ticket Status Distribution
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* LINE CHART (Trend Placeholder) */}
        <div className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">
            Ticket Activity Trend
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </div>

      </div>

    </div>
  );
};

/* ============================= */
/* STAT CARD COMPONENT */
/* ============================= */
const StatCard = ({
  title,
  value,
  color = "bg-indigo-500",
}: {
  title: string;
  value: number;
  color?: string;
}) => {
  return (
    <div className="bg-white rounded-2xl shadow p-6 flex justify-between items-center hover:shadow-md transition">
      <div>
        <div className="text-sm text-gray-500">{title}</div>
        <div className="text-2xl font-bold text-gray-800 mt-1">
          {value}
        </div>
      </div>
      <div className={`w-12 h-12 rounded-full ${color} opacity-20`} />
    </div>
  );
};