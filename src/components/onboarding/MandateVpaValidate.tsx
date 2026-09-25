import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const ECOSYSTEM_BASE_URL = import.meta.env.VITE_SABBPE_ECOSYSTEM_BASE_URL || "https://ecosystemuat.sabbpe.com";
const TOKEN_URL = `${ECOSYSTEM_BASE_URL}/sabbpe/v1/token`;
const VALIDATE_VPA_URL = `${ECOSYSTEM_BASE_URL}/api/v1/validvpa`;

export interface VpaValidationData {
  vpa: string;
  payer_name: string;
}

interface MandateVpaValidateProps {
  onSuccess: (data: VpaValidationData) => void; // ✅ Changed to pass object instead of string
}

export const MandateVpaValidate: React.FC<MandateVpaValidateProps> = ({ onSuccess }) => {
  const [vpa, setVpa] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleValidate = async () => {
    if (!vpa.trim()) {
      setError("Please enter a UPI ID");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const userId = import.meta.env.VITE_SABBPE_ECOSYSTEM_USER_ID || import.meta.env.VITE_SABBPE_USER_ID;
      const merchantId = import.meta.env.VITE_SABBPE_ECOSYSTEM_MERCHANT_ID || import.meta.env.VITE_SABBPE_MERCHANT_ID;
      const password = import.meta.env.VITE_SABBPE_ECOSYSTEM_PASSWORD || import.meta.env.VITE_SABBPE_PASSWORD;

      if (!userId || !merchantId || !password) {
        throw new Error("Ecosystem token configuration is missing");
      }

      const tokenResponse = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sabbpe_userid: userId,
          sabbpe_merchantid: merchantId,
          sabbpe_password: password,
          timestamp: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).replace("T", " ").slice(0, 19),
          merchant_order_ref: `ORD-VPA-${Date.now()}`,
          service_code: "NACH_MANDATE",
        }),
      });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || !tokenData.status || !tokenData.sabbpe_token) {
        throw new Error(tokenData.message || tokenData.errDesc || "Failed to obtain ecosystem token");
      }

      const validationResponse = await fetch(VALIDATE_VPA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sabbpe_token: tokenData.sabbpe_token,
          vpa: vpa.trim(),
        }),
      });
      const data = await validationResponse.json();
      if (!validationResponse.ok) {
        throw new Error(data.errDesc || data.message || "VPA validation request failed");
      }

      console.log("✅ VPA Validation Response:", data);

      if (data.errCode === "1111" && data.is_vpa_valid === "Y") {
        // ✅ Pass the full data including payer_name
        onSuccess({
          vpa: vpa.trim(),
          payer_name: data.payer_name || "Unknown", // Extract payer_name from response
        });
      } else {
        setError(data.errDesc || "Invalid UPI ID. Please check and try again.");
      }
    } catch (err) {
      console.error("validvpa error:", err);
      setError("Failed to validate UPI ID. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-0 shadow-none">
      <CardContent className="p-6 space-y-4">
        <div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Validate UPI ID</h3>
          <p className="text-sm text-gray-600">Enter your UPI ID to set up the autopay mandate</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="vpa" className="text-sm font-medium text-gray-700">UPI ID</label>
          <Input id="vpa" type="text" placeholder="yourname@upi" value={vpa} onChange={(e) => setVpa(e.target.value)} className="w-full" disabled={loading} />
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

        <Button onClick={handleValidate} disabled={loading || !vpa.trim()} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-5">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Validating...
            </>
          ) : (
            "Validate"
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

export default MandateVpaValidate;
