import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

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
      const response = await fetch(import.meta.env.VITE_VALID_VPA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vpa }),
      });

      const data = await response.json();

      console.log("✅ VPA Validation Response:", data);

      if (data.errCode === "1111" && data.is_vpa_valid === "Y") {
        // ✅ Pass the full data including payer_name
        onSuccess({
          vpa: vpa,
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
