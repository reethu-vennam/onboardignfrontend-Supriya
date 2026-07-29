import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from '@/lib/rest-api';
import { authService } from '@/lib/auth-service';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, MessageSquare, Clock, Send } from "lucide-react";

interface Ticket {
  id: string;
  module: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_role: string;
  message: string;
  created_at: string;
}

const SUPPORT_API = import.meta.env.VITE_SUPPORT_API_URL || "http://localhost:5000";

export const ViewTicketButton: React.FC = () => {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // Chat state
  const [chatTicketId, setChatTicketId] = useState<string | null>(null);
  const [chatTicketTitle, setChatTicketTitle] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const token = authService.getToken();
      const user = authService.getUser();

      if (!token || !user) {
        throw new Error("User not authenticated");
      }

      const response = await fetch(
        `${SUPPORT_API}/api/tickets/merchant/${user.id}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch tickets");
      }

      const data = await response.json();
      setTickets(data);
    } catch (error) {
      console.error("Error fetching tickets:", error);
      toast({
        title: "Error",
        description: "Failed to load tickets",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    fetchTickets();
  };

  // Chat functions
  const openChat = (ticketId: string, title: string) => {
    setChatTicketId(ticketId);
    setChatTicketTitle(title);
    setMessages([]);
    setChatError("");
  };

  const closeChat = () => {
    setChatTicketId(null);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchMessages = useCallback(async () => {
    if (!chatTicketId) return;
    try {
      const user = authService.getUser();
      if (!user) return;

      const res = await fetch(
        `${SUPPORT_API}/api/tickets/merchant/${chatTicketId}/messages?merchant_id=${user.id}`
      );
      if (!res.ok) throw new Error("Failed to load messages");
      const data = await res.json();
      setMessages(data);
      setChatError("");
    } catch (err: any) {
      setChatError(err.message || "Failed to load messages");
    } finally {
      setChatLoading(false);
    }
  }, [chatTicketId]);

  useEffect(() => {
    if (!chatTicketId) return;
    setChatLoading(true);
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [chatTicketId, fetchMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || sending || !chatTicketId) return;

    setSending(true);
    try {
      const user = authService.getUser();
      if (!user) throw new Error("Not authenticated");

      const res = await fetch(
        `${SUPPORT_API}/api/tickets/merchant/${chatTicketId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ merchant_id: user.id, message: newMessage }),
        }
      );
      if (!res.ok) throw new Error("Failed to send message");
      setNewMessage("");
      await fetchMessages();
    } catch (err: any) {
      setChatError(err.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "open":
        return "bg-red-100 text-red-800";
      case "in_progress":
        return "bg-yellow-100 text-yellow-800";
      case "resolved":
        return "bg-green-100 text-green-800";
      case "closed":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" onClick={handleOpen}>
            <Eye className="w-4 h-4 mr-2" />
            View Tickets
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>My Support Tickets</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="mt-2 text-muted-foreground">Loading tickets...</p>
              </div>
            ) : tickets.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No tickets found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  You haven't created any support tickets yet
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {tickets.map((ticket) => (
                  <Card key={ticket.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{ticket.title}</CardTitle>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge className={getStatusColor(ticket.status)}>
                              {ticket.status.replace("_", " ")}
                            </Badge>
                            <Badge variant="outline">{ticket.module}</Badge>
                            <Badge variant="outline" className="capitalize">
                              {ticket.priority}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground mb-3">{ticket.description}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center text-sm text-muted-foreground">
                          <Clock className="w-4 h-4 mr-1" />
                          Created: {formatDate(ticket.created_at)}
                          {ticket.updated_at !== ticket.created_at && (
                            <span className="ml-4">
                              Updated: {formatDate(ticket.updated_at)}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openChat(ticket.id, ticket.title)}
                        >
                          <MessageSquare className="w-4 h-4 mr-1" />
                          Chat
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Chat Modal */}
      {chatTicketId && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-lg rounded-lg shadow-xl flex flex-col" style={{ height: "70vh" }}>
            {/* Chat Header */}
            <div className="flex justify-between items-center p-4 border-b">
              <div>
                <h2 className="text-lg font-bold">Ticket Chat</h2>
                <p className="text-xs text-muted-foreground">{chatTicketTitle}</p>
              </div>
              <button onClick={closeChat} className="text-gray-400 hover:text-gray-700 text-xl">&times;</button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {chatLoading ? (
                <div className="flex justify-center items-center h-full">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                </div>
              ) : chatError && messages.length === 0 ? (
                <div className="flex justify-center items-center h-full text-red-500 text-sm">{chatError}</div>
              ) : messages.length === 0 ? (
                <div className="flex justify-center items-center h-full text-gray-400 text-sm">
                  No messages yet. Send a message to start the conversation.
                </div>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.sender_role === "merchant";
                  return (
                    <div key={msg.id} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                      <div className="text-xs text-gray-400 mb-1">
                        {isMine ? "You" : "Support"}
                      </div>
                      <div
                        className={`px-3 py-2 rounded-lg text-sm max-w-xs ${
                          isMine
                            ? "bg-indigo-600 text-white"
                            : "bg-white border text-gray-800"
                        }`}
                      >
                        {msg.message}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{formatTime(msg.created_at)}</div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Error */}
            {chatError && messages.length > 0 && (
              <div className="px-4 py-2 bg-red-50 text-red-600 text-xs border-t">{chatError}</div>
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
                className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};


