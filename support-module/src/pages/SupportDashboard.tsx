
import React, { useEffect, useState } from "react";
import { useSupportAuth } from "../context/SupportAuthContext";
import { useNavigate } from "react-router-dom";
import { getTickets } from "../lib/supportApi";
import { API_URL } from "../lib/apiConfig";
import TicketChatModal from "../components/TicketChatModal";

export const SupportDashboard: React.FC = () => {
  const { token } = useSupportAuth();
  const navigate = useNavigate();

  const [tickets, setTickets] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState("");
  const [chatTicketId, setChatTicketId] = useState<string | null>(null);
const user = JSON.parse(localStorage.getItem("user") || "{}");
  useEffect(() => {
    fetchTickets();
  }, [page]);

  const fetchTickets = async () => {
    try {
      const data = await getTickets(token!, page, 5);
      setTickets(data?.tickets || []);
      setPages(data?.pages || 1);
    } catch {
      setError("Failed to fetch tickets");
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

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }

      fetchTickets();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const statusBadge = (status: string) => {
    const base =
      "px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide";

    switch (status) {
      case "assigned":
        return `${base} bg-purple-100 text-purple-700`;
      case "in_progress":
        return `${base} bg-yellow-100 text-yellow-700`;
      case "resolved":
        return `${base} bg-green-100 text-green-700`;
      case "closed":
        return `${base} bg-gray-200 text-gray-600`;
      default:
        return `${base} bg-blue-100 text-blue-700`;
    }
  };

  const openChat = (ticketId: string) => {
    setChatTicketId(ticketId);
  };

  return (
    <>
      <h1 className="text-2xl font-semibold text-gray-800 mb-8">
        My Assigned Tickets
      </h1>

      {error && (
        <div className="mb-6 p-3 bg-red-100 text-red-600 rounded">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="p-4 text-left">Name</th>
                <th className="p-4 text-left">Phone</th>
                <th className="p-4 text-left">Email</th>
                <th className="p-4 text-left">Title</th>
                <th className="p-4 text-left">Status</th>
                <th className="p-4 text-left">Chat</th>
                <th className="p-4 text-left">Action</th>
              </tr>
            </thead>

            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="border-b hover:bg-indigo-50">
                  <td className="p-4 font-medium">{ticket.merchant_name || 'N/A'}</td>
                  <td className="p-4">{ticket.merchant_phone || 'N/A'}</td>
                  <td className="p-4">{ticket.merchant_email || 'N/A'}</td>
                  <td className="p-4">{ticket.title}</td>

                  <td className="p-4">
                    <span className={statusBadge(ticket.status)}>
                      {ticket.status.replace("_", " ")}
                    </span>
                  </td>

                  <td className="p-4 text-center">
                    <button
                      onClick={() => openChat(ticket.id)}
                      className="relative px-3 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700 transition-colors"
                    >
                      Chat
                      {ticket.last_message_role &&
                        ticket.last_message_role !== user.role && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                        )}
                    </button>
                  </td>

                  <td className="p-4 text-center space-x-2">
                    {(ticket.status === "open" || ticket.status === "assigned") && (
                      <button
                        onClick={async () => {
                          if (ticket.status === "open") {
                            await updateStatus(ticket.id, "assigned");
                            await new Promise(r => setTimeout(r, 500));
                          }
                          await updateStatus(ticket.id, "in_progress");
                        }}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition-colors"
                      >
                        Start
                      </button>
                    )}

                    {ticket.status === "in_progress" && (
                      <button
                        onClick={() =>
                          updateStatus(ticket.id, "resolved")
                        }
                        className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition-colors"
                      >
                        Mark Resolved
                      </button>
                    )}

                    {ticket.status === "resolved" && (
                      <span className="px-3 py-1 bg-gray-200 text-gray-600 rounded text-xs">
                        Waiting Admin
                      </span>
                    )}

                    {ticket.status === "closed" && (
                      <span className="px-3 py-1 bg-gray-300 text-gray-700 rounded text-xs">
                        Closed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {chatTicketId && (
        <TicketChatModal
          ticketId={chatTicketId}
          onClose={() => setChatTicketId(null)}
        />
      )}
    </>
  );
};
