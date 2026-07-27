import React, { useState } from "react";
import { useSupportAuth } from "../context/SupportAuthContext";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../lib/apiConfig";

export const CreateSupport: React.FC = () => {
  const { token } = useSupportAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    try {
      setError("");
      setSuccess("");
      setLoading(true);
      const response = await fetch(
        `${API_URL}/auth/create-support`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ name, email, password })
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message);
      }
      setSuccess("Support user created successfully");
      setName("");
      setEmail("");
      setPassword("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="bg-white shadow-xl rounded-2xl w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-800">
            Create Support User
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Super Admin can create internal support accounts
          </p>
        </div>
        {error && (
          <div className="bg-red-100 text-red-600 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-100 text-green-700 p-3 rounded mb-4 text-sm">
            {success}
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Support Name
            </label>
            <input
              type="text"
              placeholder="Enter full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Support Email
            </label>
            <input
              type="email"
              placeholder="support@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Set Password
            </label>
            <input
              type="password"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Recommended: Mix uppercase, lowercase, number & symbol
            </p>
          </div>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition duration-200 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Support"}
          </button>
          <button
            onClick={() => navigate("/admin")}
            className="w-full text-gray-500 text-sm hover:underline mt-2"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateSupport;
