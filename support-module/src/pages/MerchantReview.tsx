import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSupportAuth } from "../context/SupportAuthContext";
import jsPDF from 'jspdf';
import { API_URL } from "../lib/apiConfig";
import { ScoreCard, ScoreCardData } from "../components/ScoreCard";

interface AddressDetails {
  addressLine1?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
}

interface RegistrationDetails {
  businessWebsite?: string;
  businessIndustry?: string;
  operatingAddressDifferent?: boolean;
  registeredAddress?: AddressDetails;
  operatingAddress?: AddressDetails;
}

interface MerchantProfile {
  id: string;
  full_name: string;
  email: string;
  mobile_number: string;
  business_name: string;
  pan_number: string;
  aadhaar_number: string;
  gst_number?: string;
  onboarding_status: string;
  verification_submitted?: boolean;
  upi_mandate_status?: string;
  cpv_status?: string;
  cpv_video_path?: string;
  cpv_submitted_at?: string;
  cpv_rejection_reason?: string;
  has_pg_product?: boolean;
  entity_type?: string;
  created_at?: string;
  submitted_at?: string;
  rejection_reason?: string;
  selected_products?: any;
  onboarding_score?: number;
  application_id?: string;
  pan_card_url?: string;
  aadhaar_card_url?: string;
  cancelled_cheque_url?: string;
  business_proof_url?: string;
  registration_details?: RegistrationDetails | string | null;
}

interface MerchantDocument {
  id: string;
  document_type: string;
  public_url: string;
  file_name: string;
}

interface MerchantProduct {
  id: string;
  product_type: string;
  settlement_type: string;
  status: string | null;
}

interface MerchantPerson {
  id: string;
  role: string;
  full_name: string;
  pan_number?: string | null;
  address_proof_type?: string | null;
  is_authorized_signatory?: boolean | null;
  sequence_order?: number | null;
}

interface MerchantBankDetails {
  bank_name: string;
  account_number: string;
  ifsc_code: string;
  account_holder_name: string;
  account_type?: string;
  branch_name?: string;
  branch_address?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

interface MerchantKYC {
  video_kyc_completed: boolean;
  location_captured: boolean;
  latitude: number | null;
  longitude: number | null;
  kyc_status: string;
  completed_at: string | null;
  rejection_reason: string | null;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  landmark?: string;
  selfie_file_path?: string | null;
}

const MerchantReview: React.FC = () => {
  const { merchantId } = useParams();
  const navigate = useNavigate();
  const { user } = useSupportAuth();

  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const [documents, setDocuments] = useState<MerchantDocument[]>([]);
  const [products, setProducts] = useState<MerchantProduct[]>([]);
  const [persons, setPersons] = useState<MerchantPerson[]>([]);
  const [bankDetails, setBankDetails] = useState<MerchantBankDetails | null>(null);
  const [kycData, setKycData] = useState<MerchantKYC | null>(null);
  const [selectedSubProducts, setSelectedSubProducts] = useState<any[]>([]);
  const [splitConfig, setSplitConfig] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('');
  const [showRejectInput, setShowRejectInput] = useState<'kyc' | 'cpv' | null>(null);
  const [scoreData, setScoreData] = useState<ScoreCardData | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [docValidationResults, setDocValidationResults] = useState<Record<string, { status: string; checks: any[] }>>({});
  const [docValidating, setDocValidating] = useState<Record<string, boolean>>({});

  const ADMIN_API = import.meta.env.VITE_API_URL || "http://localhost:5000";

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const showConfirm = (message: string, onConfirm: () => void) => {
    setConfirmDialog({ message, onConfirm });
  };

  const parseRegistrationDetails = (): RegistrationDetails | null => {
    if (!profile?.registration_details) return null;
    try {
      return typeof profile.registration_details === 'string'
        ? JSON.parse(profile.registration_details)
        : profile.registration_details;
    } catch {
      return null;
    }
  };

  const formatAddress = (address?: AddressDetails) =>
    [
      address?.addressLine1,
      address?.city,
      address?.state,
      address?.pincode,
      address?.country,
    ].filter(Boolean).join(', ') || 'N/A';

  useEffect(() => {
    if (!merchantId) return;
    fetchMerchantData();
  }, [merchantId]);

  const handleVerifyCPV = async () => {
    showConfirm("Verify CPV and send to bank for approval?", async () => {
      try {
        setActionLoading(true);
        const token = localStorage.getItem("token");
        const response = await fetch(`${API_URL}/tickets/verify-cpv`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ merchant_id: merchantId }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "CPV verification failed");
        showToast("✅ CPV Verified! Application sent to bank.", "success");
        setTimeout(() => navigate("/admin"), 1500);
      } catch (error: any) {
        showToast("❌ " + error.message, "error");
      } finally {
        setActionLoading(false);
      }
    });
  };

