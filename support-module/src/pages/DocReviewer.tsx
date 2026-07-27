import React, { useEffect, useState } from "react";
import { useSupportAuth } from "../context/SupportAuthContext";
import { API_BASE_URL, API_URL } from "../lib/apiConfig";

interface ValidationCheck {
  checkType: string;
  checkResult: "pass" | "fail" | "skip";
  message: string;
}

interface DocRecord {
  id: string;
  merchant_id: string;
  merchant_name: string;
  document_type: string;
  file_name: string;
  file_path: string;
  status: string;
  validation_status: string;
  rejection_reason: string | null;
  uploaded_at: string;
  verified_at: string | null;
  verified_by: string | null;
  public_url: string | null;
  validations?: ValidationCheck[];
}

interface ValidationResult {
  documentId: string;
  overallStatus: string;
  checks: ValidationCheck[];
}

const checkTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    gstin_format: "GSTIN Format",
    gstin_match: "GSTIN Match",
    pan_in_gst: "PAN in GST",
    legal_name_match: "Legal Name",
    trade_name_match: "Trade Name",
    constitution_match: "Constitution",
    format_fallback: "GST Format (Fallback)",
    pan_fallback: "PAN Match (Fallback)",
    format: "IFSC Format",
    account_format: "Account Format",
    cross_match: "Cross Match",
    account_holder_match: "Account Holder",
    ifsc_bank_match: "IFSC Bank Match",
    ocr_account_match: "OCR Account Match",
    ocr_bank_name_match: "OCR Bank Name",
    ocr_document_check: "OCR Check",
    bank_details: "Bank Details",
  };
  return labels[type] || type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

