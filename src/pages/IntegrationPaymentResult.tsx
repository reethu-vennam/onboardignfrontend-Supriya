// src/pages/IntegrationPaymentResult.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { authService } from "@/lib/auth-service";
import {
  clearSabbpePaymentReturnPath,
  markSabbpePaymentComplete,
  getSabbpePaymentMerchantId,
  clearSabbpePaymentMerchantId,
  clearSabbpePaymentToken,
} from "@/lib/sabbpePaymentState";
import {
  decryptSabbpePaymentToken,
  storeSabbpeTxnDetails,
  type SabbpeDecryptTokenResponse,
} from "@/api/sabbpePaymentApi";

const readQueryParams = (locationSearch: string, locationHash: string) => {
  let query = locationSearch || "";

  if (!query) {
    const hashIndex = locationHash.indexOf("?");
    if (hashIndex !== -1) {
      query = locationHash.substring(hashIndex);
    }
  }

  if (!query) {
    const href = window.location.href || "";
    const hrefIndex = href.indexOf("?");
    if (hrefIndex !== -1) {
      query = href.substring(hrefIndex);
    }
  }

  return new URLSearchParams(query);
};

const getRawQueryParam = (query: string, key: string) => {
  if (!query) {
    return null;
  }

  const normalizedQuery = query.startsWith("?") ? query.slice(1) : query;
  const parts = normalizedQuery.split("&");

  for (const part of parts) {
    const [paramKey, ...rest] = part.split("=");
    if (paramKey === key) {
      return rest.join("=");
    }
  }

  return null;
};