  const handleValidateBank = async () => {
    if (!bankDetails || !merchantId) {
      showToast('Bank details not available', 'error');
      return;
    }

    const confirm = window.confirm('Validate bank account with Transbank?');
    if (!confirm) return;

    try {
      setActionLoading(true);
      const tokenStorage = localStorage.getItem('token');
      const rawApi = API_URL;

      // Normalize API base to avoid malformed values (ensure it ends with /api and no extra endpoint)
      const normalizeApiBase = (raw: string) => {
        try {
          const u = new URL(raw);
          const apiIndex = u.pathname.indexOf('/api');
          if (apiIndex !== -1) {
            u.pathname = u.pathname.slice(0, apiIndex + 4); // keep '/api'
          }
          return (u.origin + u.pathname).replace(/\/$/, '');
        } catch {
          // fallback: strip anything after '/api' if present
          const idx = raw.indexOf('/api');
          if (idx !== -1) return raw.slice(0, idx + 4).replace(/\/$/, '');
          return raw.replace(/\/$/, '');
        }
      };

      const API_BASE_URL = normalizeApiBase(rawApi);

      const build = (path: string) => `${API_BASE_URL}/${path.replace(/^\//, '')}`;

      // 1) Generate token
      const tokenUrl = build('/v1/token/generate');
      console.debug('Transbank token URL ->', tokenUrl);
      const tokRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: tokenStorage ? `Bearer ${tokenStorage}` : '' },
      });
      const tokJson = await tokRes.json().catch(() => ({}));
      if (!tokRes.ok || !tokJson?.data?.token) {
        throw new Error(tokJson?.error?.message || 'Failed to generate token');
      }
      const tbToken = tokJson.data.token;

      // 2) Call bank-account-validation
      const payload = {
        requestId: `validate_${merchantId}_${Date.now()}`,
        custName: bankDetails.account_holder_name,
        custIfsc: bankDetails.ifsc_code,
        custAcctNo: bankDetails.account_number,
        trackingRefNo: null,
        txnType: 'VALIDATE',
      };
      const valUrl = build('/bank-account-validation');
      console.debug('Transbank validation URL ->', valUrl);

      const valRes = await fetch(valUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: tokenStorage ? `Bearer ${tokenStorage}` : '' },
        body: JSON.stringify({ ...payload, token: tbToken }),
      });
      const valJson = await valRes.json().catch(() => ({}));

      if (!valRes.ok || !valJson.success) {
        const msg = valJson?.data?.message || valJson?.error?.message || 'Validation failed';
        showToast(`❌ ${msg}`, 'error');
        return;
      }

      const info = valJson.data || {};
      showToast(`✅ Bank valid: ${info.accountName || 'Unknown'}`, 'success');
    } catch (err: any) {
      showToast('❌ ' + (err?.message || 'Bank validation error'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const fetchMerchantData = async () => {
    try {
      const token = localStorage.getItem("token");

      const response = await fetch(
        `${API_URL}/tickets/merchant-review/${merchantId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to fetch merchant (${response.status})`);
      }

      const responseData = await response.json();
      const profileData = responseData.profile || responseData;
      setProfile(profileData);
      setDocuments(responseData.documents || []);

      const merchantProfileId = profileData?.id;
      if (merchantProfileId) {
        try {
          const token = localStorage.getItem('token') || '';
          const headers = { Authorization: `Bearer ${token}` };
          
          const [productsRes, bankRes, kycRes, personsRes]: any[] = await Promise.all([
            fetch(`${API_URL}/document-review/merchants`, { headers }).then(r => r.ok ? r.json() : []),
            fetch(`${API_URL}/tickets/merchant-review/${merchantId}`, { headers }).then(r => r.ok ? r.json() : {}),
            fetch(`${API_URL}/tickets/merchant-review/${merchantId}`, { headers }).then(r => r.ok ? r.json() : {}),
            fetch(`${API_URL}/tickets/merchant-review/${merchantId}`, { headers }).then(r => r.ok ? r.json() : {}),
          ]);

          setBankDetails(profileData?.bank_details || bankRes?.profile?.bank_details || null);
          setKycData(profileData?.kyc?.[0] || null);
          setPersons(profileData?.persons || []);
        } catch {
          setProducts([]);
          setBankDetails(null);
          setKycData(null);
          setPersons([]);
        }

        const rawSplit = profileData?.split_payment_config;
        if (rawSplit) {
          try {
            setSplitConfig(typeof rawSplit === 'string' ? JSON.parse(rawSplit) : rawSplit);
          } catch {
            setSplitConfig([]);
          }
        }
      }

      setLoading(false);

      // Fetch score after profile is loaded — use onboarding_score from profile as fallback
      const profileScore = profileData.onboarding_score;
      if (profileScore !== undefined && profileScore !== null) {
        setScoreData({
          score: profileScore,
          categories: [],
          reasons: [],
          isManualReview: false,
        });
      }
      fetchScore(profileData.id);

    } catch (error: any) {
      showToast(error.message, "error");
      setLoading(false);
    }
  };

  const fetchScore = async (merchantProfileId: string) => {
    if (!merchantProfileId) return;
    setScoreLoading(true);
    try {
      const token = localStorage.getItem("token");
      const url = `${ADMIN_API}/api/document-review/merchants/${merchantProfileId}/score`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data && data.score !== undefined) {
        const computedScore = data.score;
        const profileScore = profile?.onboarding_score ?? 0;
        const finalScore = computedScore > 0 ? computedScore : profileScore;
        setScoreData({
          score: finalScore,
          categories: data.categories || [],
          reasons: data.reasons || [],
          isManualReview: data.isManualReview ?? false,
        });
      }
    } catch (err) {
      console.error("Score fetch error:", err);
    }
    setScoreLoading(false);
  };

  const getSelectedProducts = (): { product_code: string; product_name: string; pricing_type?: string; price?: number }[] => {
    if (!profile?.selected_products) return [];
    try {
      const prods = typeof profile.selected_products === 'string'
        ? JSON.parse(profile.selected_products)
        : profile.selected_products;
      return Array.isArray(prods) ? prods : [];
    } catch {
      return [];
    }
  };

  const handleApprove = async () => {
    showConfirm("Approve this merchant?", async () => {
      try {
        setActionLoading(true);
        const token = localStorage.getItem("token");
        const response = await fetch(`${API_URL}/tickets/merchant-review`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ merchant_id: merchantId, status: "approved", review_notes: "" }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Approval failed");
        showToast("✅ Merchant approved successfully", "success");
        setTimeout(() => navigate("/admin"), 1500);
      } catch (error: any) {
        showToast("❌ " + error.message, "error");
      } finally {
        setActionLoading(false);
      }
    });
  };

  const handleReject = async () => {
    setShowRejectInput('kyc');
  };

  const submitReject = async () => {
    if (!rejectReasonInput.trim()) return;
    try {
      setActionLoading(true);
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/tickets/merchant-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ merchant_id: merchantId, status: "rejected", review_notes: rejectReasonInput }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Rejection failed");
      showToast("Merchant rejected", "success");
      setShowRejectInput(null);
      setRejectReasonInput('');
      setTimeout(() => navigate("/admin"), 1500);
    } catch (error: any) {
      showToast("❌ " + error.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectCPV = async () => {
    setShowRejectInput('cpv');
  };

  const submitRejectCPV = async () => {
    if (!rejectReasonInput.trim()) return;
    try {
      setActionLoading(true);
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/tickets/reject-cpv`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ merchant_id: merchantId, reason: rejectReasonInput }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "CPV rejection failed");
      showToast("CPV rejected. Merchant will be asked to re-record.", "success");
      setShowRejectInput(null);
      setRejectReasonInput('');
      fetchMerchantData();
    } catch (error: any) {
      showToast("❌ " + error.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleValidateDocument = async (docId: string, docType: string) => {
    setDocValidating(prev => ({ ...prev, [docId]: true }));
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${ADMIN_API}/api/document-review/documents/${docId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `Validation failed (${res.status})`);
      const result = data?.data || data;
      setDocValidationResults(prev => ({
        ...prev,
        [docId]: { status: result.overallStatus || "unknown", checks: result.checks || [] },
      }));
      showToast(`${docType.replace(/_/g, " ")} validation complete`, "success");
    } catch (err: any) {
      showToast(err.message || "Validation failed", "error");
    } finally {
      setDocValidating(prev => ({ ...prev, [docId]: false }));
    }
  };

  const findDocByType = (type: string) => documents.find(d => d.document_type === type);
  const getDocValidationStatus = (docId: string) => docValidationResults[docId];

  const generatePDF = async () => {
    if (!profile) return;

    const reg = parseRegistrationDetails();
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    let y = margin;

    const addText = (text: string, x: number, yPos: number, maxWidth: number, size = 10) => {
      pdf.setFontSize(size);
      const lines = pdf.splitTextToSize(text, maxWidth);
      pdf.text(lines, x, yPos);
      return yPos + lines.length * size * 0.4;
    };

    const checkPage = (h: number) => {
      if (y + h > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }
    };

    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Merchant Onboarding Details', margin, y);
    y += 15;

    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Status: ${profile.onboarding_status.replace(/_/g, ' ').toUpperCase()}`, margin, y);
    y += 7;
    pdf.text(`Application ID: ${profile.application_id || profile.id}`, margin, y);
    y += 15;

    checkPage(50);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('1. Sign In Details', margin, y);
    y += 10;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    [`Full Name: ${profile.full_name}`, `Email: ${profile.email}`, `Mobile: ${profile.mobile_number}`].forEach(d => {
      y = addText(d, margin, y, pageWidth - 2 * margin);
      y += 2;
    });
    y += 5;

    const selProds = getSelectedProducts();
    checkPage(40);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('2. Product Selection', margin, y);
    y += 10;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    if (selProds.length > 0) {
      selProds.forEach(p => {
        y = addText(`[SELECTED] ${p.product_name} - ${p.pricing_type || ''} ${p.price ? `Rs.${p.price}` : ''}`, margin, y, pageWidth - 2 * margin);
        y += 2;
      });
    } else {
      pdf.text('No products selected', margin, y);
      y += 5;
    }
    y += 5;

    checkPage(70);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('3. Registration', margin, y);
    y += 10;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    [
      `Business Name: ${profile.business_name || 'N/A'}`,
      `Entity Type: ${profile.entity_type || 'N/A'}`,
      `GST: ${profile.gst_number || 'N/A'}`,
      `PAN: ${profile.pan_number || 'N/A'}`,
      `Aadhaar: ${profile.aadhaar_number || 'N/A'}`,
      `Business Website: ${reg?.businessWebsite || 'N/A'}`,
      `Business Industry: ${reg?.businessIndustry || 'N/A'}`,
      `Operating Address Different: ${reg?.operatingAddressDifferent ? 'Yes' : 'No'}`,
      `Registered Address: ${formatAddress(reg?.registeredAddress)}`,
      `Operating Address: ${formatAddress(reg?.operatingAddress)}`,
    ].forEach(d => {
      y = addText(d, margin, y, pageWidth - 2 * margin);
      y += 2;
    });
    y += 5;

    checkPage(60);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('4. Person KYC', margin, y);
    y += 10;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    if (persons.length > 0) {
      persons.forEach((person, index) => {
        [
          `Person ${index + 1}: ${person.full_name || 'N/A'}`,
          `Role: ${person.role || 'N/A'}`,
          `PAN: ${person.pan_number || 'N/A'}`,
          `Address Proof Type: ${person.address_proof_type || 'N/A'}`,
          `Authorized Signatory: ${person.is_authorized_signatory ? 'Yes' : 'No'}`,
        ].forEach(d => {
          y = addText(d, margin, y, pageWidth - 2 * margin);
          y += 2;
        });
        y += 4;
      });
    } else {
      pdf.text('No person KYC records found', margin, y);
      y += 5;
    }
    y += 5;

    checkPage(50);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('5. Bank Details', margin, y);
    y += 10;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    if (bankDetails) {
      [`Bank: ${bankDetails.bank_name}`, `A/C Holder: ${bankDetails.account_holder_name}`, `A/C No: ${bankDetails.account_number}`, `IFSC: ${bankDetails.ifsc_code}`].forEach(d => {
        y = addText(d, margin, y, pageWidth - 2 * margin);
        y += 2;
      });
    } else {
      pdf.text('Bank details not provided', margin, y);
    }
    y += 5;

    pdf.save(`merchant_${profile.full_name.replace(/\s+/g, '_')}.pdf`);
  };

  if (loading) return <div className="p-6">Loading...</div>;
  if (!profile) return <div className="p-6">Merchant not found</div>;

  const selectedProds = getSelectedProducts();
  const registrationDetails = parseRegistrationDetails();

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-8">
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-3 rounded-lg shadow-lg text-white font-medium transition-all ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.message}
        </div>
      )}

      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <p className="text-gray-800 font-medium mb-6">{confirmDialog.message}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDialog(null)} className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
              <button
                onClick={() => { setConfirmDialog(null); confirmDialog.onConfirm(); }}
                disabled={actionLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {actionLoading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRejectInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <p className="text-gray-800 font-medium mb-3">
              {showRejectInput === 'cpv' ? 'CPV Rejection Reason' : 'Rejection Reason'}
            </p>
            <textarea
              className="w-full border rounded-lg p-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-400"
              rows={3}
              placeholder={showRejectInput === 'cpv' ? 'What was wrong with the video?' : 'Enter rejection reason...'}
              value={rejectReasonInput}
              onChange={e => setRejectReasonInput(e.target.value)}
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setShowRejectInput(null); setRejectReasonInput(''); }} className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
              <button
                onClick={showRejectInput === 'cpv' ? submitRejectCPV : submitReject}
                disabled={!rejectReasonInput.trim() || actionLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Complete Merchant Review</h1>
        <button onClick={generatePDF} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
          📄 Download PDF
        </button>
      </div>

      <div className="flex items-center gap-4">
        <span className={`px-4 py-2 rounded-full text-sm font-medium ${
          profile.onboarding_status === 'approved' ? 'bg-green-100 text-green-800' :
          profile.onboarding_status === 'rejected' ? 'bg-red-100 text-red-800' :
          profile.onboarding_status === 'submitted' ? 'bg-yellow-100 text-yellow-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {profile.onboarding_status.replace(/_/g, ' ').toUpperCase()}
        </span>
        <span className="text-sm text-gray-600">Application ID: {profile.application_id || profile.id}</span>
      </div>

      <ScoreCard
        data={scoreData || { score: 0, categories: [], reasons: [], isManualReview: true }}
        loading={scoreLoading}
      />

      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold">1</span>
          Sign In Details
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div><label className="text-sm font-medium text-gray-600">Full Name</label><p className="text-gray-900 font-medium">{profile.full_name}</p></div>
            <div><label className="text-sm font-medium text-gray-600">Email</label><p className="text-gray-900">{profile.email}</p></div>
            <div><label className="text-sm font-medium text-gray-600">Mobile Number</label><p className="text-gray-900">{profile.mobile_number}</p></div>
          </div>
          <div className="space-y-3">
            <div><label className="text-sm font-medium text-gray-600">Account Created</label><p className="text-gray-900">{profile.created_at ? new Date(profile.created_at).toLocaleDateString() : 'N/A'}</p></div>
            <div><label className="text-sm font-medium text-gray-600">Application ID</label><p className="text-gray-900 font-mono text-sm">{profile.application_id || profile.id}</p></div>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-sm font-bold">2</span>
          Product Selection
        </h2>
        {selectedProds.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {selectedProds.map((product) => (
              <div key={product.product_code} className="p-4 border-2 border-green-500 bg-green-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 bg-green-500 text-white rounded-full flex items-center justify-center text-xs">✓</span>
                  <span className="font-medium text-green-900">{product.product_name}</span>
                </div>
                {product.pricing_type && (
                  <div className="text-sm text-green-700">
                    Type: {product.pricing_type}
                    {product.price ? ` — ₹${product.price.toLocaleString()}` : ''}
                  </div>
                )}
                {product.product_code === 'PROD_004' && (
                  <div className="mt-2 pt-2 border-t border-green-200">
                    {selectedSubProducts.length > 0 ? (
                      <div className="space-y-1">
                        <p className="text-xs text-gray-500 font-medium mb-1">Add-ons requested:</p>
                        {selectedSubProducts.map((s: any) => (
                          <div key={s.sub_product_code} className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <span className="text-blue-400 text-xs">↳</span>
                              <span className="text-xs text-blue-700 font-medium">
                                {s.product_sub_catalog?.sub_product_name || s.sub_product_code}
                              </span>
                            </div>
                            {s.product_sub_catalog?.badge && (
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                s.product_sub_catalog.badge === 'Hot' ? 'bg-red-100 text-red-700' :
                                'bg-green-100 text-green-700'
                              }`}>{s.product_sub_catalog.badge}</span>
                            )}
                          </div>
                        ))}
                        <p className="text-xs text-orange-600 mt-1">📞 Pricing to be shared post sales connect</p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">↳ No add-ons requested</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 italic">No products selected</p>
        )}
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-bold">3</span>
          Registration
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div><label className="text-sm font-medium text-gray-600">Business Name</label><p className="text-gray-900">{profile.business_name || 'N/A'}</p></div>
            <div><label className="text-sm font-medium text-gray-600">Entity Type</label><p className="text-gray-900">{profile.entity_type || 'N/A'}</p></div>
            <div><label className="text-sm font-medium text-gray-600">GST Number</label><p className="text-gray-900">{profile.gst_number || 'N/A'}</p></div>
            <div><label className="text-sm font-medium text-gray-600">Business Website</label><p className="text-gray-900">{registrationDetails?.businessWebsite || 'N/A'}</p></div>
            <div><label className="text-sm font-medium text-gray-600">Business Industry</label><p className="text-gray-900">{registrationDetails?.businessIndustry || 'N/A'}</p></div>
          </div>
          <div className="space-y-3">
            <div><label className="text-sm font-medium text-gray-600">PAN Number</label><p className="text-gray-900 font-mono">{profile.pan_number || 'N/A'}</p></div>
            <div><label className="text-sm font-medium text-gray-600">Aadhaar Number</label><p className="text-gray-900 font-mono">{profile.aadhaar_number || 'N/A'}</p></div>
            <div><label className="text-sm font-medium text-gray-600">Operating Address Different</label><p className="text-gray-900">{registrationDetails?.operatingAddressDifferent ? 'Yes' : 'No'}</p></div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Registered Address</label>
            <p className="text-gray-900 mt-1">{formatAddress(registrationDetails?.registeredAddress)}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Operating Address</label>
            <p className="text-gray-900 mt-1">{formatAddress(registrationDetails?.operatingAddress)}</p>
          </div>
        </div>

        <div className="mt-4 flex gap-3 justify-end flex-wrap">
          {(() => { const gstDoc = findDocByType('gst_certificate'); const id = gstDoc?.id || 'profile-gst'; const r = getDocValidationStatus(id); return (<button onClick={() => { if (gstDoc) { handleValidateDocument(gstDoc.id, 'gst_certificate'); } else { showToast('No GST certificate document uploaded', 'error'); } }} disabled={docValidating[id]} className={`px-4 py-2 rounded-lg text-sm font-medium ${ r?.status === 'passed' ? 'bg-green-100 text-green-700 border border-green-200 hover:bg-green-200' : r?.status === 'failed' ? 'bg-red-100 text-red-700 border border-red-200 hover:bg-red-200' : gstDoc ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-gray-400 text-white cursor-not-allowed' } disabled:opacity-50`}>{docValidating[id] ? 'Validating...' : r?.status === 'passed' ? '✓ GST Passed' : r?.status === 'failed' ? '✗ GST Failed' : gstDoc ? 'Validate GST' : 'No GST Doc'}</button>); })()}
          {(() => { const panDoc = findDocByType('pan_card'); const id = panDoc?.id || 'profile-pan'; const r = getDocValidationStatus(id); return (<button onClick={() => { if (panDoc) { handleValidateDocument(panDoc.id, 'pan_card'); } else { showToast('No PAN card document uploaded', 'error'); } }} disabled={docValidating[id]} className={`px-4 py-2 rounded-lg text-sm font-medium ${ r?.status === 'passed' ? 'bg-green-100 text-green-700 border border-green-200 hover:bg-green-200' : r?.status === 'failed' ? 'bg-red-100 text-red-700 border border-red-200 hover:bg-red-200' : panDoc ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-gray-400 text-white cursor-not-allowed' } disabled:opacity-50`}>{docValidating[id] ? 'Validating...' : r?.status === 'passed' ? '✓ PAN Passed' : r?.status === 'failed' ? '✗ PAN Failed' : panDoc ? 'Validate PAN' : 'No PAN Doc'}</button>); })()}
          {(() => { const aadhaarDoc = findDocByType('aadhaar_card'); const id = aadhaarDoc?.id || 'profile-aadhaar'; const r = getDocValidationStatus(id); return (<button onClick={() => { if (aadhaarDoc) { handleValidateDocument(aadhaarDoc.id, 'aadhaar_card'); } else { showToast('No Aadhaar card document uploaded', 'error'); } }} disabled={docValidating[id]} className={`px-4 py-2 rounded-lg text-sm font-medium ${ r?.status === 'passed' ? 'bg-green-100 text-green-700 border border-green-200 hover:bg-green-200' : r?.status === 'failed' ? 'bg-red-100 text-red-700 border border-red-200 hover:bg-red-200' : aadhaarDoc ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-gray-400 text-white cursor-not-allowed' } disabled:opacity-50`}>{docValidating[id] ? 'Validating...' : r?.status === 'passed' ? '✓ Aadhaar Passed' : r?.status === 'failed' ? '✗ Aadhaar Failed' : aadhaarDoc ? 'Validate Aadhaar' : 'No Aadhaar Doc'}</button>); })()}
        </div>

        {(() => {
          const gstDoc = findDocByType('gst_certificate'); const gstR = getDocValidationStatus(gstDoc?.id || 'profile-gst');
          const panDoc = findDocByType('pan_card'); const panR = getDocValidationStatus(panDoc?.id || 'profile-pan');
          const aadhaarDoc = findDocByType('aadhaar_card'); const aadhaarR = getDocValidationStatus(aadhaarDoc?.id || 'profile-aadhaar');
          if ((!gstR || !gstR.checks.length) && (!panR || !panR.checks.length) && (!aadhaarR || !aadhaarR.checks.length)) return null;
          const renderChecks = (label: string, result: any) => result && result.checks.length > 0 ? (<div><p className="text-xs font-semibold text-gray-600 mb-1">{label}:</p><div className="space-y-1">{result.checks.filter((c: any) => c.checkResult !== 'skip').map((c: any, i: number) => (<div key={i} className={`text-xs flex items-center gap-1.5 ${c.checkResult === 'pass' ? 'text-green-700' : 'text-red-700'}`}><span>{c.checkResult === 'pass' ? '✓' : '✗'}</span><span className="font-medium">{c.checkType?.replace(/_/g, ' ')}:</span><span>{c.message}</span></div>))}</div></div>) : null;
          return (<div className="mt-4 space-y-2">{renderChecks('GST Certificate', gstR)}{renderChecks('PAN Card', panR)}{renderChecks('Aadhaar Card', aadhaarR)}</div>);
        })()}
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-8 h-8 bg-pink-100 text-pink-600 rounded-full flex items-center justify-center text-sm font-bold">4</span>
          Person KYC
        </h2>
        {persons.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {persons.map((person) => (
              <div key={person.id} className="border rounded-lg p-4 bg-gray-50">
                <div className="space-y-2">
                  <div><label className="text-sm font-medium text-gray-600">Role</label><p>{person.role || 'N/A'}</p></div>
                  <div><label className="text-sm font-medium text-gray-600">Full Name</label><p>{person.full_name || 'N/A'}</p></div>
                  <div><label className="text-sm font-medium text-gray-600">PAN Number</label><p className="font-mono">{person.pan_number || 'N/A'}</p></div>
                  <div><label className="text-sm font-medium text-gray-600">Address Proof Type</label><p>{person.address_proof_type || 'N/A'}</p></div>
                  <div><label className="text-sm font-medium text-gray-600">Authorized Signatory</label><p>{person.is_authorized_signatory ? 'Yes' : 'No'}</p></div>
                  <div><label className="text-sm font-medium text-gray-600">Sequence</label><p>{person.sequence_order || 'N/A'}</p></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 italic">No person KYC records found</p>
        )}
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-sm font-bold">5</span>
          KYC Verification
        </h2>
        {kycData ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-600">KYC Status</label>
                <span className={`ml-2 px-2 py-1 text-xs rounded ${kycData.kyc_status === 'verified' ? 'bg-green-100 text-green-800' : kycData.kyc_status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                  {kycData.kyc_status.toUpperCase()}
                </span>
              </div>
              <div><label className="text-sm font-medium text-gray-600">Video KYC</label><p>{kycData.video_kyc_completed ? '✓ Completed' : '✗ Not Completed'}</p></div>
              <div><label className="text-sm font-medium text-gray-600">Location Captured</label><p>{kycData.location_captured ? '✓ Yes' : '✗ No'}</p></div>
            </div>
            <div className="space-y-3">
              {kycData.latitude && kycData.longitude && (
                <div><label className="text-sm font-medium text-gray-600">Coordinates</label><p className="font-mono text-sm">{kycData.latitude}, {kycData.longitude}</p></div>
              )}
              {(kycData.address || kycData.city) && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Address</label>
                  <p>{kycData.address}</p>
                  {kycData.landmark && <p className="text-sm text-gray-500">Landmark: {kycData.landmark}</p>}
                  <p>{[kycData.city, kycData.state, kycData.pincode].filter(Boolean).join(', ')}</p>
                </div>
              )}
              {kycData.completed_at && <div><label className="text-sm font-medium text-gray-600">Completed At</label><p>{new Date(kycData.completed_at).toLocaleString()}</p></div>}
            </div>
            {kycData.rejection_reason && (
              <div className="col-span-2 p-4 bg-red-50 border border-red-200 rounded-lg">
                <label className="text-sm font-medium text-red-900">Rejection Reason</label>
                <p className="text-red-800 mt-1">{kycData.rejection_reason}</p>
              </div>
            )}
            {kycData.selfie_file_path && (
              <div className="col-span-2 mt-2">
                <label className="text-sm font-medium text-gray-600 mb-2 block">KYC Selfie</label>
                <img
                  src={kycData.selfie_file_path.startsWith('http') ? kycData.selfie_file_path : ''}
                  alt="KYC Selfie"
                  className="w-48 h-48 object-cover rounded-xl border-2 border-orange-200 shadow"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-500 italic">KYC not initiated</p>
        )}
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-8 h-8 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center text-sm font-bold">6</span>
          Bank Details
        </h2>
        {bankDetails ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div><label className="text-sm font-medium text-gray-600">Bank Name</label><p>{bankDetails.bank_name}</p></div>
              <div><label className="text-sm font-medium text-gray-600">Account Holder</label><p>{bankDetails.account_holder_name}</p></div>
            </div>
            <div className="space-y-3">
              <div><label className="text-sm font-medium text-gray-600">Account Number</label><p className="font-mono">{bankDetails.account_number}</p></div>
              <div><label className="text-sm font-medium text-gray-600">IFSC Code</label><p className="font-mono">{bankDetails.ifsc_code}</p></div>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 italic">Bank details not provided</p>
        )}
        {bankDetails && (
          <div className="mt-4 flex gap-3 justify-end">
            {(() => { const chequeDoc = findDocByType('cancelled_cheque'); const id = chequeDoc?.id || 'profile-cheque'; const r = getDocValidationStatus(id); return (<button onClick={() => { if (chequeDoc) { handleValidateDocument(chequeDoc.id, 'cancelled_cheque'); } else { showToast('No cancelled cheque document uploaded', 'error'); } }} disabled={docValidating[id]} className={`px-4 py-2 rounded-lg text-sm font-medium ${ r?.status === 'passed' ? 'bg-green-100 text-green-700 border border-green-200 hover:bg-green-200' : r?.status === 'failed' ? 'bg-red-100 text-red-700 border border-red-200 hover:bg-red-200' : chequeDoc ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-gray-400 text-white cursor-not-allowed' } disabled:opacity-50`}>{docValidating[id] ? 'Validating...' : r?.status === 'passed' ? '✓ Cheque Passed' : r?.status === 'failed' ? '✗ Cheque Failed' : chequeDoc ? 'Validate Cheque' : 'No Cheque Doc'}</button>); })()}
          </div>
        )}
        {(() => { const chequeDoc = findDocByType('cancelled_cheque'); const result = getDocValidationStatus(chequeDoc?.id || 'profile-cheque'); if (result && result.checks.length > 0) { return (<div className="mt-4"><p className="text-xs font-semibold text-gray-600 mb-1">Cancelled Cheque:</p><div className="space-y-1">{result.checks.filter((c: any) => c.checkResult !== 'skip').map((c: any, i: number) => (<div key={i} className={`text-xs flex items-center gap-1.5 ${c.checkResult === 'pass' ? 'text-green-700' : 'text-red-700'}`}><span>{c.checkResult === 'pass' ? '✓' : '✗'}</span><span className="font-medium">{c.checkType?.replace(/_/g, ' ')}:</span><span>{c.message}</span></div>))}</div></div>); } return null; })()}
      </div>

      {splitConfig.length > 0 && (
        <div className="bg-white border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold">🔀</span>
            Split Payment Configuration
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-green-500 text-white">
                  <th className="px-3 py-2 text-left font-semibold">Label</th>
                  <th className="px-3 py-2 text-left font-semibold">Account Holder</th>
                  <th className="px-3 py-2 text-left font-semibold">Bank</th>
                  <th className="px-3 py-2 text-left font-semibold">Branch</th>
                  <th className="px-3 py-2 text-left font-semibold">Account No</th>
                  <th className="px-3 py-2 text-left font-semibold">IFSC</th>
                  <th className="px-3 py-2 text-left font-semibold">Payout %</th>
                  <th className="px-3 py-2 text-left font-semibold">Deduction</th>
                </tr>
              </thead>
              <tbody>
                {splitConfig.map((acc: any, idx: number) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-green-50' : 'bg-white'}>
                    <td className="px-3 py-2 font-medium">{acc.label || '—'}</td>
                    <td className="px-3 py-2">{acc.accountHolderName || '—'}</td>
                    <td className="px-3 py-2">{acc.bankName || '—'}</td>
                    <td className="px-3 py-2">{acc.branchName || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{acc.accountNumber || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{acc.ifscCode || '—'}</td>
                    <td className="px-3 py-2 font-semibold text-blue-700">{acc.payoutPercentage}%</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${acc.isDeductionAccount ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {acc.isDeductionAccount ? 'YES' : 'NO'}
                      </span>
                    </td>
                  </tr>
                ))}
                <tr className="bg-green-100 font-semibold">
                  <td className="px-3 py-2" colSpan={6}>TOTAL</td>
                  <td className="px-3 py-2 text-blue-700">
                    {splitConfig.reduce((s: number, a: any) => s + (parseFloat(a.payoutPercentage) || 0), 0).toFixed(1)}%
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm font-bold">7</span>
          Review and Submit
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="text-sm font-medium text-gray-600">Application Status</label><p>{profile.onboarding_status.replace(/_/g, ' ')}</p></div>
          <div><label className="text-sm font-medium text-gray-600">Submitted At</label><p>{profile.submitted_at ? new Date(profile.submitted_at).toLocaleString() : 'Not submitted'}</p></div>
        </div>
        {profile.rejection_reason && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <label className="text-sm font-medium text-red-900">Rejection Reason</label>
            <p className="text-red-800 mt-1">{profile.rejection_reason}</p>
          </div>
        )}
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-8 h-8 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center text-sm">📄</span>
          Documents
        </h2>
        {(() => {
          const profileDocs = [
            { label: 'PAN CARD', url: profile?.pan_card_url },
            { label: 'AADHAAR CARD', url: profile?.aadhaar_card_url },
            { label: 'CANCELLED CHEQUE', url: profile?.cancelled_cheque_url },
            { label: 'BANK STATEMENT / BUSINESS PROOF', url: profile?.business_proof_url },
          ].filter(d => d.url);

          const hasAny = (documents && documents.length > 0) || profileDocs.length > 0;
          if (!hasAny) return <p className="text-gray-500 italic">No documents uploaded</p>;

          const renderDocCard = (label: string, url: string | undefined | null, key: string) => {
            if (!url) {
              return (
                <div key={key} className="border border-gray-200 rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-600 mb-2">{label}</div>
                  <div className="bg-gray-50 rounded-lg p-2 text-sm text-gray-400 italic">No file available</div>
                </div>
              );
            }
            const isPdf = url.toLowerCase().includes('.pdf');
            return (
              <div key={key} className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm font-medium text-gray-600 mb-2">{label}</div>
                <div className="bg-gray-50 rounded-lg p-2">
                  {isPdf ? (
                    <div className="w-full h-48 flex flex-col items-center justify-center border rounded bg-red-50 border-red-200 gap-2">
                      <svg className="w-10 h-10 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8 12h8v1H8v-1zm0 3h8v1H8v-1zm0-6h5v1H8V9z"/>
                      </svg>
                      <span className="text-xs text-red-700 font-medium">PDF Document</span>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">
                        Open PDF ↗
                      </a>
                    </div>
                  ) : (
                    <img src={url} alt={label} className="w-full h-48 object-contain rounded border" onError={(e) => { e.currentTarget.src = '/placeholder-document.png'; }} />
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-2 flex justify-end">
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">View ↗</a>
                </div>
              </div>
            );
          };

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {profileDocs.map(d => renderDocCard(d.label, d.url!, d.label))}
              {documents
                .filter((doc, index, self) => index === self.findIndex(d => d.document_type === doc.document_type))
                .map((doc) => renderDocCard(
                  doc.document_type.replace(/_/g, ' ').toUpperCase(),
                  doc.public_url,
                  doc.id
                ))}
            </div>
          );
        })()}
      </div>

      {profile?.cpv_video_path && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-purple-800 mb-4">🎥 Shop Verification Video (CPV)</h2>
          <p className="text-sm text-purple-600 mb-4">
            Status: <strong>{profile.cpv_status || 'pending'}</strong>
            {profile.cpv_submitted_at && ` · Submitted: ${new Date(profile.cpv_submitted_at).toLocaleString()}`}
          </p>
          <video
            src={profile.cpv_video_path?.startsWith('http') ? profile.cpv_video_path 
              : profile.cpv_video_path?.startsWith('/uploads/') ? `http://localhost:8080${profile.cpv_video_path}`
              : `https://grbbtgfvgwxtkgxtakug.supabase.co/storage/v1/object/public/kyc-videos/${encodeURIComponent(profile.cpv_video_path)}`}
            controls
            className="w-full max-w-xl rounded-lg border"
          />
        </div>
      )}

      <div className="flex gap-4 mt-6 flex-wrap">
        <button onClick={() => navigate(-1)} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
          Back
        </button>

        {(user?.role === "admin" || user?.role === "super_admin") && (
          <>
            {["submitted", "validating"].includes(profile?.onboarding_status) && (
              <button onClick={handleApprove} disabled={actionLoading} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                {actionLoading ? 'Processing...' : 'Approve KYC'}
              </button>
            )}

            {profile?.onboarding_status === "cpv_pending" && profile?.cpv_video_path && profile?.cpv_status !== "cpv_verified" && (
              <button onClick={handleVerifyCPV} disabled={actionLoading} className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
                {actionLoading ? 'Processing...' : '✅ Verify CPV & Send to Bank'}
              </button>
            )}

            {profile?.onboarding_status === "cpv_pending" && profile?.cpv_video_path && (
              <button onClick={handleRejectCPV} disabled={actionLoading} className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50">
                ❌ Reject CPV (Ask Re-record)
              </button>
            )}

            {profile?.onboarding_status !== "approved" && profile?.onboarding_status !== "cpv_pending" && (
              <button onClick={handleReject} disabled={actionLoading} className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                Reject
              </button>
            )}

            {profile?.onboarding_status === "pending_bank_approval" && (
              <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
                ⏳ Sent to bank for approval. Awaiting bank decision.
              </div>
            )}
            {profile?.onboarding_status === "bank_rejected" && (
              <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                ❌ Bank rejected this application.
              </div>
            )}
            {profile?.onboarding_status === "cpv_pending" && !profile?.cpv_video_path && (
              <div className="px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm">
                ⏳ Awaiting CPV video submission from merchant.
              </div>
            )}
            {["agreement_pending", "agreement_signed"].includes(profile?.onboarding_status) && (
              <div className="px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-700 text-sm">
                📝 Agreement stage — managed by bank module.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MerchantReview;
