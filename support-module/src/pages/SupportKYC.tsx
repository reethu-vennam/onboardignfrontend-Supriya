import React, { useEffect, useState } from "react";
import { useSupportAuth } from "../context/SupportAuthContext";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../lib/apiConfig";

interface Merchant {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  approval_status: string;
}

const SupportKYC = () => {
  const { token } = useSupportAuth();
  const navigate = useNavigate();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAssignedKYC();
  }, []);

  const fetchAssignedKYC = async () => {
    try {
      const response = await fetch(
        `${API_URL}/tickets/support/assigned-kyc`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (!response.ok) {
        throw new Error("Failed to fetch assigned merchants");
      }
      const data = await response.json();
      setMerchants(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <>
      <h1 className="text-2xl font-semibold text-gray-800 mb-8">
        Assigned KYC Reviews
      </h1>
      {error && (
        <div className="mb-6 p-3 bg-red-100 text-red-600 rounded">
          {error}
        </div>
      )}
      <div className="bg-white rounded-xl shadow-sm">
        {merchants.length === 0 ? (
          <div className="p-6 text-gray-500">
            No assigned merchants
          </div>
        ) : (
          merchants.map((merchant) => (
            <div
              key={merchant.id}
              className="p-4 border-b flex justify-between items-center hover:bg-indigo-50"
            >
              <div>
                <div className="font-semibold">
                  {merchant.full_name}
                </div>
                <div className="text-sm text-gray-500">
                  {merchant.email}
                </div>
                <div className="text-xs mt-1">
                  Status: {merchant.approval_status}
                </div>
              </div>
              <button
                onClick={() =>
                  navigate(`/merchant-review/${merchant.user_id}`)
                }
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm"
              >
                Review
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
};

export default SupportKYC;
