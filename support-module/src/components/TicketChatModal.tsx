import React, { useEffect, useState, useRef, useCallback } from "react";

interface Message {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_role: string;
  message: string;
  created_at: string;
}

interface Props {
  ticketId: string;
  onClose: () => void;
}

import { API_URL } from "../lib/apiConfig";

const TicketChatModal: React.FC<Props> = ({ ticketId, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const currentUserId = user?.id;
  const currentRole = user?.role;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/tickets/${ticketId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load messages");
      const data = await res.json();
      setMessages(data);
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [ticketId, token]);

  useEffect(() => {
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch(`${API_URL}/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: newMessage }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      setNewMessage("");
      await fetchMessages();
    } catch (err: any) {
      setError(err.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "merchant": return "Merchant";
      case "super_admin": return "Super Admin";
      case "admin": return "Admin";
      case "support_admin": return "Support Admin";
      case "support_staff": return "Support Staff";
      case "support": return "Support";
      default: return role;
    }
  };

  const isMine = (msg: Message) => {
    if (msg.sender_id === currentUserId) return true;
    const supportRoles = ["support", "support_admin", "support_staff"];
    const myRoles = ["super_admin", "admin", "support", "support_admin", "support_staff"];
    if (supportRoles.includes(msg.sender_role) && supportRoles.includes(currentRole)) return true;
    if (msg.sender_role === currentRole && myRoles.includes(currentRole)) return true;
    return false;
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Today";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  let lastDate = "";

  return (
    <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
      <div className="bg-white w-full max-w-lg rounded-lg shadow-xl flex flex-col" style={{ height: "70vh" }}>
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-bold">Ticket Chat</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">&times;</button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
            </div>
          ) : error && messages.length === 0 ? (
            <div className="flex justify-center items-center h-full text-red-500 text-sm">{error}</div>
          ) : messages.length === 0 ? (
            <div className="flex justify-center items-center h-full text-gray-400 text-sm">No messages yet</div>
          ) : (
            messages.map((msg) => {
              const msgDate = formatDate(msg.created_at);
              const showDate = msgDate !== lastDate;
              lastDate = msgDate;
              const mine = isMine(msg);

              return (
                <React.Fragment key={msg.id}>
                  {showDate && (
                    <div className="flex justify-center my-2">
                      <span className="text-xs bg-gray-200 text-gray-500 px-3 py-1 rounded-full">{msgDate}</span>
                    </div>
                  )}
                  <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                    <div className="text-xs text-gray-400 mb-1">
                      {getRoleLabel(msg.sender_role)}
                    </div>
                    <div
                      className={`px-3 py-2 rounded-lg text-sm max-w-xs ${
                        mine
                          ? "bg-indigo-600 text-white"
                          : "bg-white border text-gray-800"
                      }`}
                    >
                      {msg.message}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{formatTime(msg.created_at)}</div>
                  </div>
                </React.Fragment>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error toast */}
        {error && messages.length > 0 && (
          <div className="px-4 py-2 bg-red-50 text-red-600 text-xs border-t">{error}</div>
        )}

        {/* Input */}
        <div className="p-4 border-t flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Type a message..."
            disabled={sending}
            className="flex-1 border rounded px-3 py-2 text-sm disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={sending || !newMessage.trim()}
            className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TicketChatModal;