const DocReviewer: React.FC = () => {
  const { token } = useSupportAuth();
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<Record<string, ValidationResult>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("document_type", typeFilter);
      const res = await fetch(`${API_URL}/tickets/all-documents?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const allowed = ["gst_certificate", "bank_statement", "cancelled_cheque", "pan_card", "aadhaar_card"];
      const filtered = Array.isArray(data) ? data.filter((d: DocRecord) => allowed.includes(d.document_type)) : [];

      for (const doc of filtered) {
        if (doc.validations && doc.validations.length > 0) {
          const activeChecks = doc.validations.filter((v: ValidationCheck) => v.checkResult !== "skip");
          const allFailed = activeChecks.length > 0 && activeChecks.every((v: ValidationCheck) => v.checkResult === "fail");
          const allPassed = activeChecks.length > 0 && activeChecks.every((v: ValidationCheck) => v.checkResult === "pass");
          setValidationResults((prev) => ({
            ...prev,
            [doc.id]: {
              documentId: doc.id,
              overallStatus: allPassed ? "passed" : allFailed ? "failed" : "mixed",
              checks: doc.validations!,
            },
          }));
        }
      }

      setDocs(filtered);
    } catch (err) {
      console.error("Failed to fetch documents");
      setDocs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, [statusFilter, typeFilter]);

  const handleValidate = async (docId: string) => {
    setValidatingId(docId);
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[docId];
      return next;
    });
    try {
      const res = await fetch(`${API_URL}/document-review/documents/${docId}/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || data?.error?.message || `Validation failed (${res.status})`);
      }

      const result = data?.data || data;
      if (result.overallStatus) {
        setValidationResults((prev) => ({
          ...prev,
          [docId]: {
            documentId: docId,
            overallStatus: result.overallStatus,
            checks: result.checks || [],
          },
        }));
        setExpandedRows((prev) => ({ ...prev, [docId]: true }));
        fetchDocs();
      }
    } catch (err) {
      console.error("Validation failed:", err);
      const message = err instanceof Error ? err.message : "Validation failed. Please try again.";
      setValidationErrors((prev) => ({ ...prev, [docId]: message }));
    }
    setValidatingId(null);
  };

  const toggleRow = (docId: string) => {
    setExpandedRows((prev) => ({ ...prev, [docId]: !prev[docId] }));
  };

  const docTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      pan_card: "PAN Card",
      aadhaar_card: "Aadhaar Card",
      business_proof: "Business Proof",
      bank_statement: "Bank Statement",
      cancelled_cheque: "Cancelled Cheque",
      gst_certificate: "GST Certificate",
      address_proof: "Address Proof",
    };
    return labels[type] || type;
  };

  const validationStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      passed: "bg-green-100 text-green-700 border border-green-200",
      failed: "bg-red-100 text-red-700 border border-red-200",
      unchecked: "bg-gray-100 text-gray-500 border border-gray-200",
      mixed: "bg-yellow-100 text-yellow-700 border border-yellow-200",
    };
    return `px-2.5 py-1 rounded-full text-xs font-semibold ${colors[status] || "bg-gray-100 text-gray-500"}`;
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Doc Reviewer</h1>

      <div className="flex gap-4 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="uploaded">Uploaded</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
        >
          <option value="">All Types</option>
          <option value="gst_certificate">GST Certificate</option>
          <option value="bank_statement">Bank Statement</option>
          <option value="cancelled_cheque">Cancelled Cheque</option>
        </select>
      </div>

      {loading ? (
        <div className="p-6">Loading...</div>
      ) : (
        <div className="space-y-3">
          {docs.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-400">
              No documents found
            </div>
          ) : (
            docs.map((doc) => {
              const result = validationResults[doc.id];
              const validationError = validationErrors[doc.id];
              const isExpanded = expandedRows[doc.id];

              return (
                <div key={doc.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="flex items-center gap-4 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-gray-900">{doc.merchant_name}</span>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          {docTypeLabel(doc.document_type)}
                        </span>
                        {doc.validation_status && doc.validation_status !== "unchecked" && (
                          <span className={validationStatusBadge(doc.validation_status)}>
                            {doc.validation_status.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                        <span>{doc.file_name}</span>
                        <span>{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                        {doc.public_url && (
                          <a
                            href={doc.public_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:underline"
                          >
                            View File
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {result && (
                        <button
                          onClick={() => toggleRow(doc.id)}
                          className="px-3 py-1 border rounded text-xs text-gray-600 hover:bg-gray-50"
                        >
                          {isExpanded ? "Hide" : "Results"}
                        </button>
                      )}
                      <button
                        onClick={() => handleValidate(doc.id)}
                        disabled={validatingId === doc.id}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-xs disabled:opacity-40 hover:bg-blue-700"
                      >
                        {validatingId === doc.id ? "Validating..." : result ? "Re-validate" : "Validate"}
                      </button>
                    </div>
                  </div>

                  {validationError && (
                    <div className="border-t bg-red-50 px-4 py-3 text-xs text-red-700">
                      {validationError}
                    </div>
                  )}

                  {isExpanded && result && (
                    <div className="border-t bg-gray-50 px-4 py-3">
                      <div className="flex items-center gap-2 mb-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                            result.overallStatus === "passed"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {result.overallStatus === "passed" ? (
                            <>
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              ALL CHECKS PASSED
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                              CHECKS FAILED
                            </>
                          )}
                        </span>
                        <span className="text-xs text-gray-400">
                          {result.checks.filter((c) => c.checkResult === "pass").length}/{result.checks.filter((c) => c.checkResult !== "skip").length} passed
                          {result.checks.some((c) => c.checkResult === "skip") && (
                            <span className="ml-1 text-gray-300">({result.checks.filter((c) => c.checkResult === "skip").length} skipped)</span>
                          )}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {result.checks.map((check, i) => (
                          <div
                            key={i}
                            className={`flex items-start gap-2.5 text-xs px-3 py-2 rounded-lg ${
                              check.checkResult === "pass"
                                ? "bg-green-50 text-green-800"
                                : check.checkResult === "skip"
                                ? "bg-gray-100 text-gray-500"
                                : "bg-red-50 text-red-800"
                            }`}
                          >
                            <span className="mt-0.5 shrink-0">
                              {check.checkResult === "pass" ? (
                                <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              ) : check.checkResult === "skip" ? (
                                <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              )}
                            </span>
                            <div className="flex-1">
                              <span className="font-medium mr-2">{checkTypeLabel(check.checkType)}</span>
                              <span>{check.message}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default DocReviewer;
