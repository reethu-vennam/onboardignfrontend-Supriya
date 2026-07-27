import React, { useEffect, useState } from "react";
import { useSupportAuth } from "../context/SupportAuthContext";
import {
  getTickets,
  getTicketStats,
  getSupportUsers,
} from "../lib/supportApi";
import { API_URL } from "../lib/apiConfig";
import TicketChatModal from "../components/TicketChatModal";

// interface Ticket {
//   id: string;
//   module: string;
//   title: string;
//   status: string;
//   assigned_to?: string;
// }
interface Ticket {
  id: string;
  module: string;
  title: string;
  status: string;
  assigned_to?: string;
  last_message_role?: string;
}

interface SupportUser {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
}

const TicketManagement: React.FC = () => {
  const { token } = useSupportAuth();
const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [supportUsers, setSupportUsers] = useState<SupportUser[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [selectedStatus, setSelectedStatus] = useState("");
  const [chatTicketId, setChatTicketId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);

  // SUPPORT MODAL STATE
  const [showSupportModal, setShowSupportModal] = useState(false);

  // CREATE SUPPORT FORM STATE
  const [supportName, setSupportName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPassword, setSupportPassword] = useState("");

  /* ============================
     INITIAL LOAD
  ============================ */
  useEffect(() => {
    fetchStats();
    fetchSupportUsers();
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [page, selectedStatus]);

  /* ============================
     FETCH FUNCTIONS
  ============================ */
  const fetchStats = async () => {
    try {
      const data = await getTicketStats(token!);
      setStats(data);
    } catch (error) {
      console.error("Stats error:", error);
    }
  };

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const data = await getTickets(token!, page, 10, "", selectedStatus);

      if (data && Array.isArray(data.tickets)) {
        setTickets(data.tickets);
        setPages(data.pages || 1);
      } else {
        setTickets([]);
      }
    } catch (error) {
      console.error("Ticket fetch error:", error);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSupportUsers = async () => {
    try {
      const data = await getSupportUsers(token!);
      setSupportUsers(data || []);
    } catch (error) {
      console.error("Support users error:", error);
    }
  };

  /* ============================
     ACTIONS
  ============================ */
  const assignToSupport = async (ticketId: string, userId: string) => {
    try {
      const res = await fetch(`${API_URL}/tickets/assign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ticketId, userId }),
      });
      if (!res.ok) throw new Error();
      fetchTickets();
    } catch {
      alert("Failed to assign ticket");
    }
  };

  const updateStatus = async (ticketId: string, status: string) => {
    try {
      const res = await fetch(`${API_URL}/tickets/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ticketId, status }),
      });
      if (!res.ok) throw new Error();
      fetchTickets();
    } catch {
      alert("Failed to update status");
    }
  };

  const toggleSupport = async (userId: string) => {
    try {
      await fetch(`${API_URL}/auth/support-toggle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
      });
      fetchSupportUsers();
    } catch {
      alert("Failed to update support status");
    }
  };

  const deleteSupportUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this support user?")) return;

    try {
      const res = await fetch(`${API_URL}/auth/support-delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.message || "Failed to delete user");
        return;
      }

      alert("Support user deleted ✅");
      fetchSupportUsers();
    } catch {
      alert("Failed to delete support user");
    }
  };

  const createSupportUser = async () => {
    if (!supportName || !supportEmail || !supportPassword) {
      alert("All fields are required");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/support/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: supportName,
          email: supportEmail,
          password: supportPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.message);
        return;
      }

      alert("Support user created successfully ✅");
      setSupportName("");
      setSupportEmail("");
      setSupportPassword("");
      fetchSupportUsers();
    } catch {
      alert("Failed to create support user");
    }
  };

  /* ============================
     UI
  ============================ */
  return (
    <div className="p-8">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Ticket Management</h1>
        <button
          onClick={() => setShowSupportModal(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg"
        >
          Manage Support
        </button>
      </div>

      {/* STATUS CARDS */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {Object.entries(stats).map(([key, value]) => (
            <div
              key={key}
              onClick={() => {
                setSelectedStatus(key === "total" ? "" : key);
                setPage(1);
              }}
              className="cursor-pointer rounded-xl p-4 shadow-sm bg-white hover:bg-indigo-50"
            >
              <div className="text-sm capitalize">{key.replace("_", " ")}</div>
              <div className="text-xl font-bold mt-2">{value as number}</div>
            </div>
          ))}
        </div>
      )}

      {/* TABLE */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase">
            <tr>
              <th className="p-4 text-left">Module</th>
              <th className="p-4 text-left">Title</th>
              <th className="p-4 text-left">Status</th>
              <th className="p-4 text-left">Assign</th>
              <th className="p-4 text-left">Chat</th>
              <th className="p-4 text-left">Action</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="p-6 text-center">
                  Loading tickets...
                </td>
              </tr>
            ) : tickets.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center">
                  No tickets found
                </td>
              </tr>
            ) : (
              tickets.map((ticket) => (
                <tr key={ticket.id} className="border-b">
                  <td className="p-4">{ticket.module}</td>
                  <td className="p-4">{ticket.title}</td>
                  <td className="p-4 capitalize">{ticket.status}</td>

                  <td className="p-4">
                    <select
                      value={ticket.assigned_to || ""}
                      onChange={(e) =>
                        assignToSupport(ticket.id, e.target.value)
                      }
                      className="border px-3 py-1 rounded"
                    >
                      <option value="">Unassigned</option>
                      {supportUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="p-4">
                    {/* <button
                      onClick={() => setChatTicketId(ticket.id)}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-xs"
                    >
                      Chat
                    </button> */}
                  <button
  onClick={() => setChatTicketId(ticket.id)}
  className="relative px-3 py-1 bg-blue-600 text-white rounded text-xs"
>
  Chat

  {ticket.last_message_role &&
    ticket.last_message_role !== user.role && (
      <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
    )}
</button>  
                  </td>

                  <td className="p-4">
                    {ticket.status === "resolved" && (
                      <button
                        onClick={() => updateStatus(ticket.id, "closed")}
                        className="px-3 py-1 bg-green-600 text-white rounded text-xs"
                      >
                        Close
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* SUPPORT MANAGEMENT MODAL */}
      {showSupportModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl p-8 animate-fadeIn">

            {/* HEADER */}
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Support Management</h2>
              <button
                onClick={() => setShowSupportModal(false)}
                className="text-gray-400 hover:text-black text-lg"
              >
                ✕
              </button>
            </div>

            {/* CREATE SUPPORT FORM */}
            <div className="mb-6 border-b pb-4">
              <h3 className="font-semibold mb-2">Create New Support User</h3>
              <div className="flex flex-col md:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Name"
                  value={supportName}
                  onChange={(e) => setSupportName(e.target.value)}
                  className="border p-2 rounded w-full"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  className="border p-2 rounded w-full"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={supportPassword}
                  onChange={(e) => setSupportPassword(e.target.value)}
                  className="border p-2 rounded w-full"
                />
                <button
                  onClick={createSupportUser}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg"
                >
                  Create
                </button>
              </div>
            </div>

            {/* SUPPORT LIST */}
            <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
              {supportUsers.length === 0 && (
                <div className="text-center text-gray-400 py-8">
                  No support users found
                </div>
              )}

              {supportUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex justify-between items-center p-4 rounded-xl border hover:shadow-md transition"
                >
                  <div>
                    <div className="font-semibold text-gray-800">{user.name}</div>
                    <div className="text-sm text-gray-500">{user.email}</div>

                    <div className="mt-2">
                      <span
                        className={`text-xs px-3 py-1 rounded-full font-medium ${
                          user.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {user.is_active ? "Active" : "Disabled"}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleSupport(user.id)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition ${
                        user.is_active
                          ? "bg-red-600 hover:bg-red-700"
                          : "bg-green-600 hover:bg-green-700"
                      }`}
                    >
                      {user.is_active ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => deleteSupportUser(user.id)}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gray-600 hover:bg-gray-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* FOOTER */}
            <div className="mt-6 text-right">
              <button
                onClick={() => setShowSupportModal(false)}
                className="px-5 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CHAT MODAL */}
      {chatTicketId && (
        <TicketChatModal
          ticketId={chatTicketId}
          onClose={() => setChatTicketId(null)}
        />
      )}

      {/* PAGINATION */}
      <div className="flex justify-between items-center mt-6">
        <button
          disabled={page === 1}
          onClick={() => setPage((prev) => prev - 1)}
          className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
        >
          Previous
        </button>

        <span className="text-sm">
          Page {page} of {pages}
        </span>

        <button
          disabled={page === pages}
          onClick={() => setPage((prev) => prev + 1)}
          className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default TicketManagement;