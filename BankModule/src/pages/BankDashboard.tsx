import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBankAuth } from '../context/BankAuthContext';
import {
    getPendingApplications,
    getAgreementSignedApplications,
    getApplicationDetails,
    decideApplication,
    sendAgreement,
    finalDecision,
    sendAgreementLink,
    Application,
    handleError
} from '../lib/bankApi';
import { CheckCircle, Loader2, LogOut, AlertCircle, FileText, PenLine } from 'lucide-react';

const DEFAULT_COMMERCIALS = {
    bank: [
        { name: 'Axis Bank', processingFee: '1.30%', platformFee: '2.00 Waived', otherFee: '0.00 INR', merchantSystemFee: '2.00 Waived' },
        { name: 'Bank of Baroda', processingFee: '1.65%', platformFee: '2.00 Waived', otherFee: '0.00 INR', merchantSystemFee: '2.00 Waived' },
        { name: 'Federal Bank', processingFee: '1.30%', platformFee: '2.00 Waived', otherFee: '0.00 INR', merchantSystemFee: '2.00 Waived' },
        { name: 'HDFC Bank', processingFee: '1.90%', platformFee: '2.00 Waived', otherFee: '0.00 INR', merchantSystemFee: '2.00 Waived' },
        { name: 'ICICI Bank', processingFee: '1.90%', platformFee: '2.00 Waived', otherFee: '0.00 INR', merchantSystemFee: '2.00 Waived' },
        { name: 'Kotak Bank', processingFee: '1.90%', platformFee: '2.00 Waived', otherFee: '0.00 INR', merchantSystemFee: '2.00 Waived' },
        { name: 'SBI Bank', processingFee: '1.30%', platformFee: '2.00 Waived', otherFee: '0.00 INR', merchantSystemFee: '2.00 Waived' },
        { name: 'Standard Chartered', processingFee: '1.30%', platformFee: '2.00 Waived', otherFee: '0.00 INR', merchantSystemFee: '2.00 Waived' },
        { name: 'Yes Bank', processingFee: '1.30%', platformFee: '2.00 Waived', otherFee: '0.00 INR', merchantSystemFee: '2.00 Waived' },
        { name: 'Other Banks', processingFee: '15.00 INR', platformFee: '2.00 Waived', otherFee: '0.00 INR', merchantSystemFee: '2.00 Waived' },
    ],
    creditCard: [
        { name: 'CC (Visa/Master/Rupay)', processingFee: '2.40%', platformFee: '2.00 Waived', otherFee: '0.00 INR', merchantSystemFee: '2.00 Waived' },
        { name: 'CC (AMEX)', processingFee: '3.25%', platformFee: '2.00 Waived', otherFee: '0.00 INR', merchantSystemFee: '2.00 Waived' },
        { name: 'CC (Diners)', processingFee: '3.25%', platformFee: '2.00 Waived', otherFee: '0.00 INR', merchantSystemFee: '2.00 Waived' },
        { name: 'CC International', processingFee: '3.50%', platformFee: '2.00 Waived', otherFee: '0.00 INR', merchantSystemFee: '2.00 Waived' },
    ],
    debitCard: [
        { name: 'DC (Visa/Master) < 2000', processingFee: '0.40%', platformFee: '2.00 Waived', otherFee: '0.15%', merchantSystemFee: '2.00 Waived' },
        { name: 'DC (Visa/Master) > 2000', processingFee: '0.90%', platformFee: '2.00 Waived', otherFee: '0.15%', merchantSystemFee: '2.00 Waived' },
        { name: 'DC (Rupay) < 2000', processingFee: '0.00%', platformFee: '2.00 INR', otherFee: '0.40%', merchantSystemFee: '1.00 Waived' },
        { name: 'DC (Rupay) > 2000', processingFee: '0.00%', platformFee: '2.00 INR', otherFee: '0.90%', merchantSystemFee: '1.00 Waived' },
    ],
    upi: [
        { name: 'UPI / QR / Intent', custBear: 'No', processingFee: '0.00 INR', platformFee: '5.00%', otherFee: '0.00%', merchantSystemFee: '1.00%' },
    ]
};

interface MerchantDocument {
    id: string;
    document_type: string;
    public_url: string;
    file_name: string;
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
}

type ViewMode = 'list' | 'review' | 'commercials' | 'final-review';