export default function IntegrationPaymentResult() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [savingTransaction, setSavingTransaction] = useState(false);
  const [paymentResult, setPaymentResult] = useState<SabbpeDecryptTokenResponse | null>(null);
  const [callbackError, setCallbackError] = useState("");

  const paymentData = useMemo(() => {
    const params = readQueryParams(location.search, location.hash);
    const rawSearch = location.search || window.location.search || "";
    const rawHashQuery = (() => {
      const hashIndex = location.hash.indexOf("?");
      return hashIndex !== -1 ? location.hash.substring(hashIndex) : "";
    })();
    const txnid =
      getRawQueryParam(rawSearch, "txnid") ||
      getRawQueryParam(rawSearch, "txnId") ||
      getRawQueryParam(rawSearch, "txn_id") ||
      getRawQueryParam(rawHashQuery, "txnid") ||
      getRawQueryParam(rawHashQuery, "txnId") ||
      getRawQueryParam(rawHashQuery, "txn_id");
    const status = (params.get("status") || "").toLowerCase();

    console.log("💳 Integration Payment callback params:", {
      txnid,
      status,
      allParams: Object.fromEntries(params.entries()),
    });

    return { txnid, urlStatus: status };
  }, [location.search, location.hash]);

  useEffect(() => {
    return () => {
      clearSabbpePaymentReturnPath();
    };
  }, []);

  const saveTransactionToBackend = async (payload: SabbpeDecryptTokenResponse) => {
    try {
      setSavingTransaction(true);
      console.log("💾 Saving SabbPe payment details to backend:", payload);

      const response = await storeSabbpeTxnDetails(payload);

      if (response.success) {
        console.log("✅ SabbPe payment details saved successfully");
        toast({
          title: "Payment Saved",
          description: "Your payment details have been saved successfully.",
        });
        return true;
      }

      console.error("❌ Failed to save payment details:", response);
      toast({
        title: "Save Failed",
        description: response.message || "Failed to save payment details.",
        variant: "destructive",
      });
      return false;
    } catch (error) {
      console.error("❌ Error saving payment details:", error);
      toast({
        title: "Error",
        description: "Failed to save payment details. Please contact support.",
        variant: "destructive",
      });
      return false;
    } finally {
      setSavingTransaction(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const processPayment = async () => {
      try {
        if (!paymentData.txnid) {
          setCallbackError("Transaction ID not found in the payment callback URL.");
          return;
        }

        const decryptedResponse = await decryptSabbpePaymentToken({
          txnid: paymentData.txnid,
        });

        if (cancelled) {
          return;
        }

        setPaymentResult(decryptedResponse);

        const resolvedStatus = (decryptedResponse.status || paymentData.urlStatus || "").toUpperCase();
        const completedTransactionId = decryptedResponse.master_transaction_id || paymentData.txnid || "";

        const saved = await saveTransactionToBackend(decryptedResponse);

        if (resolvedStatus === "SUCCESS") {
          const user = authService.getUser();

          const merchantFromSession = getSabbpePaymentMerchantId();
          if (completedTransactionId) {
            if (user?.id) {
              markSabbpePaymentComplete(user.id, completedTransactionId);
            } else if (merchantFromSession) {
              markSabbpePaymentComplete(merchantFromSession, completedTransactionId);
            }
          }

          if (!saved) {
            toast({
              variant: "destructive",
              title: "Saved locally",
              description: "The payment was completed, but backend persistence could not be confirmed.",
            });
          }
        } else {
          setCallbackError(decryptedResponse.message || "Payment failed. Please try again.");
          if (!saved) {
            toast({
              variant: "destructive",
              title: "Save Failed",
              description: "The failed payment details could not be saved to the backend.",
            });
          }
        }

        clearSabbpePaymentMerchantId();
        clearSabbpePaymentToken();
      } catch (error) {
        console.error("❌ Error processing payment result:", error);
        setCallbackError(error instanceof Error ? error.message : "Failed to verify payment result.");
        clearSabbpePaymentToken();
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    processPayment();

    return () => {
      cancelled = true;
    };
  }, [paymentData.txnid, paymentData.urlStatus]);

  const normalizedStatus = (paymentResult?.status || paymentData.urlStatus || (callbackError ? "ERROR" : "")).toUpperCase();
  const isSuccess = normalizedStatus === "SUCCESS";
  const isError = normalizedStatus === "FAILED" || normalizedStatus === "ERROR" || Boolean(callbackError && !isSuccess);

  const details = [
    { label: "Gateway", value: paymentResult?.gateway || "SABBPE" },
    { label: "Master Transaction ID", value: paymentResult?.master_transaction_id || "-" },
    { label: "Merchant Order Ref", value: paymentResult?.merchant_order_ref || "-" },
    { label: "Status", value: paymentResult?.status || (paymentData.urlStatus ? paymentData.urlStatus.toUpperCase() : "-") },
    { label: "Amount", value: paymentResult?.amount ? `${paymentResult.amount} ${paymentResult.currency || ""}`.trim() : "-" },
    { label: "Payment Method", value: paymentResult?.payment_method || "-" },
    { label: "Completed At", value: paymentResult?.payment_completed_at || "-" },
  ];

  const summaryDetails = details.filter((item) => item.value && item.value !== "-");

  const extraDetails = paymentResult
    ? Object.entries(paymentResult).filter(
        ([key]) => !details.some((item) => {
          const normalizedLabel = item.label.toLowerCase().replace(/\s+/g, "_");
          return normalizedLabel === key;
        })
      )
    : [];

  const formatDetailLabel = (label: string) => label.replace(/_/g, " ");

  const getStatusIcon = () => {
    if (loading || savingTransaction) {
      return <Loader2 className="h-24 w-24 text-blue-500 animate-spin" />;
    }

    if (isSuccess) {
      return <CheckCircle2 className="h-24 w-24 text-green-500" />;
    }

    if (isError) {
      return <XCircle className="h-24 w-24 text-red-500" />;
    }

    return <AlertCircle className="h-24 w-24 text-yellow-500" />;
  };

  const getStatusTitle = () => {
    if (loading) return "Processing Payment...";
    if (savingTransaction) return "Saving Payment Details...";

    if (isSuccess) return "Payment Successful!";
    if (isError) return "Payment Failed";

    return "Payment Status Unknown";
  };

  const getStatusColor = () => {
    if (isSuccess) {
      return "text-green-600 dark:text-green-400";
    }

    if (isError) {
      return "text-red-600 dark:text-red-400";
    }

    return "text-yellow-600 dark:text-yellow-400";
  };

  const message = callbackError || paymentResult?.message || (isSuccess
    ? "Your integration fee payment has been completed successfully!"
    : "Payment could not be verified.");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5 p-4">
      <Card className="w-full max-w-2xl shadow-2xl">
        <CardHeader className="text-center pb-8">
          <div className="flex justify-center mb-6">{getStatusIcon()}</div>
          <CardTitle className={`text-3xl font-bold ${getStatusColor()}`}>
            {getStatusTitle()}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center">
            <p className="text-lg mb-4">{message}</p>

            {!loading && paymentData.txnid && (
              <div className="bg-muted/40 p-4 rounded-xl border mb-4 text-left space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-background p-4 border">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Payment Summary</p>
                    <p className={`text-base font-semibold ${getStatusColor()}`}>{details.find((item) => item.label === "Status")?.value}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Amount</p>
                    <p className="text-base font-semibold text-foreground">
                      {details.find((item) => item.label === "Amount")?.value}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {summaryDetails.map((item) => (
                    <div key={item.label} className="rounded-lg border bg-background p-3 shadow-sm">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
                      <p className="mt-1 text-sm font-semibold break-words text-foreground">{item.value}</p>
                    </div>
                  ))}
                </div>

                {extraDetails.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-foreground">Additional Details</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {extraDetails.map(([key, value]) => (
                        <div key={key} className="rounded-lg border bg-background p-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{formatDetailLabel(key)}</p>
                          <p className="mt-1 text-sm text-foreground break-words">
                            {value === null || value === undefined || value === ""
                              ? "-"
                              : typeof value === "object"
                                ? JSON.stringify(value)
                                : String(value)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {isSuccess && (
              <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-800 dark:text-green-200">
                  ✅ Your integration fee has been successfully processed. You can now proceed with your merchant setup.
                </p>
              </div>
            )}

            {!loading && !paymentData.txnid && (
              <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  ⚠️ Transaction ID not found. Please contact support.
                </p>
              </div>
            )}
          </div>

          {isError && (
            <div className="text-center pt-4">
              <p className="text-sm text-muted-foreground">
                Need help? Contact our support team at{" "}
                <a
                  href="mailto:support@sabbpe.com"
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  support@sabbpe.com
                </a>
              </p>
            </div>
          )}

          <div className="pt-4">
            <Button
              size="lg"
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600"
              onClick={() => navigate("/merchant-onboarding?step=dashboard")}
            >
              Back to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
