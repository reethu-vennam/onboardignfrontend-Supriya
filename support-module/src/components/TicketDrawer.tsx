
import React, { useState } from "react";

import { API_URL } from "../lib/apiConfig";

interface Props {
  ticket: any;
  onClose: () => void;
  onUpdated?: () => void;
}

export const TicketDrawer: React.FC<Props> = ({
  ticket,
  onClose,
  onUpdated,
}) => {
  const [status, setStatus] = useState(ticket.status);
  const [comment, setComment] = useState("");
  const [updating, setUpdating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const token = localStorage.getItem("token");

  const handleStatusUpdate = async () => {
    setUpdating(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/tickets/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ticketId: ticket.id, status }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update status");
      }
      onUpdated?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/tickets/${ticket.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: `[Internal Note] ${comment}` }),
      });
      if (!res.ok) throw new Error("Failed to save note");
      setComment("");
      onUpdated?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex justify-end z-50">

      <div className="w-full max-w-lg bg-white h-full shadow-2xl p-8 overflow-y-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800">
            Ticket Details
          </h2>

          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-600 rounded text-sm">
            {error}
          </div>
        )}

        {/* Ticket Info */}
        <div className="space-y-4 text-sm mb-8">

          <Info label="Merchant" value={ticket.merchant_name} />
          <Info label="Module" value={ticket.module} />
          <Info label="Title" value={ticket.title} />
          <Info label="Description" value={ticket.description} />
          <Info label="Current Status" value={ticket.status} />

        </div>

        {/* Change Status */}
        <div className="mb-8">
          <h3 className="font-medium text-gray-700 mb-2">
            Update Status
          </h3>

          <div className="flex gap-3">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="open">Open</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>

            <button
              onClick={handleStatusUpdate}
              disabled={updating || status === ticket.status}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {updating ? "Updating..." : "Update"}
            </button>
          </div>
        </div>

        {/* Add Comment */}
        <div>
          <h3 className="font-medium text-gray-700 mb-2">
            Add Internal Note
          </h3>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full border rounded-lg p-3 text-sm"
            rows={4}
            placeholder="Write note here..."
          />

          <button
            onClick={handleAddComment}
            disabled={saving || !comment.trim()}
            className="mt-3 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-black transition disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Note"}
          </button>
        </div>

      </div>
    </div>
  );
};

const Info = ({ label, value }: any) => (
  <div>
    <p className="text-gray-500 text-xs uppercase tracking-wide">
      {label}
    </p>
    <p className="text-gray-800 font-medium mt-1">
      {value || "—"}
    </p>
  </div>
);