export const BankDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { user, token, logout } = useBankAuth();
    const [applications, setApplications] = useState<Application[]>([]);
    const [agreementApps, setAgreementApps] = useState<Application[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedApp, setSelectedApp] = useState<Application | null>(null);
    const [deciding, setDeciding] = useState(false);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [notes, setNotes] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [activeTab, setActiveTab] = useState<'pending' | 'agreement'>('pending');
    const [commercials, setCommercials] = useState(JSON.parse(JSON.stringify(DEFAULT_COMMERCIALS)));

    const [documents, setDocuments] = useState<MerchantDocument[]>([]);
    const [bankDetails, setBankDetails] = useState<MerchantBankDetails | null>(null);
    const [kycData, setKycData] = useState<MerchantKYC | null>(null);

    // Agreement link states
    const [showLinkForm, setShowLinkForm] = useState(false);
    const [agreementLink, setAgreementLink] = useState('');

    useEffect(() => {
        if (!token) { navigate('/login'); return; }
        fetchAll();
    }, [token, navigate]);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [pending, agreement] = await Promise.all([
                getPendingApplications(token!),
                getAgreementSignedApplications(token!)
            ]);
            setApplications(pending);
            setAgreementApps(agreement);
        } catch (err) {
            setError(handleError(err));
        } finally {
            setLoading(false);
        }
    };

    const isPGProduct = (app: Application) => {
        try {
            const prods = typeof app.selected_products === 'string'
                ? JSON.parse(app.selected_products)
                : app.selected_products || [];
            return prods.some((p: any) => p.product_code === 'PROD_004');
        } catch { return false; }
    };

    const openReview = async (app: Application) => {
        setSelectedApp(app);
        setCommercials(app.bank_commercials
            ? JSON.parse(JSON.stringify(app.bank_commercials))
            : JSON.parse(JSON.stringify(DEFAULT_COMMERCIALS))
        );
        setNotes('');
        setDocuments([]);
        setBankDetails(null);
        setKycData(null);

        // Fetch full merchant details using bankApi (correct base URL)
        try {
            const result = await getApplicationDetails(token!, app.id);
            const merchantData = result.data;
            setDocuments(merchantData.documents || []);
            setBankDetails(merchantData.bank_details || null);
            setKycData(merchantData.kyc || null);
            // Update selectedApp with server-enriched data (includes cpv_video_url)
            setSelectedApp(prev => prev ? { ...prev, ...merchantData } : prev);
        } catch (err) {
            console.warn('Failed to fetch merchant details:', err);
        }

        const isPG = app.has_pg_product || isPGProduct(app);
        setViewMode(isPG ? 'commercials' : 'review');
    };

    const back = () => {
        setSelectedApp(null);
        setViewMode('list');
        setNotes('');
        setDocuments([]);
        setBankDetails(null);
        setKycData(null);
        setShowLinkForm(false);
        setAgreementLink('');
    };

    const generateAgreementPDF = async () => {
        if (!selectedApp) return;

        // Dynamically import jspdf
        const { default: jsPDF } = await import('jspdf');
        const pdf = new jsPDF();
        const pageWidth = pdf.internal.pageSize.getWidth();
        const margin = 15;
        let y = margin;

        const addText = (text: string, x: number, yPos: number, maxWidth: number, size = 9, style = 'normal') => {
            pdf.setFontSize(size);
            pdf.setFont('helvetica', style);
            const lines = pdf.splitTextToSize(text, maxWidth);
            pdf.text(lines, x, yPos);
            return yPos + lines.length * size * 0.4;
        };

        const checkPage = (h: number) => {
            if (y + h > pdf.internal.pageSize.getHeight() - margin) {
                pdf.addPage();
                y = margin;
            }
        };

        const isPG = (selectedApp as any).has_pg_product || isPGProduct(selectedApp);

        // Header
        pdf.setFontSize(16); pdf.setFont('helvetica', 'bold');
        pdf.text('MERCHANT SERVICE AGREEMENT', pageWidth / 2, y, { align: 'center' });
        y += 8;
        pdf.setFontSize(10); pdf.setFont('helvetica', 'normal');
        pdf.text('One78 SabbPe Technology Solutions India Private Limited', pageWidth / 2, y, { align: 'center' });
        y += 6;
        pdf.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, pageWidth / 2, y, { align: 'center' });
        y += 10;

        // Divider
        pdf.setLineWidth(0.5);
        pdf.line(margin, y, pageWidth - margin, y);
        y += 6;

        // Merchant Details
        pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
        pdf.text('MERCHANT DETAILS', margin, y); y += 6;
        pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
        y = addText(`Merchant Name: ${selectedApp.full_name}`, margin, y, pageWidth - 2 * margin);
        y += 1;
        y = addText(`Business Name: ${selectedApp.business_name}`, margin, y, pageWidth - 2 * margin);
        y += 1;
        y = addText(`Email: ${selectedApp.email}`, margin, y, pageWidth - 2 * margin);
        y += 1;
        y = addText(`Mobile: ${(selectedApp as any).mobile_number || 'N/A'}`, margin, y, pageWidth - 2 * margin);
        y += 1;
        y = addText(`PAN: ${(selectedApp as any).pan_number || 'N/A'}`, margin, y, pageWidth - 2 * margin);
        y += 1;
        y = addText(`Application ID: ${(selectedApp as any).application_id || selectedApp.id}`, margin, y, pageWidth - 2 * margin);
        y += 8;

        // Commercials — only for PG merchants
        if (isPG && selectedApp.bank_commercials) {
            checkPage(60);
            pdf.line(margin, y, pageWidth - margin, y); y += 4;
            pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
            pdf.text('PAYMENT GATEWAY COMMERCIAL RATES', margin, y); y += 6;

            const drawTable = (title: string, headers: string[], rows: any[], fields: string[]) => {
                checkPage(20 + rows.length * 5);
                pdf.setFontSize(9); pdf.setFont('helvetica', 'bold');
                pdf.text(title, margin, y); y += 5;

                // Header row
                const colW = (pageWidth - 2 * margin) / headers.length;
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(7);
                headers.forEach((h, i) => pdf.text(h, margin + i * colW, y));
                y += 1;
                pdf.line(margin, y, pageWidth - margin, y); y += 3;

                // Data rows
                pdf.setFont('helvetica', 'normal');
                rows.forEach(row => {
                    checkPage(6);
                    fields.forEach((f, i) => {
                        const val = String(row[f] || '-');
                        pdf.text(pdf.splitTextToSize(val, colW - 2)[0], margin + i * colW, y);
                    });
                    y += 5;
                });
                y += 3;
            };

            const c = selectedApp.bank_commercials;
            if (c.bank) drawTable('Bank Commercials', ['Bank', 'Processing', 'Platform', 'Other', 'System Fee'], c.bank, ['name', 'processingFee', 'platformFee', 'otherFee', 'merchantSystemFee']);
            if (c.creditCard) drawTable('Credit Card', ['Option', 'Processing', 'Platform', 'Other', 'System Fee'], c.creditCard, ['name', 'processingFee', 'platformFee', 'otherFee', 'merchantSystemFee']);
            if (c.debitCard) drawTable('Debit Card', ['Option', 'Processing', 'Platform', 'Other', 'System Fee'], c.debitCard, ['name', 'processingFee', 'platformFee', 'otherFee', 'merchantSystemFee']);
            if (c.upi) drawTable('UPI', ['Option', 'Cust Bear', 'Processing', 'Platform', 'Other', 'System'], c.upi, ['name', 'custBear', 'processingFee', 'platformFee', 'otherFee', 'merchantSystemFee']);
        }

        // Agreement Terms
        checkPage(20);
        pdf.line(margin, y, pageWidth - margin, y); y += 4;
        pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
        pdf.text('TERMS AND CONDITIONS', margin, y); y += 8;

        const terms = [
            { title: '1. Service Overview', body: 'One78 SabbPe Technology Solutions India Private Limited ("SabbPe") provides payment acceptance solutions to merchants in India. By accepting this agreement, you agree to use SabbPe services in compliance with all applicable Indian laws including RBI guidelines, NPCI regulations, and the Information Technology Act, 2000.' },
            { title: '2. Transaction Processing & Settlement', body: 'Standard Settlement: T+1 (Next business day by 2 PM IST). Fast Settlement (Optional): T+0, additional charges apply. All transactions processed through NPCI. Per-transaction limit: ₹1,00,000 as per NPCI guidelines.' },
            { title: '3. Merchant Obligations', body: 'You must maintain valid business registration, comply with KYC requirements, protect customer data per DPDP Act 2023, not engage in money laundering or illegal activities, and maintain transaction records for 7 years.' },
            { title: '4. Dispute Resolution', body: 'Disputes resolved per RBI guidelines. Chargeback fee: ₹1,000-2,000 per incident. Disputes must be reported within 5 days. Evidence must be provided within 7 days of dispute notification. Unresolved disputes referred to arbitration per Indian Arbitration Act, 1996.' },
            { title: '5. Liability', body: 'SabbPe liability limited to fees paid in the preceding 15 days. SabbPe not liable for third-party network failures, customer disputes about goods/services, or unauthorized transactions where merchant failed to maintain security.' },
            { title: '6. Termination', body: 'Either party may terminate with 30 days written notice. SabbPe may terminate immediately for fraud, money laundering, or regulatory non-compliance. All dues payable immediately on termination.' },
            { title: '7. Governing Law', body: 'This agreement is governed by the laws of India. Exclusive jurisdiction of courts in Delhi. All disputes resolved through arbitration before litigation.' },
        ];

        for (const section of terms) {
            checkPage(25);
            pdf.setFontSize(9); pdf.setFont('helvetica', 'bold');
            y = addText(section.title, margin, y, pageWidth - 2 * margin, 9, 'bold');
            y += 1;
            pdf.setFont('helvetica', 'normal');
            y = addText(section.body, margin, y, pageWidth - 2 * margin, 8, 'normal');
            y += 5;
        }

        // Signature Section
        checkPage(40);
        pdf.line(margin, y, pageWidth - margin, y); y += 6;
        pdf.setFontSize(10); pdf.setFont('helvetica', 'bold');
        pdf.text('ACKNOWLEDGMENT & SIGNATURE', margin, y); y += 8;
        pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
        pdf.text('By signing below, I confirm that I have read, understood, and agree to all terms:', margin, y); y += 8;

        // Signature lines
        pdf.text('Merchant Signature: ________________________', margin, y);
        pdf.text('Date: ________________________', pageWidth / 2, y);
        y += 10;
        pdf.text(`Merchant Name: ${selectedApp.full_name}`, margin, y);
        y += 6;
        pdf.text(`Business Name: ${selectedApp.business_name}`, margin, y);
        y += 10;

        pdf.line(margin, y, pageWidth - margin, y); y += 4;
        pdf.setFontSize(7);
        pdf.text('For SabbPe: One78 SabbPe Technology Solutions India Private Limited | support@sabbpe.in | www.sabbpe.in', pageWidth / 2, y, { align: 'center' });

        // Save
        const fileName = `SabbPe_Agreement_${(selectedApp as any).application_id || selectedApp.id}_${new Date().toISOString().split('T')[0]}.pdf`;
        pdf.save(fileName);
    };

    const handleSendAgreementLink = async () => {
        if (!selectedApp || !agreementLink.trim()) {
            alert('⚠️ Please paste the agreement link first');
            return;
        }
        if (!window.confirm('Send this agreement link to the merchant?')) return;
        try {
            setDeciding(true);
            await sendAgreementLink(token!, selectedApp.id, agreementLink.trim());
            alert('✅ Agreement link sent to merchant!');
            setShowLinkForm(false);
            setAgreementLink('');
            await fetchAll();
            back();
        } catch (err) {
            alert(`❌ ${handleError(err)}`);
        } finally {
            setDeciding(false);
        }
    };

    const handleSendAgreement = async () => {
        if (!selectedApp || !token) return;
        if (!window.confirm('Send agreement to merchant?')) return;
        try {
            setDeciding(true);
            await sendAgreement(token, selectedApp.id, commercials, notes);
            alert('✅ Agreement sent to merchant!');
            await fetchAll();
            back();
        } catch (err) { alert(`❌ ${handleError(err)}`); }
        finally { setDeciding(false); }
    };

    const handleReject = async (appId: string) => {
        if (!notes.trim()) { alert('⚠️ Please provide rejection reason'); return; }
        if (!window.confirm('Reject this application?')) return;
        try {
            setDeciding(true);
            await decideApplication(token!, appId, { decision: 'reject', notes });
            alert('❌ Application Rejected!');
            await fetchAll(); back();
        } catch (err) { alert(`❌ ${handleError(err)}`); }
        finally { setDeciding(false); }
    };

    const handleFinalApprove = async (appId: string) => {
        if (!window.confirm('Final approve this application?')) return;
        try {
            setDeciding(true);
            const result = await finalDecision(token!, appId, 'approve', notes || 'Final approved');
            const resData = result?.data || result;
            if (resData?.finalApprovalArchiveEmailSent) {
                alert('✅ Application Finally Approved! Documents zip email sent.');
            } else {
                alert(`✅ Application Finally Approved, but documents zip email was not sent.\n\n${resData?.finalApprovalArchiveEmailError || 'Check backend email logs.'}`);
            }
            await fetchAll(); back();
        } catch (err) { alert(`❌ ${handleError(err)}`); }
        finally { setDeciding(false); }
    };

    const handleFinalReject = async (appId: string) => {
        if (!notes.trim()) { alert('⚠️ Please provide rejection reason'); return; }
        if (!window.confirm('Reject this application?')) return;
        try {
            setDeciding(true);
            await finalDecision(token!, appId, 'reject', notes);
            alert('❌ Application Rejected!');
            await fetchAll(); back();
        } catch (err) { alert(`❌ ${handleError(err)}`); }
        finally { setDeciding(false); }
    };

    const updateCommercialField = (section: string, idx: number, field: string, value: string) => {
        setCommercials((prev: any) => {
            const updated = JSON.parse(JSON.stringify(prev));
            updated[section][idx][field] = value;
            return updated;
        });
    };

    const getSelectedProducts = (app: Application): { product_code: string; product_name: string; pricing_type?: string; price?: number }[] => {
        if (!app?.selected_products) return [];
        try {
            const prods = typeof app.selected_products === 'string'
                ? JSON.parse(app.selected_products)
                : app.selected_products;
            return Array.isArray(prods) ? prods : [];
        } catch { return []; }
    };

    if (loading) return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <Loader2 className="w-12 h-12 animate-spin text-purple-600" />
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="bg-white shadow sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Bank Review Portal</h1>
                        <p className="text-sm text-gray-600">Welcome, {user?.name} • {user?.email}</p>
                    </div>
                    <button onClick={() => { logout(); navigate('/login'); }}
                        className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg border">
                        <LogOut className="w-5 h-5" /> Logout
                    </button>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-8">
                {error && <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg"><AlertCircle className="w-5 h-5 inline mr-2 text-red-600" />{error}</div>}

                {/* COMMERCIALS FORM */}
                {viewMode === 'commercials' && selectedApp && (
                    <div className="max-w-6xl mx-auto space-y-6">

                        {/* Merchant Details Header */}
                        <div className="bg-white rounded-lg shadow-lg">
                            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-bold">PG Merchant Review</h2>
                                    <p className="text-blue-100">{selectedApp.business_name} — {selectedApp.full_name}</p>
                                </div>
                                <button onClick={back} className="text-2xl hover:bg-white/20 rounded-full w-10 h-10 flex items-center justify-center">✕</button>
                            </div>
                            <div className="px-6 py-4 border-b">
                                <span className="px-4 py-2 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                                    {(selectedApp as any).onboarding_status?.replace(/_/g, ' ').toUpperCase()}
                                </span>
                                <span className="ml-4 text-sm text-gray-600">Application ID: {(selectedApp as any).application_id || selectedApp.id}</span>
                            </div>
                        </div>

                        {/* 1. Sign In Details */}
                        <div className="bg-white border rounded-lg p-6">
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <span className="w-7 h-7 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold">1</span>
                                Sign In Details
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div><label className="text-xs font-medium text-gray-500">Full Name</label><p className="font-medium">{selectedApp.full_name}</p></div>
                                    <div><label className="text-xs font-medium text-gray-500">Email</label><p>{selectedApp.email}</p></div>
                                    <div><label className="text-xs font-medium text-gray-500">Mobile</label><p>{(selectedApp as any).mobile_number || 'N/A'}</p></div>
                                </div>
                                <div className="space-y-2">
                                    <div><label className="text-xs font-medium text-gray-500">Application ID</label><p className="font-mono text-sm">{(selectedApp as any).application_id || selectedApp.id}</p></div>
                                    <div><label className="text-xs font-medium text-gray-500">Created</label><p>{selectedApp.created_at ? new Date(selectedApp.created_at).toLocaleDateString() : 'N/A'}</p></div>
                                </div>
                            </div>
                        </div>

                        {/* 2. Product Selection */}
                        <div className="bg-white border rounded-lg p-6">
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <span className="w-7 h-7 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-sm font-bold">2</span>
                                Product Selection
                            </h2>
                            {(() => {
                                const prods = (() => {
                                    try {
                                        const p = typeof selectedApp.selected_products === 'string' ? JSON.parse(selectedApp.selected_products) : selectedApp.selected_products;
                                        return Array.isArray(p) ? p : [];
                                    } catch { return []; }
                                })();
                                const subProds = (() => {
                                    try {
                                        const s = typeof (selectedApp as any).selected_sub_products === 'string' ? JSON.parse((selectedApp as any).selected_sub_products) : (selectedApp as any).selected_sub_products;
                                        return Array.isArray(s) ? s : [];
                                    } catch { return []; }
                                })();
                                return prods.length > 0 ? (
                                    <div className="flex flex-wrap gap-3">
                                        {prods.map((p: any) => (
                                            <div key={p.product_code} className="p-3 border-2 border-green-500 bg-green-50 rounded-lg min-w-[160px]">
                                                <span className="font-medium text-green-900">✓ {p.product_name}</span>
                                                {p.pricing_type && <p className="text-xs text-green-700 mt-1">{p.pricing_type}{p.price ? ` — ₹${p.price.toLocaleString()}` : ''}</p>}
                                                {/* Sub-products under PG */}
                                                {p.product_code === 'PROD_004' && subProds.length > 0 && (
                                                    <div className="mt-2 space-y-1">
                                                        {subProds.map((s: any) => (
                                                            <div key={s.sub_product_code} className="flex items-center gap-1">
                                                                <span className="text-blue-400 text-xs">↳</span>
                                                                <span className="text-xs text-blue-700 font-medium">{s.sub_product_name}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {p.product_code === 'PROD_004' && subProds.length === 0 && (
                                                    <p className="text-xs text-gray-400 mt-1">↳ No add-ons</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : <p className="text-gray-500 italic">No products</p>;
                            })()}
                        </div>

                        {/* 3. Registration */}
                        <div className="bg-white border rounded-lg p-6">
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <span className="w-7 h-7 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-bold">3</span>
                                Registration
                            </h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div><label className="text-xs font-medium text-gray-500">Business Name</label><p>{selectedApp.business_name || 'N/A'}</p></div>
                                <div><label className="text-xs font-medium text-gray-500">Entity Type</label><p>{(selectedApp as any).entity_type || 'N/A'}</p></div>
                                <div><label className="text-xs font-medium text-gray-500">GST</label><p>{(selectedApp as any).gst_number || 'N/A'}</p></div>
                                <div><label className="text-xs font-medium text-gray-500">PAN</label><p className="font-mono">{(selectedApp as any).pan_number || 'N/A'}</p></div>
                                <div><label className="text-xs font-medium text-gray-500">Aadhaar</label><p className="font-mono">{(selectedApp as any).aadhaar_number || 'N/A'}</p></div>
                            </div>
                        </div>

                        {/* 4. KYC */}
                        <div className="bg-white border rounded-lg p-6">
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <span className="w-7 h-7 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-sm font-bold">4</span>
                                KYC Verification
                            </h2>
                            {kycData ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="text-xs font-medium text-gray-500">KYC Status</label>
                                        <span className={`ml-2 px-2 py-0.5 text-xs rounded ${kycData.kyc_status === 'verified' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                            {kycData.kyc_status.toUpperCase()}
                                        </span>
                                    </div>
                                    <div><label className="text-xs font-medium text-gray-500">Video KYC</label><p>{kycData.video_kyc_completed ? '✓ Done' : '✗ Pending'}</p></div>
                                    <div><label className="text-xs font-medium text-gray-500">Location</label><p>{kycData.location_captured ? '✓ Captured' : '✗ Not captured'}</p></div>
                                    {kycData.completed_at && <div className="col-span-2"><label className="text-xs font-medium text-gray-500">Completed At</label><p className="text-sm">{new Date(kycData.completed_at).toLocaleString()}</p></div>}
                                </div>
                            ) : <p className="text-gray-500 italic text-sm">KYC not initiated</p>}
                        </div>

                        {/* 5. Bank Details */}
                        <div className="bg-white border rounded-lg p-6">
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <span className="w-7 h-7 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center text-sm font-bold">5</span>
                                Bank Details
                            </h2>
                            {bankDetails ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <div><label className="text-xs font-medium text-gray-500">Bank Name</label><p>{bankDetails.bank_name}</p></div>
                                    <div><label className="text-xs font-medium text-gray-500">Account Holder</label><p>{bankDetails.account_holder_name}</p></div>
                                    <div><label className="text-xs font-medium text-gray-500">Account Number</label><p className="font-mono">{bankDetails.account_number}</p></div>
                                    <div><label className="text-xs font-medium text-gray-500">IFSC</label><p className="font-mono">{bankDetails.ifsc_code}</p></div>
                                    <div><label className="text-xs font-medium text-gray-500">Account Type</label><p>{bankDetails.account_type || 'N/A'}</p></div>
                                    <div><label className="text-xs font-medium text-gray-500">Branch</label><p>{bankDetails.branch_name || 'N/A'}</p></div>
                                </div>
                            ) : <p className="text-gray-500 italic text-sm">Bank details not provided</p>}
                        </div>

                        {/* 6. Documents */}
                        <div className="bg-white border rounded-lg p-6">
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <span className="w-7 h-7 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center text-sm">📄</span>
                                Documents
                            </h2>
                            {documents.length > 0 ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {documents.filter((d, i, s) => i === s.findIndex(x => x.document_type === d.document_type)).map(doc => (
                                        <div key={doc.id} className="border rounded-lg p-3">
                                            <p className="text-xs font-medium text-gray-600 mb-2">{doc.document_type.replace(/_/g, ' ').toUpperCase()}</p>
                                            <img src={doc.public_url} alt={doc.document_type} className="w-full h-36 object-contain rounded border bg-gray-50"
                                                onError={e => { (e.target as HTMLImageElement).src = '/placeholder-document.png'; }} />
                                            <p className="text-xs text-gray-400 mt-1">{doc.file_name}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-gray-500 italic text-sm">No documents uploaded</p>}
                        </div>

                        {/* CPV Video */}
                        {((selectedApp as any).cpv_video_url || (selectedApp as any).cpv_video_path) && (
                            <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                                <h2 className="text-lg font-semibold text-purple-800 mb-3">🎥 Shop Verification Video (CPV)</h2>
                                <p className="text-sm text-purple-600 mb-3">Status: <strong>{(selectedApp as any).cpv_status || 'pending'}</strong></p>
                                <video
                                    src={(selectedApp as any).cpv_video_url || (selectedApp as any).cpv_video_path}
                                    controls
                                    className="w-full max-w-xl rounded-lg border"
                                />
                            </div>
                        )}

                        {/* 7. Commercial Rates — set by bank */}
                        <div className="bg-white rounded-lg shadow-lg">
                            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 p-6 text-white">
                                <h2 className="text-xl font-bold">7. Set Commercial Rates</h2>
                                <p className="text-indigo-100 text-sm">Review and edit rates — these will be shown to the merchant in the agreement</p>
                            </div>
                            <div className="p-6 space-y-6">
                            {[
                                { title: 'Bank Commercials', key: 'bank', headers: ['Bank','Processing Fee','Platform Fee','Other Fee','System Fee'], fields: ['name','processingFee','platformFee','otherFee','merchantSystemFee'], readOnly: ['name'] },
                                { title: 'Credit Card', key: 'creditCard', headers: ['Option','Processing Fee','Platform Fee','Other Fee','System Fee'], fields: ['name','processingFee','platformFee','otherFee','merchantSystemFee'], readOnly: ['name'] },
                                { title: 'Debit Card', key: 'debitCard', headers: ['Option','Processing Fee','Platform Fee','Other Fee','System Fee'], fields: ['name','processingFee','platformFee','otherFee','merchantSystemFee'], readOnly: ['name'] },
                                { title: 'UPI', key: 'upi', headers: ['Option','Cust Bear','Processing Fee','Platform Fee','Other Fee','System Fee'], fields: ['name','custBear','processingFee','platformFee','otherFee','merchantSystemFee'], readOnly: ['name','custBear'] },
                            ].map(({ title, key, headers, fields, readOnly }) => (
                                <div key={key}>
                                    <h3 className="font-semibold text-gray-700 mb-2">{title}</h3>
                                    <div className="overflow-x-auto rounded-lg border">
                                        <table className="min-w-full text-sm">
                                            <thead className="bg-gray-100">
                                                <tr>{headers.map(h => <th key={h} className="px-3 py-2 text-left font-semibold border-b text-gray-700">{h}</th>)}</tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {(commercials[key] || []).map((row: any, idx: number) => (
                                                    <tr key={idx} className="hover:bg-gray-50">
                                                        {fields.map(f => (
                                                            <td key={f} className="px-3 py-2">
                                                                {readOnly.includes(f)
                                                                    ? <span>{row[f]}</span>
                                                                    : <input type="text" value={row[f] || ''} onChange={e => updateCommercialField(key, idx, f, e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" />
                                                                }
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                            <div>
                                <label className="block text-sm font-semibold mb-2">Notes (optional)</label>
                                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes for the merchant..." rows={3} className="w-full px-4 py-3 border rounded-lg" />
                            </div>
                        </div>
                            <div className="p-6 border-t bg-gray-50 space-y-4">
                                {/* Link form */}
                                {showLinkForm && (
                                    <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg space-y-3">
                                        <label className="block text-sm font-semibold text-indigo-800">
                                            Paste Agreement PDF Link
                                        </label>
                                        <input
                                            type="url"
                                            value={agreementLink}
                                            onChange={e => setAgreementLink(e.target.value)}
                                            placeholder="https://drive.google.com/..."
                                            className="w-full px-4 py-2 border border-indigo-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                                        />
                                        <div className="flex gap-2 justify-end">
                                            <button onClick={() => { setShowLinkForm(false); setAgreementLink(''); }}
                                                className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
                                            <button onClick={handleSendAgreementLink}
                                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm flex items-center gap-2"
                                                disabled={deciding || !agreementLink.trim()}>
                                                <PenLine className="w-3 h-3" />{deciding ? 'Sending...' : 'Confirm Send'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <div className="flex justify-end gap-3 flex-wrap">
                                    <button onClick={back} className="px-6 py-3 border rounded-lg" disabled={deciding}>← Back</button>
                                    <button onClick={() => handleReject(selectedApp.id)} className="px-6 py-3 bg-red-600 text-white rounded-lg" disabled={deciding || !notes.trim()}>Reject</button>
                                    <button onClick={generateAgreementPDF}
                                        className="px-6 py-3 bg-green-600 text-white rounded-lg flex items-center gap-2" disabled={deciding}>
                                        📄 Generate Agreement
                                    </button>
                                    <button onClick={() => setShowLinkForm(true)}
                                        className="px-6 py-3 bg-indigo-600 text-white rounded-lg flex items-center gap-2"
                                        disabled={deciding || showLinkForm}>
                                        <PenLine className="w-4 h-4" /> Send Link to Merchant
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* NON-PG REVIEW — COMPREHENSIVE */}
                {viewMode === 'review' && selectedApp && (
                    <div className="max-w-6xl mx-auto space-y-8">
                        <div className="bg-white rounded-lg shadow-lg">
                            <div className="bg-gradient-to-r from-purple-600 to-purple-700 p-6 text-white flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-bold">Complete Merchant Review</h2>
                                    <p className="text-purple-100">{selectedApp.business_name} — {selectedApp.full_name}</p>
                                </div>
                                <button onClick={back} className="text-2xl hover:bg-white/20 rounded-full w-10 h-10 flex items-center justify-center">✕</button>
                            </div>
                            <div className="px-6 py-4 border-b">
                                <span className={`px-4 py-2 rounded-full text-sm font-medium ${
                                    selectedApp.onboarding_status === 'approved' ? 'bg-green-100 text-green-800' :
                                    selectedApp.onboarding_status === 'rejected' ? 'bg-red-100 text-red-800' :
                                    'bg-gray-100 text-gray-800'
                                }`}>{selectedApp.onboarding_status?.replace(/_/g, ' ').toUpperCase()}</span>
                                <span className="ml-4 text-sm text-gray-600">Application ID: {(selectedApp as any).application_id || selectedApp.id}</span>
                            </div>
                        </div>

                        {/* 1. Sign In Details */}
                        <div className="bg-white border rounded-lg p-6">
                            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                                <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold">1</span>
                                Sign In Details
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-3">
                                    <div><label className="text-sm font-medium text-gray-600">Full Name</label><p className="font-medium">{selectedApp.full_name}</p></div>
                                    <div><label className="text-sm font-medium text-gray-600">Email</label><p>{selectedApp.email}</p></div>
                                    <div><label className="text-sm font-medium text-gray-600">Mobile</label><p>{(selectedApp as any).mobile_number || 'N/A'}</p></div>
                                </div>
                                <div className="space-y-3">
                                    <div><label className="text-sm font-medium text-gray-600">Account Created</label><p>{selectedApp.created_at ? new Date(selectedApp.created_at).toLocaleDateString() : 'N/A'}</p></div>
                                    <div><label className="text-sm font-medium text-gray-600">Application ID</label><p className="font-mono text-sm">{(selectedApp as any).application_id || selectedApp.id}</p></div>
                                </div>
                            </div>
                        </div>

                        {/* 2. Product Selection */}
                        <div className="bg-white border rounded-lg p-6">
                            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                                <span className="w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-sm font-bold">2</span>
                                Product Selection
                            </h2>
                            {(() => {
                                const prods = getSelectedProducts(selectedApp);
                                const subProds2 = (() => {
                                    try {
                                        const s = typeof (selectedApp as any).selected_sub_products === 'string' ? JSON.parse((selectedApp as any).selected_sub_products) : (selectedApp as any).selected_sub_products;
                                        return Array.isArray(s) ? s : [];
                                    } catch { return []; }
                                })();
                                return prods.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {prods.map(p => (
                                            <div key={p.product_code} className="p-4 border-2 border-green-500 bg-green-50 rounded-lg">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="w-5 h-5 bg-green-500 text-white rounded-full flex items-center justify-center text-xs">✓</span>
                                                    <span className="font-medium text-green-900">{p.product_name}</span>
                                                </div>
                                                {p.pricing_type && <p className="text-sm text-green-700">Type: {p.pricing_type}{p.price ? ` — ₹${p.price.toLocaleString()}` : ''}</p>}
                                                {p.product_code === 'PROD_004' && subProds2.length > 0 && (
                                                    <div className="mt-2 pt-2 border-t border-green-200 space-y-1">
                                                        <p className="text-xs text-gray-500 font-medium">Add-ons:</p>
                                                        {subProds2.map((s: any) => (
                                                            <div key={s.sub_product_code} className="flex items-center gap-1">
                                                                <span className="text-blue-400 text-xs">↳</span>
                                                                <span className="text-xs text-blue-700">{s.sub_product_name}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {p.product_code === 'PROD_004' && subProds2.length === 0 && (
                                                    <p className="text-xs text-gray-400 mt-1">↳ No add-ons</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : <p className="text-gray-500 italic">No products selected</p>;
                            })()}
                        </div>

                        {/* 3. Registration */}
                        <div className="bg-white border rounded-lg p-6">
                            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                                <span className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-bold">3</span>
                                Registration
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-3">
                                    <div><label className="text-sm font-medium text-gray-600">Business Name</label><p>{selectedApp.business_name || 'N/A'}</p></div>
                                    <div><label className="text-sm font-medium text-gray-600">Entity Type</label><p>{(selectedApp as any).entity_type || 'N/A'}</p></div>
                                    <div><label className="text-sm font-medium text-gray-600">GST Number</label><p>{(selectedApp as any).gst_number || 'N/A'}</p></div>
                                </div>
                                <div className="space-y-3">
                                    <div><label className="text-sm font-medium text-gray-600">PAN Number</label><p className="font-mono">{(selectedApp as any).pan_number || 'N/A'}</p></div>
                                    <div><label className="text-sm font-medium text-gray-600">Aadhaar Number</label><p className="font-mono">{(selectedApp as any).aadhaar_number || 'N/A'}</p></div>
                                </div>
                            </div>
                        </div>

                        {/* 4. KYC Verification */}
                        <div className="bg-white border rounded-lg p-6">
                            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                                <span className="w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-sm font-bold">4</span>
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
                                        {kycData.latitude && kycData.longitude && <div><label className="text-sm font-medium text-gray-600">Coordinates</label><p className="font-mono text-sm">{kycData.latitude}, {kycData.longitude}</p></div>}
                                        {kycData.completed_at && <div><label className="text-sm font-medium text-gray-600">Completed At</label><p>{new Date(kycData.completed_at).toLocaleString()}</p></div>}
                                    </div>
                                    {kycData.rejection_reason && (
                                        <div className="col-span-2 p-4 bg-red-50 border border-red-200 rounded-lg">
                                            <label className="text-sm font-medium text-red-900">Rejection Reason</label>
                                            <p className="text-red-800 mt-1">{kycData.rejection_reason}</p>
                                        </div>
                                    )}
                                </div>
                            ) : <p className="text-gray-500 italic">KYC not initiated</p>}
                        </div>

                        {/* 5. Bank Details */}
                        <div className="bg-white border rounded-lg p-6">
                            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                                <span className="w-8 h-8 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center text-sm font-bold">5</span>
                                Bank Details
                            </h2>
                            {bankDetails ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                        <div><label className="text-sm font-medium text-gray-600">Bank Name</label><p>{bankDetails.bank_name}</p></div>
                                        <div><label className="text-sm font-medium text-gray-600">Account Holder</label><p>{bankDetails.account_holder_name}</p></div>
                                        <div><label className="text-sm font-medium text-gray-600">Account Type</label><p>{bankDetails.account_type || 'N/A'}</p></div>
                                    </div>
                                    <div className="space-y-3">
                                        <div><label className="text-sm font-medium text-gray-600">Account Number</label><p className="font-mono">{bankDetails.account_number}</p></div>
                                        <div><label className="text-sm font-medium text-gray-600">IFSC Code</label><p className="font-mono">{bankDetails.ifsc_code}</p></div>
                                        <div><label className="text-sm font-medium text-gray-600">Branch</label><p>{bankDetails.branch_name || 'N/A'}</p></div>
                                    </div>
                                </div>
                            ) : <p className="text-gray-500 italic">Bank details not provided</p>}
                        </div>

                        {/* Documents */}
                        <div className="bg-white border rounded-lg p-6">
                            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                                <span className="w-8 h-8 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center text-sm">📄</span>
                                Documents
                            </h2>
                            {documents.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {documents.filter((d, i, s) => i === s.findIndex(x => x.document_type === d.document_type)).map(doc => (
                                        <div key={doc.id} className="border rounded-lg p-4">
                                            <div className="text-sm font-medium text-gray-600 mb-2">{doc.document_type.replace(/_/g, ' ').toUpperCase()}</div>
                                            <img src={doc.public_url} alt={doc.document_type} className="w-full h-48 object-contain rounded border bg-gray-50"
                                                onError={e => { (e.target as HTMLImageElement).src = '/placeholder-document.png'; }} />
                                            <p className="text-xs text-gray-500 mt-2">{doc.file_name}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-gray-500 italic">No documents uploaded</p>}
                        </div>

                        {/* CPV Video */}
                        {((selectedApp as any).cpv_video_url || (selectedApp as any).cpv_video_path) && (
                            <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                                <h2 className="text-lg font-semibold text-purple-800 mb-3">🎥 Shop Verification Video (CPV)</h2>
                                <p className="text-sm text-purple-600 mb-3">Status: <strong>{(selectedApp as any).cpv_status || 'pending'}</strong></p>
                                <video
                                    src={(selectedApp as any).cpv_video_url || (selectedApp as any).cpv_video_path}
                                    controls
                                    className="w-full max-w-xl rounded-lg border"
                                />
                            </div>
                        )}

                        {/* Review Notes & Actions */}
                        <div className="bg-white border rounded-lg p-6">
                            <label className="block text-sm font-semibold mb-2">Review Notes</label>
                            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add your review notes here..." rows={4} className="w-full px-4 py-3 border rounded-lg mb-4" />
                            <div className="flex justify-end gap-3 flex-wrap">
                                <button onClick={back} className="px-6 py-3 border rounded-lg" disabled={deciding}>← Back</button>
                                <button onClick={() => handleReject(selectedApp.id)} className="px-6 py-3 bg-red-600 text-white rounded-lg" disabled={deciding || !notes.trim()}>Reject</button>
                                <button onClick={generateAgreementPDF}
                                    className="px-6 py-3 bg-green-600 text-white rounded-lg flex items-center gap-2" disabled={deciding}>
                                    📄 Generate Agreement
                                </button>
                                <button onClick={() => setShowLinkForm(v => !v)}
                                    className="px-6 py-3 bg-indigo-600 text-white rounded-lg flex items-center gap-2" disabled={deciding}>
                                    <PenLine className="w-4 h-4" /> Send Link to Merchant
                                </button>
                            </div>
                            {showLinkForm && (
                                <div className="mt-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg space-y-3">
                                    <label className="block text-sm font-semibold text-indigo-800">Paste Agreement PDF Link</label>
                                    <input type="url" value={agreementLink} onChange={e => setAgreementLink(e.target.value)}
                                        placeholder="https://drive.google.com/..."
                                        className="w-full px-4 py-2 border border-indigo-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500" />
                                    <div className="flex gap-2 justify-end">
                                        <button onClick={() => { setShowLinkForm(false); setAgreementLink(''); }} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
                                        <button onClick={handleSendAgreementLink} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm flex items-center gap-2" disabled={deciding || !agreementLink.trim()}>
                                            <PenLine className="w-3 h-3" />{deciding ? 'Sending...' : 'Confirm Send'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* FINAL REVIEW */}
                {viewMode === 'final-review' && selectedApp && (
                    <div className="bg-white rounded-lg shadow-lg">
                        <div className="bg-gradient-to-r from-green-600 to-green-700 p-6 text-white flex justify-between">
                            <div>
                                <h2 className="text-2xl font-bold">Final Review — {selectedApp.business_name}</h2>
                                <p className="text-green-100">Merchant has signed the agreement ✅</p>
                            </div>
                            <button onClick={back} className="text-2xl">✕</button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-gray-50 rounded-lg"><p className="text-xs text-gray-600">Name</p><p className="font-medium">{selectedApp.full_name}</p></div>
                                <div className="p-4 bg-gray-50 rounded-lg"><p className="text-xs text-gray-600">Email</p><p className="font-medium">{selectedApp.email}</p></div>
                                <div className="p-4 bg-gray-50 rounded-lg col-span-2"><p className="text-xs text-gray-600">Business</p><p className="font-medium">{selectedApp.business_name}</p></div>
                            </div>
                            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                                <p className="font-semibold text-green-800 mb-1">✅ Agreement Signed by Merchant</p>
                                <p className="text-sm text-green-700">Merchant confirmed signing on: {selectedApp.pg_agreement_signed_at ? new Date(selectedApp.pg_agreement_signed_at).toLocaleString() : '-'}</p>
                            </div>

                            {/* Agreement link — bank clicks to open DocuSeal and countersign */}
                            {(selectedApp as any).agreement_link && (
                                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                                    <p className="font-semibold text-indigo-800 mb-2">📄 Agreement Document</p>
                                    <p className="text-sm text-indigo-700 mb-3">
                                        Open the agreement below to review the merchant's signature and complete your countersignature on DocuSeal.
                                    </p>
                                    <a
                                        href={(selectedApp as any).agreement_link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm"
                                    >
                                        🔗 Open Agreement on DocuSeal
                                    </a>
                                </div>
                            )}
                            {selectedApp.bank_commercials && (
                                <div>
                                    <h3 className="font-semibold text-gray-700 mb-3">Agreed Commercial Rates</h3>
                                    {Object.entries({
                                        'Bank': { rows: selectedApp.bank_commercials.bank, fields: ['name','processingFee','platformFee','otherFee','merchantSystemFee'], headers: ['Bank','Processing Fee','Platform Fee','Other Fee','System Fee'] },
                                        'Credit Card': { rows: selectedApp.bank_commercials.creditCard, fields: ['name','processingFee','platformFee','otherFee','merchantSystemFee'], headers: ['Option','Processing Fee','Platform Fee','Other Fee','System Fee'] },
                                        'Debit Card': { rows: selectedApp.bank_commercials.debitCard, fields: ['name','processingFee','platformFee','otherFee','merchantSystemFee'], headers: ['Option','Processing Fee','Platform Fee','Other Fee','System Fee'] },
                                        'UPI': { rows: selectedApp.bank_commercials.upi, fields: ['name','custBear','processingFee','platformFee','otherFee','merchantSystemFee'], headers: ['Option','Cust Bear','Processing Fee','Platform Fee','Other Fee','System Fee'] },
                                    } as any).map(([title, { rows, fields, headers }]: any) => rows && (
                                        <div key={title} className="mb-3">
                                            <p className="text-xs font-semibold text-gray-500 mb-1">{title}</p>
                                            <div className="overflow-x-auto rounded border">
                                                <table className="min-w-full text-xs">
                                                    <thead className="bg-gray-100"><tr>{headers.map((h: string) => <th key={h} className="px-3 py-2 text-left font-semibold border-b">{h}</th>)}</tr></thead>
                                                    <tbody className="divide-y">{rows.map((row: any, i: number) => <tr key={i}>{fields.map((f: string) => <td key={f} className="px-3 py-2">{row[f]}</td>)}</tr>)}</tbody>
                                                </table>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-semibold mb-2">Final Review Notes</label>
                                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add final review notes..." rows={3} className="w-full px-4 py-3 border rounded-lg" />
                            </div>
                        </div>
                        <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
                            <button onClick={back} className="px-6 py-3 border rounded-lg" disabled={deciding}>← Back</button>
                            <button onClick={() => handleFinalReject(selectedApp.id)} className="px-6 py-3 bg-red-600 text-white rounded-lg" disabled={deciding || !notes.trim()}>Reject</button>
                            <button onClick={() => handleFinalApprove(selectedApp.id)} className="px-6 py-3 bg-green-600 text-white rounded-lg flex items-center gap-2" disabled={deciding}>
                                <CheckCircle className="w-4 h-4" />{deciding ? 'Processing...' : 'Final Approve'}
                            </button>
                        </div>
                    </div>
                )}

                {/* MAIN LIST */}
                {viewMode === 'list' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-white p-6 rounded-lg shadow"><p className="text-gray-600">Pending Review</p><p className="text-3xl font-bold">{applications.length}</p></div>
                            <div className="bg-white p-6 rounded-lg shadow"><p className="text-gray-600">Agreement Signed</p><p className="text-3xl font-bold text-green-600">{agreementApps.length}</p></div>
                            <div className="bg-white p-6 rounded-lg shadow"><p className="text-gray-600">Total</p><p className="text-3xl font-bold">{applications.length + agreementApps.length}</p></div>
                        </div>
                        <div className="flex gap-2 border-b bg-white rounded-t-lg px-4">
                            <button onClick={() => setActiveTab('pending')} className={`px-6 py-3 font-medium text-sm border-b-2 transition ${activeTab === 'pending' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500'}`}>
                                Pending Review ({applications.length})
                            </button>
                            <button onClick={() => setActiveTab('agreement')} className={`px-6 py-3 font-medium text-sm border-b-2 transition ${activeTab === 'agreement' ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500'}`}>
                                Agreement Signed ({agreementApps.length})
                            </button>
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow">
                            <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full px-4 py-3 border rounded-lg" />
                        </div>
                        {activeTab === 'pending' && (
                            <div className="space-y-3">
                                {applications.filter(a => [a.full_name,a.email,a.business_name].some(v => v?.toLowerCase().includes(searchTerm.toLowerCase()))).map(app => (
                                    <div key={app.id} className="bg-white p-4 rounded-lg shadow flex justify-between items-center">
                                        <div>
                                            <h3 className="font-semibold">{app.business_name}</h3>
                                            <p className="text-sm text-gray-600">{app.full_name} • {app.email}</p>
                                            {isPGProduct(app) && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full ml-1">PG</span>}
                                        </div>
                                        <button onClick={() => openReview(app)} className="px-4 py-2 bg-purple-600 text-white rounded-lg">Review</button>
                                    </div>
                                ))}
                                {applications.length === 0 && <div className="text-center p-12 bg-white rounded-lg text-gray-500">No pending applications</div>}
                            </div>
                        )}
                        {activeTab === 'agreement' && (
                            <div className="space-y-3">
                                {agreementApps.filter(a => [a.full_name,a.email,a.business_name].some(v => v?.toLowerCase().includes(searchTerm.toLowerCase()))).map(app => (
                                    <div key={app.id} className="bg-white p-4 rounded-lg shadow flex justify-between items-center">
                                        <div>
                                            <h3 className="font-semibold">{app.business_name}</h3>
                                            <p className="text-sm text-gray-600">{app.full_name} • {app.email}</p>
                                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✅ Agreement Signed</span>
                                        </div>
                                        <button onClick={() => { setSelectedApp(app); setNotes(''); setViewMode('final-review'); }} className="px-4 py-2 bg-green-600 text-white rounded-lg flex items-center gap-2">
                                            <FileText className="w-4 h-4" /> Final Review
                                        </button>
                                    </div>
                                ))}
                                {agreementApps.length === 0 && <div className="text-center p-12 bg-white rounded-lg text-gray-500">No agreements signed yet</div>}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
