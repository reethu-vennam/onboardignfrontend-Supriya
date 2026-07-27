import React, { useEffect, useState, useMemo } from "react";
import { useSupportAuth } from "../context/SupportAuthContext";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../lib/apiConfig";

const KYCDetails: React.FC = () => {
  const { token } = useSupportAuth();
  const navigate = useNavigate();
  const [merchants, setMerchants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [scoreFilter, setScoreFilter] = useState("");

  useEffect(() => {
    fetchMerchants();
  }, []);

  const fetchMerchants = async () => {
    try {
      const res = await fetch(`${API_URL}/tickets/kyc-list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setMerchants(data);
    } catch (err) {
      console.error("Failed to fetch KYC list");
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    return merchants.filter((m) => {
      const matchSearch =
        !search ||
        m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        m.email?.toLowerCase().includes(search.toLowerCase());

      const matchStatus = !statusFilter || m.onboarding_status === statusFilter;

      const score = m.score ?? 0;
      let matchScore = true;
      if (scoreFilter === "high") matchScore = score >= 80;
      else if (scoreFilter === "medium") matchScore = score >= 50 && score < 80;
      else if (scoreFilter === "low") matchScore = score < 50;

      return matchSearch && matchStatus && matchScore;
    });
  }, [merchants, search, statusFilter, scoreFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    merchants.forEach((m) => {
      const s = m.onboarding_status || "pending";
      counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  }, [merchants]);

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold mb-6">KYC Merchant List</h1>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-4 items-center">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded-lg px-4 py-2 text-sm flex-1 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="">All Status ({merchants.length})</option>
          {Object.entries(statusCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([status, count]) => (
              <option key={status} value={status}>
                {status.replace(/_/g, " ")} ({count})
              </option>
            ))}
        </select>

        <select
          value={scoreFilter}
          onChange={(e) => setScoreFilter(e.target.value)}
          className="border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="">All Scores</option>
          <option value="high">High (80+)</option>
          <option value="medium">Medium (50-79)</option>
          <option value="low">Low (&lt;50)</option>
        </select>

        {(search || statusFilter || scoreFilter) && (
          <button
            onClick={() => { setSearch(""); setStatusFilter(""); setScoreFilter(""); }}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="text-sm text-gray-500 mb-3">
        Showing {filtered.length} of {merchants.length} merchants
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
            <tr>
              <th className="p-4 text-left">Name</th>
              <th className="p-4 text-left">Email</th>
              <th className="p-4 text-left">Status</th>
              <th className="p-4 text-left">Score</th>
              <th className="p-4 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-gray-400">No merchants found</td></tr>
            ) : (
              filtered.map((merchant) => (
                <tr key={merchant.user_id} className="border-b hover:bg-gray-50">
                  <td className="p-4 font-medium">{merchant.full_name}</td>
                  <td className="p-4 text-gray-600">{merchant.email}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      merchant.onboarding_status === "approved" ? "bg-green-100 text-green-700" :
                      merchant.onboarding_status === "rejected" ? "bg-red-100 text-red-700" :
                      merchant.onboarding_status === "submitted" ? "bg-blue-100 text-blue-700" :
                      merchant.onboarding_status === "in_progress" ? "bg-yellow-100 text-yellow-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      {(merchant.onboarding_status || "pending").replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      (merchant.score ?? 0) >= 80 ? "bg-green-100 text-green-700" :
                      (merchant.score ?? 0) >= 50 ? "bg-yellow-100 text-yellow-700" :
                      "bg-red-100 text-red-700"
                    }`}>
                      {merchant.score ?? 0}
                    </span>
                  </td>
                  <td className="p-4">
                    <button onClick={() => navigate(`/merchant-review/${merchant.user_id}`)} className="px-4 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                      Review
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default KYCDetails;
