import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Clock, CheckCircle } from "lucide-react";
import { authService } from '@/lib/auth-service';
import { api } from '@/lib/rest-api';

interface MandateCreateProps {
  vpa: string;
  payerName: string;
  onSuccess: () => void;
  merchantProfile: any;
  user: any;
  refetchMerchant: () => void;
}

const MandateCreate: React.FC<MandateCreateProps> = ({
  vpa,
  payerName,
  onSuccess,
  merchantProfile,
  user,
  refetchMerchant,
}) => {
  // ✅ CHANGED: Get amount from merchantProfile, default to "4.00" if not available
  const [amount, setAmount] = useState("4.00");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mandateSubmitted, setMandateSubmitted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(600);
  const [mandateRefNo, setMandateRefNo] = useState("");
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [pollIntervalId, setPollIntervalId] = useState<any>(null);
  const [nextDebitDate, setNextDebitDate] = useState("");

  // ✅ NEW: Update amount when merchantProfile changes
  useEffect(() => {
    console.log("🔍 MandateCreate - merchantProfile changed:", merchantProfile);
    console.log("🔍 MandateCreate - total_monthly_cost:", merchantProfile?.total_monthly_cost);

    if (merchantProfile?.total_monthly_cost) {
      // Convert to string with 2 decimal places
      const monthlyCost = parseFloat(merchantProfile.total_monthly_cost).toFixed(2);
      setAmount(monthlyCost);
      console.log("💰 Updated mandate amount from profile:", monthlyCost);
    } else {
      console.warn("⚠️ No total_monthly_cost found, using default 4.00");
    }
  }, [merchantProfile]);

  // Resume an already-submitted mandate on mount (e.g. after a page refresh) instead of
  // restarting the flow from scratch — the trxnno/status live in the browser's memory only
  // otherwise, so a refresh would silently lose track of a mandate the merchant already
  // submitted, even one that has since gone active on the ecosystem's side.
  useEffect(() => {
    const persistedRefNo = merchantProfile?.upi_mandate_ref_no;
    const persistedStatus = merchantProfile?.upi_mandate_status;
    if (persistedRefNo && persistedStatus !== "active" && persistedStatus !== "failed") {
      setMandateRefNo(persistedRefNo);
      setMandateSubmitted(true);
      setTimeRemaining(600);
    }
  }, [merchantProfile?.upi_mandate_ref_no]);

  // Initialize dates
  useEffect(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");

    const start = `${yyyy}-${mm}-${dd}`;
    setStartDate(start);

    // END DATE (+1 year)
    const nextYear = `${yyyy + 1}-${mm}-${dd}`;
    setEndDate(nextYear);

    // NEXT DEBIT DATE (+1 month)
    const nextMonthDate = new Date(today);
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);

    const yyyy2 = nextMonthDate.getFullYear();
    const mm2 = String(nextMonthDate.getMonth() + 1).padStart(2, "0");
    const dd2 = String(nextMonthDate.getDate()).padStart(2, "0");

    setNextDebitDate(`${yyyy2}-${mm2}-${dd2}`);
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!mandateSubmitted) return;

    if (timeRemaining <= 0) {
      setError("Mandate request timed out. Please try again.");
      return;
    }

    const interval = setInterval(() => setTimeRemaining((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [mandateSubmitted, timeRemaining]);

  // Create mandate — via backend-spring, which onboards the merchant into the SabbPe
  // ecosystem, fetches a service token, and creates the mandate there (secret_key and
  // service credentials stay server-side; see SabbpeEcosystemService).
  const handleSubmit = async () => {
    setLoading(true);
    setError("");

    try {
      const result = await api.createEcosystemMandate({
        vpa,
        payerName,
        amount,
        startDate,
        endDate,
      });

      setMandateSubmitted(true);
      setMandateRefNo(result.trxnno);
      setTimeRemaining(600);
    } catch (err: any) {
      setError(err?.message || "Failed to create mandate.");
    } finally {
      setLoading(false);
    }
  };

  // Check mandate status (backend polls the ecosystem, persists it, and — once active —
  // creates the first product's subscription)
  const checkMandateStatus = async (auto = false) => {
    if (!mandateRefNo) return;

    if (!auto) setCheckingStatus(true);
    setError("");

    try {
      const result = await api.pollEcosystemMandateStatus(mandateRefNo);

      if (result.status === "active" || result.status === "failed") {
        if (pollIntervalId) clearInterval(pollIntervalId);
        await refetchMerchant();
        onSuccess();
      } else if (!auto) {
        setError("Authorization pending. Approve in your UPI app.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to check mandate status.");
    } finally {
      if (!auto) setCheckingStatus(false);
    }
  };

  // Auto-poll every 1 minute
  useEffect(() => {
    if (mandateSubmitted && mandateRefNo) {
      const id = setInterval(() => checkMandateStatus(true), 60000);
      setPollIntervalId(id);
      return () => clearInterval(id);
    }
  }, [mandateSubmitted, mandateRefNo]);

  // Cleanup on close/unmount
  useEffect(() => {
    return () => pollIntervalId && clearInterval(pollIntervalId);
  }, [pollIntervalId]);

  // =============================
  // UI – AFTER MANDATE SUBMITTED
  // =============================
  if (mandateSubmitted) {
    return (
      <Card className="border-0 shadow-none">
        <CardContent className="p-6 text-center space-y-5">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <Clock className="w-8 h-8 text-blue-600" />
            </div>
          </div>

          <h3 className="text-xl font-semibold">Authorize Mandate</h3>
          <p className="text-sm text-gray-600">
            Please approve the mandate request in your UPI app. We'll detect it automatically once you do.
          </p>

          {/* Timer */}
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Time remaining</p>
            <p className="text-3xl font-bold text-blue-600">
              {String(Math.floor(timeRemaining / 60)).padStart(2, "0")}:
              {String(timeRemaining % 60).padStart(2, "0")}
            </p>
          </div>

          {/* Ref Number */}
          <div className="bg-gray-50 border p-3 rounded-lg">
            <p className="text-xs text-gray-600">Reference Number</p>
            <p className="font-mono text-sm">{mandateRefNo}</p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-lg">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // =============================
  // UI – BEFORE MANDATE SUBMITTED
  // =============================
  return (
    <Card className="border-0 shadow-none">
      <CardContent className="p-6 space-y-4">
        <h3 className="text-xl font-semibold">Setup Autopay Mandate</h3>
        <p className="text-sm text-gray-600">
          Configure your mandate details
        </p>

        {/* ✅ ADD THIS SECTION - Display Payer Name */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Account Holder Name</label>
          <div className="p-3 bg-muted rounded-md">
            <p className="font-semibold">{payerName}</p>
          </div>
        </div>

        {/* UPI ID */}
        <div>
          <label className="text-sm font-medium">UPI ID</label>
          <Input
            value={vpa}
            disabled
            className="bg-gray-100 cursor-not-allowed"
          />
        </div>

        {/* Amount - ✅ NOW DYNAMIC */}
        <div>
          <label className="text-sm font-medium">Amount (₹)</label>
          <Input
            value={amount}
            disabled
            className="bg-gray-100 cursor-not-allowed"
          />
          {merchantProfile?.total_monthly_cost && (
            <p className="text-xs text-gray-500 mt-1">
              Monthly recurring amount from your selected products
            </p>
          )}
        </div>

        {/* Start Date */}
        <div>
          <label className="text-sm font-medium">Mandate Start Date</label>
          <Input value={startDate} disabled className="bg-gray-100 cursor-not-allowed" />
        </div>

        {/* End Date */}
        <div>
          <label className="text-sm font-medium">Mandate End Date</label>
          <Input value={endDate} disabled className="bg-gray-100 cursor-not-allowed" />
        </div>

        {/* Next Debit Date */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Next Debit Date
          </label>
          <Input
            type="date"
            value={nextDebitDate}
            disabled
            className="w-full bg-gray-100 cursor-not-allowed"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-lg">
            {error}
          </p>
        )}

        <Button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-5"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating Mandate...
            </>
          ) : (
            "Create Mandate"
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

export default MandateCreate;

