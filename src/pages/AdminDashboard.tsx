// AdminDashboard.tsx - Production Ready
import { useState, useEffect } from 'react';
import { api } from '@/lib/rest-api';
import { authService } from '@/lib/auth-service';
import { API_BASE_URL } from '@/lib/api-client';
import {
    CheckCircle, XCircle, Clock, Search, Filter, Download,
    Eye, AlertCircle, PlayCircle, FileText, Image as ImageIcon, ExternalLink
} from 'lucide-react';

interface MerchantDocument {
    id: string; document_type: string; file_name: string; file_path: string;
    status: string; uploaded_at: string; verified_at: string | null; rejection_reason: string | null;
}

interface MerchantKYC {
    id: string; video_kyc_completed: boolean; location_captured: boolean;
    latitude: number | null; longitude: number | null;
    video_kyc_file_path: string | null; selfie_file_path: string | null;
    kyc_status: string; completed_at: string | null; verified_at: string | null; rejection_reason: string | null;
}

interface MerchantApplication {
    id: string; full_name: string; email: string; mobile_number: string;
    business_name: string; gst_number: string; aadhaar_number: string; pan_number: string;
    onboarding_status: 'pending' | 'in_progress' | 'submitted' | 'validating' | 'pending_bank_approval' | 'verification_failed' | 'bank_rejected' | 'verified' | 'approved' | 'rejected';
    entity_type: string; created_at: string; updated_at: string;
    submitted_at: string | null; rejection_reason: string | null;
    selected_products?: any; split_payment_config?: string | null;
    merchant_bank_details: { bank_name: string; account_number: string; ifsc_code: string; account_holder_name: string; } | null;
    merchant_documents?: MerchantDocument[];
    merchant_kyc?: MerchantKYC | null;
    merchant_product_selections?: any[];
    merchant_sub_product_selections?: any[];
    // Settlement & Reserve Terms
    rolling_reserve_enabled?: boolean;
    rolling_reserve_percentage?: number | null;
    rolling_reserve_fixed_inr?: number | null;
    settlement_cycle_days?: number;
    settlement_terms_locked?: boolean;
    settlement_config_overridden_by_admin?: boolean;
    settlement_config_overridden_at?: string | null;
    settlement_config_overridden_by?: string | null;
    settlement_config_override_reason?: string | null;
}

// Safe parse — handles string, double-encoded string, or array
function safeParse(val: any): any[] {
    try {
        if (!val) return [];
        if (Array.isArray(val)) return val;
        const once = JSON.parse(val);
        if (Array.isArray(once)) return once;
        if (typeof once === 'string') {
            const twice = JSON.parse(once);
            return Array.isArray(twice) ? twice : [];
        }
        return [];
    } catch { return []; }
}

// Public URL — bucket is public, no signed URL needed
function publicUrl(filePath: string, bucket = 'merchant-documents'): string {
    if (!filePath) return '';
    if (filePath.startsWith('http')) return filePath;
    const clean = filePath.startsWith(bucket + '/') ? filePath.slice(bucket.length + 1) : filePath;
    const data = { publicUrl: `/uploads/${clean}` };
    return data?.publicUrl || '';
}

function StatCard({ title, value, icon, color }: { title: string; value: number; icon: React.ReactNode; color: 'blue'|'yellow'|'purple'|'green'|'red' }) {
    const c = { blue:'bg-blue-100 text-blue-600', yellow:'bg-yellow-100 text-yellow-600', purple:'bg-purple-100 text-purple-600', green:'bg-green-100 text-green-600', red:'bg-red-100 text-red-600' };
    return <div className="bg-white rounded-lg shadow-sm p-6"><div className="flex items-center justify-between"><div><p className="text-sm text-gray-600 mb-1">{title}</p><p className="text-2xl font-bold text-gray-900">{value}</p></div><div className={`p-3 rounded-lg ${c[color]}`}>{icon}</div></div></div>;
}

function DetailItem({ label, value }: { label: string; value: string | React.ReactNode }) {
    return <div><p className="text-sm text-gray-600 mb-1">{label}</p><p className="font-medium text-gray-900">{value}</p></div>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
    return <div><h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div></div>;
}

function DocViewButton({ filePath }: { filePath: string }) {
    return (
        <button onClick={() => { const u = publicUrl(filePath); if (u) window.open(u, '_blank'); else alert('Cannot generate URL'); }}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded" title="View Document">
            <ExternalLink className="w-4 h-4" />
        </button>
    );
}

function ApplicationDetailModal({ application, onClose, onValidate, onReject, onApprove }: {
    application: MerchantApplication; onClose: () => void;
    onValidate: (id: string) => void; onReject: (id: string) => void; onApprove: (id: string) => void;
}) {
    const selfieUrl = publicUrl(application.merchant_kyc?.selfie_file_path || '');
    const videoUrl = publicUrl(application.merchant_kyc?.video_kyc_file_path || '');
    const splitAccounts = safeParse(application.split_payment_config);
    const products = application.merchant_product_selections || [];
    const subProducts = application.merchant_sub_product_selections || [];

    const fmt = (t: string) => t.replace(/_/g,' ').replace(/\b\w/g, l => l.toUpperCase());
    const docIcon = (t: string) => t.includes('video')||t.includes('selfie') ? <ImageIcon className="w-4 h-4"/> : <FileText className="w-4 h-4"/>;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
                    <h2 className="text-2xl font-bold text-gray-900">Application Details</h2>
                    <span className={`mt-2 inline-block px-3 py-1 rounded-full text-sm font-medium ${
                        application.onboarding_status==='approved'?'bg-green-100 text-green-800':
                        application.onboarding_status==='rejected'?'bg-red-100 text-red-800':
                        application.onboarding_status==='submitted'?'bg-yellow-100 text-yellow-800':'bg-gray-100 text-gray-800'}`}>
                        {application.onboarding_status.replace(/_/g,' ').toUpperCase()}
                    </span>
                </div>

                <div className="p-6 space-y-6">
                    <DetailSection title="Personal Information">
                        <DetailItem label="Full Name" value={application.full_name}/>
                        <DetailItem label="Email" value={application.email}/>
                        <DetailItem label="Mobile" value={application.mobile_number}/>
                        <DetailItem label="PAN Number" value={application.pan_number||'N/A'}/>
                        <DetailItem label="Aadhaar" value={application.aadhaar_number||'N/A'}/>
                    </DetailSection>

                    <DetailSection title="Business Information">
                        <DetailItem label="Business Name" value={application.business_name}/>
                        <DetailItem label="Entity Type" value={application.entity_type||'N/A'}/>
                        <DetailItem label="GST Number" value={application.gst_number||'N/A'}/>
                    </DetailSection>

                    <DetailSection title="Banking Details">
                        <DetailItem label="Bank Name" value={application.merchant_bank_details?.bank_name||'N/A'}/>
                        <DetailItem label="Account Holder" value={application.merchant_bank_details?.account_holder_name||'N/A'}/>
                        <DetailItem label="Account Number" value={application.merchant_bank_details?.account_number||'N/A'}/>
                        <DetailItem label="IFSC Code" value={application.merchant_bank_details?.ifsc_code||'N/A'}/>
                    </DetailSection>

                    <DetailSection title="Settlement & Reserve Terms">
                        <DetailItem label="Rolling Reserve" value={application.rolling_reserve_enabled ? 'Enabled' : 'Disabled'}/>
                        {application.rolling_reserve_enabled && (
                            <>
                                <DetailItem label="Reserve Percentage" value={application.rolling_reserve_percentage ? `${application.rolling_reserve_percentage}%` : 'N/A'}/>
                                <DetailItem label="Fixed Reserve Amount" value={application.rolling_reserve_fixed_inr ? `₹${application.rolling_reserve_fixed_inr.toLocaleString()}` : 'N/A'}/>
                            </>
                        )}
                        <DetailItem label="Settlement Cycle" value={`T+${application.settlement_cycle_days ?? 1}`}/>
                        <DetailItem label="Terms Locked" value={application.settlement_terms_locked ? '🔒 Yes (settlement processed)' : 'No'}/>
                        {application.settlement_config_overridden_by_admin && (
                            <DetailItem label="Admin Override" value={
                                <span className="text-amber-700">
                                    Active — {application.settlement_config_override_reason || 'No reason provided'}
                                    {application.settlement_config_overridden_at && ` (${new Date(application.settlement_config_overridden_at).toLocaleString()})`}
                                </span>
                            }/>
                        )}
                    </DetailSection>

                    {/* Selected Products */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Selected Products</h3>
                        {products.length > 0 ? (
                            <div className="space-y-2">
                                {products.map((p: any, i: number) => (
                                    <div key={i} className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                                        <div className="flex justify-between items-center">
                                            <span className="font-medium text-gray-900">{p.product_name}</span>
                                            <span className="text-sm text-gray-500 capitalize">{p.pricing_type} — ₹{p.price}</span>
                                        </div>
                                        {p.product_code === 'PROD_004' && subProducts.filter((s:any) => s.parent_product_code==='PROD_004').length > 0 && (
                                            <div className="mt-2 ml-4 space-y-1">
                                                {subProducts.filter((s:any) => s.parent_product_code==='PROD_004').map((s:any, si:number) => (
                                                    <div key={si} className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg">
                                                        <span className="text-blue-400">↳</span>
                                                        <span className="font-medium">{s.sub_product_name||s.sub_product_code}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : <p className="text-sm text-gray-400 italic">No products found</p>}
                    </div>

                    {/* Split Payment */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">🔀 Split Payment Configuration</h3>
                        {splitAccounts.length > 0 ? (
                            <div className="overflow-x-auto rounded-lg border border-gray-200">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-green-50">
                                        <tr>{['Label','Account Holder','Bank','Branch','Account No','IFSC','Payout %','Deduction'].map(h=><th key={h} className="px-3 py-2 text-left font-semibold border-b text-xs text-gray-700">{h}</th>)}</tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {splitAccounts.map((a:any,i:number)=>(
                                            <tr key={i} className="hover:bg-gray-50">
                                                <td className="px-3 py-2 font-medium">{a.label}</td>
                                                <td className="px-3 py-2">{a.accountHolderName}</td>
                                                <td className="px-3 py-2">{a.bankName}</td>
                                                <td className="px-3 py-2">{a.branchName}</td>
                                                <td className="px-3 py-2 font-mono">{a.accountNumber}</td>
                                                <td className="px-3 py-2 font-mono">{a.ifscCode}</td>
                                                <td className="px-3 py-2 font-semibold text-green-700">{a.payoutPercentage||'—'}%</td>
                                                <td className="px-3 py-2">{a.isDeductionAccount?'✅ Yes':'No'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-green-50">
                                        <tr>
                                            <td colSpan={6} className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Total:</td>
                                            <td className="px-3 py-2 font-bold text-green-700">{splitAccounts.reduce((s:number,a:any)=>s+(parseFloat(a.payoutPercentage)||0),0).toFixed(1)}%</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        ) : <p className="text-sm text-gray-400 italic">No split configuration found</p>}
                    </div>

                    {/* Documents */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Documents Uploaded</h3>
                        {application.merchant_documents && application.merchant_documents.length > 0 ? (
                            <div className="grid grid-cols-1 gap-3">
                                {application.merchant_documents.map(doc => (
                                    <div key={doc.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                                        <div className="flex items-center gap-3">
                                            {docIcon(doc.document_type)}
                                            <div>
                                                <div className="font-medium text-gray-900">{fmt(doc.document_type)}</div>
                                                <div className="text-sm text-gray-500">{doc.file_name}</div>
                                                <div className="text-xs text-gray-400">Uploaded: {new Date(doc.uploaded_at).toLocaleString()}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-1 text-xs rounded ${doc.status==='verified'?'bg-green-100 text-green-800':doc.status==='rejected'?'bg-red-100 text-red-800':'bg-yellow-100 text-yellow-800'}`}>{doc.status}</span>
                                            <DocViewButton filePath={doc.file_path}/>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : <p className="text-gray-500 italic">No documents uploaded</p>}
                    </div>

                    {/* KYC */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">KYC Status</h3>
                        {application.merchant_kyc ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border border-gray-200 rounded-lg">
                                    <DetailItem label="KYC Status" value={<span className={`px-2 py-1 text-xs rounded ${application.merchant_kyc.kyc_status==='verified'?'bg-green-100 text-green-800':application.merchant_kyc.kyc_status==='rejected'?'bg-red-100 text-red-800':'bg-yellow-100 text-yellow-800'}`}>{application.merchant_kyc.kyc_status.toUpperCase()}</span>}/>
                                    <DetailItem label="Video KYC" value={application.merchant_kyc.video_kyc_completed?'✓ Completed':'✗ Not Completed'}/>
                                    <DetailItem label="Location Captured" value={application.merchant_kyc.location_captured?'✓ Yes':'✗ No'}/>
                                    {application.merchant_kyc.latitude && application.merchant_kyc.longitude && (
                                        <DetailItem label="Location" value={`${application.merchant_kyc.latitude}, ${application.merchant_kyc.longitude}`}/>
                                    )}
                                </div>

                                {/* Selfie */}
                                <div className="p-4 border border-gray-200 rounded-lg">
                                    <p className="text-sm font-semibold text-gray-700 mb-3">📸 KYC Selfie</p>
                                    {application.merchant_kyc.selfie_file_path ? (
                                        selfieUrl ? (
                                            <div className="space-y-2">
                                                <img src={selfieUrl} alt="KYC Selfie" className="max-h-64 rounded-lg border border-gray-200 object-contain"
                                                    onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }}/>
                                                <a href={selfieUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline block">Open image in new tab ↗</a>
                                            </div>
                                        ) : <p className="text-sm text-red-500">Could not generate URL for: {application.merchant_kyc.selfie_file_path}</p>
                                    ) : <p className="text-sm text-gray-400 italic">No selfie captured</p>}
                                </div>

                                {videoUrl && (
                                    <div className="p-4 border border-gray-200 rounded-lg">
                                        <p className="text-sm font-semibold text-gray-700 mb-3">🎥 KYC Video</p>
                                        <video src={videoUrl} controls className="max-h-64 rounded-lg border border-gray-200 w-full"/>
                                    </div>
                                )}
                            </div>
                        ) : <p className="text-gray-500 italic">KYC not initiated</p>}
                    </div>

                    {application.rejection_reason && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                            <h3 className="text-lg font-semibold text-red-900 mb-2">Rejection Reason</h3>
                            <p className="text-red-800">{application.rejection_reason}</p>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-200 flex justify-end gap-4 sticky bottom-0 bg-white">
                    <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Close</button>
                    {application.onboarding_status==='submitted' && (<>
                        <button onClick={()=>{onValidate(application.id);onClose();}} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Validate & Send to Bank</button>
                        <button onClick={()=>{onReject(application.id);onClose();}} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Reject Application</button>
                    </>)}
                    {application.onboarding_status!=='approved' && application.onboarding_status!=='rejected' && (
                        <button onClick={()=>{onApprove(application.id);onClose();}} className="px-4 py-2 border border-green-600 text-green-600 rounded-lg hover:bg-green-50">Manual Override Approve</button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function AdminDashboard() {
    const [applications, setApplications] = useState<MerchantApplication[]>([]);
    const [filteredApps, setFilteredApps] = useState<MerchantApplication[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [selectedApp, setSelectedApp] = useState<MerchantApplication | null>(null);

    const [activeTab, setActiveTab] = useState<'merchants' | 'distributors'>('merchants');
    const [distributors, setDistributors] = useState<any[]>([]);
    const [distSearchTerm, setDistSearchTerm] = useState('');
    const [distLoading, setDistLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [showAgreementModal, setShowAgreementModal] = useState<{ dist: any } | null>(null);
    const [showRejectModal, setShowRejectModal] = useState<{ dist: any } | null>(null);
    const [showCredentialsModal, setShowCredentialsModal] = useState<{ dist: any } | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [credPassword, setCredPassword] = useState('');

    const [showCreateDistModal, setShowCreateDistModal] = useState(false);
    const [newDistributor, setNewDistributor] = useState({ company_name: '', contact_person: '', email: '', mobile_number: '', pan_number: '', bank_account_holder: '', bank_name: '', bank_account_number: '', bank_ifsc: '', address: '', city: '', state: '', pincode: '', default_commission_rate: '', payout_cycle: 'monthly' });
    const [creatingDist, setCreatingDist] = useState(false);
    const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
    const [signedAgreementFile, setSignedAgreementFile] = useState<File | null>(null);
    const [panDocFile, setPanDocFile] = useState<File | null>(null);

    // Validation states
    const [panValidated, setPanValidated] = useState<'unchecked'|'verified'|'invalid'>('unchecked');
    const [panLocked, setPanLocked] = useState(false);
    const [bankValidated, setBankValidated] = useState<'unchecked'|'verified'|'invalid'>('unchecked');
    const [bankLocked, setBankLocked] = useState(false);
    const [bankVerifiedName, setBankVerifiedName] = useState('');
    const [validationMessages, setValidationMessages] = useState({ pan: '', bank: '' });
    const [validationLoading, setValidationLoading] = useState({ pan: false, bank: false });

    useEffect(() => { fetchApplications(); }, []);
    useEffect(() => { filterApplications(); }, [searchTerm, statusFilter, applications]);

    const fetchApplications = async () => {
        try {
            setLoading(true);
            const data = await api.get('/admin/merchants');

            const mapped = (data || []).map(item => ({
                ...item,
                entity_type: item.entity_type || 'individual',
                merchant_bank_details: item.bank_details || null,
                merchant_documents: item.documents || [],
                merchant_kyc: Array.isArray(item.kyc) ? item.kyc[0] : (item.kyc || null),
                merchant_product_selections: safeParse(item.selected_products),
                merchant_sub_product_selections: [] as any[]
            })) as MerchantApplication[];

            setApplications(mapped);

            // Fetch sub-products
            try {
                const catalog = await api.get('/products/catalog');
                if (catalog) setApplications(prev => prev.map(app => ({ ...app })));
            } catch {}
        } catch (e) { console.error('fetchApplications error:', e); }
        finally { setLoading(false); }
    };

    const filterApplications = () => {
        let f = applications;
        if (searchTerm) f = f.filter(a => a.full_name.toLowerCase().includes(searchTerm.toLowerCase()) || a.email.toLowerCase().includes(searchTerm.toLowerCase()) || a.business_name.toLowerCase().includes(searchTerm.toLowerCase()));
        if (statusFilter !== 'all') f = f.filter(a => a.onboarding_status === statusFilter);
        setFilteredApps(f);
    };

    const validateMerchant = async (id: string) => {
        if (!confirm('Validate this merchant?')) return;
        try { await api.post(`/admin/merchants/${id}/validate`); alert('Validation started!'); fetchApplications(); }
        catch (e: any) { alert('Failed: ' + e.message); }
    };

    const rejectMerchant = async (id: string) => {
        const reason = prompt('Rejection reason:');
        if (!reason) return;
        try { await api.post(`/admin/merchants/${id}/reject`, { status:'rejected', reason }); alert('Rejected'); fetchApplications(); }
        catch (e: any) { alert('Failed: ' + e.message); }
    };

    const manualApprove = async (id: string) => {
        if (!confirm('Manually approve?')) return;
        try { await api.post(`/admin/merchants/${id}/approve`); alert('Approved!'); fetchApplications(); }
        catch (e: any) { alert('Failed: ' + e.message); }
    };

    const getStatusBadge = (s: string) => {
        const m: Record<string,string> = { pending:'bg-gray-100 text-gray-800', in_progress:'bg-blue-100 text-blue-800', submitted:'bg-yellow-100 text-yellow-800', validating:'bg-purple-100 text-purple-800', pending_bank_approval:'bg-orange-100 text-orange-800', verified:'bg-green-100 text-green-800', approved:'bg-green-100 text-green-800', rejected:'bg-red-100 text-red-800', bank_rejected:'bg-red-100 text-red-800', verification_failed:'bg-red-100 text-red-800' };
        return <span className={`px-2 py-1 rounded-full text-xs font-medium ${m[s]||'bg-gray-100 text-gray-800'}`}>{s.replace(/_/g,' ').toUpperCase()}</span>;
    };

    const exportToCSV = () => {
        const rows = filteredApps.map(a => [a.full_name,a.email,a.mobile_number,a.business_name,a.onboarding_status,new Date(a.created_at).toLocaleDateString()]);
        const csv = [['Name','Email','Mobile','Business','Status','Date'].join(','), ...rows.map(r=>r.join(','))].join('\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='merchant_applications.csv'; a.click();
    };

    const getDistAgreementBadge = (s: string) => {
        const m: Record<string,string> = { pending:'bg-gray-100 text-gray-600', sent:'bg-blue-100 text-blue-700', uploaded:'bg-amber-100 text-amber-700', approved:'bg-emerald-100 text-emerald-700', rejected:'bg-red-100 text-red-700', credentials_sent:'bg-purple-100 text-purple-700', onboarding_completed:'bg-emerald-100 text-emerald-700' };
        return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${m[s]||'bg-gray-100 text-gray-600'}`}>{s.replace(/_/g,' ').toUpperCase()}</span>;
    };

    const fetchDistributors = async () => {
        try {
            setDistLoading(true);
            const token = authService.getToken();
            const res = await fetch(`${window.location.origin}/api/distributor/onboarding`, {
                headers: { Authorization: `Bearer ${token ?.access_token}` }
            });
            const result = await res.json();
            if (result.success) setDistributors(result.data);
        } catch (e) { console.error('fetchDistributors error:', e); }
        finally { setDistLoading(false); }
    };

    useEffect(() => { if (activeTab === 'distributors') fetchDistributors(); }, [activeTab]);

    const uploadAgreementFile = async (distributorId: string, file: File): Promise<string | null> => {
        try {
            const result = await api.uploadFile(file);
            return result?.url || null;
        } catch (e: any) { alert('Upload failed: ' + e.message); return null; }
    };

    const handleSendAgreement = async (distributorId: string, file: File) => {
        const reader = new FileReader();
        reader.onload = async () => {
            const base64 = (reader.result as string)?.split(',')[1];
            if (!base64) { alert('Failed to read file'); return; }
            setActionLoading(true);
            try {
                const token = authService.getToken();
                const res = await fetch(`${window.location.origin}/api/distributor/onboarding/agreement/send`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ distributorId, fileBase64: base64, fileName: file.name }),
                });
                const result = await res.json();
                if (result.success) { alert('Agreement sent!'); setShowAgreementModal(null); fetchDistributors(); }
                else alert(result.error?.message || 'Failed');
            } finally { setActionLoading(false); }
        };
        reader.readAsDataURL(file);
    };

    const handleApproveAgreement = async (distributorId: string) => {
        if (!confirm('Approve this agreement?')) return;
        setActionLoading(true);
        try {
            const token = authService.getToken();
            const res = await fetch(`${window.location.origin}/api/distributor/onboarding/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?.access_token}` },
                body: JSON.stringify({ distributorId }),
            });
            const result = await res.json();
            if (result.success) { alert('Approved!'); fetchDistributors(); }
            else alert(result.error?.message || 'Failed');
        } finally { setActionLoading(false); }
    };

    const handleRejectAgreement = async (distributorId: string) => {
        if (!rejectReason.trim()) { alert('Please enter a rejection reason'); return; }
        setActionLoading(true);
        try {
            const token = authService.getToken();
            const res = await fetch(`${window.location.origin}/api/distributor/onboarding/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?.access_token}` },
                body: JSON.stringify({ distributorId, reason: rejectReason.trim() }),
            });
            const result = await res.json();
            if (result.success) { alert('Rejected'); setShowRejectModal(null); setRejectReason(''); fetchDistributors(); }
            else alert(result.error?.message || 'Failed');
        } finally { setActionLoading(false); }
    };

    const handleSendCredentials = async (distributorId: string) => {
        if (!credPassword || credPassword.length < 6) { alert('Password must be at least 6 characters'); return; }
        setActionLoading(true);
        try {
            const token = authService.getToken();
            const res = await fetch(`${window.location.origin}/api/distributor/onboarding/credentials/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?.access_token}` },
                body: JSON.stringify({ distributorId, password: credPassword }),
            });
            const result = await res.json();
            if (result.success) { alert('Credentials sent!'); setShowCredentialsModal(null); setCredPassword(''); fetchDistributors(); }
            else alert(result.error?.message || 'Failed');
        } finally { setActionLoading(false); }
    };

    const viewSignedAgreement = async (distributorId: string) => {
        const token = authService.getToken();
        const res = await fetch(`${window.location.origin}/api/distributor/onboarding/signed/${distributorId}`, {
            headers: { Authorization: `Bearer ${token ?.access_token}` }
        });
        const result = await res.json();
        if (result.success && result.data.signedUrl) window.open(result.data.signedUrl, '_blank');
        else alert(result.error?.message || 'No signed agreement');
    };

    const handleApproveKYC = async (distributorId: string) => {
        if (!confirm('Approve KYC?')) return;
        const token = authService.getToken();
        const res = await fetch(`${window.location.origin}/api/distributor/onboarding/kyc/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?.access_token}` },
            body: JSON.stringify({ distributorId }),
        });
        const result = await res.json();
        if (result.success) { alert('KYC Approved!'); fetchDistributors(); }
        else alert(result.error?.message || 'Failed');
    };

    const handleRejectKYC = async (distributorId: string) => {
        if (!confirm('Reject KYC?')) return;
        const token = authService.getToken();
        const res = await fetch(`${window.location.origin}/api/distributor/onboarding/kyc/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?.access_token}` },
            body: JSON.stringify({ distributorId }),
        });
        const result = await res.json();
        if (result.success) { alert('KYC Rejected'); fetchDistributors(); }
        else alert(result.error?.message || 'Failed');
    };

    const handleValidatePAN = () => {
        const pan = newDistributor.pan_number?.toUpperCase();
        if (!pan || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) {
            setPanValidated('invalid');
            setValidationMessages(prev => ({...prev, pan: !pan ? 'Enter a PAN number' : 'Invalid PAN format'}));
            return;
        }
        setPanValidated('verified'); setPanLocked(true);
        setValidationMessages(prev => ({...prev, pan: ''}));
    };

    const handleValidateBank = async () => {
        const { bank_account_holder, bank_account_number, bank_ifsc } = newDistributor;
        if (!bank_account_holder || !bank_account_number || !bank_ifsc) {
            setValidationMessages(prev => ({...prev, bank: 'Fill Account Holder, Account Number, and IFSC first'}));
            return;
        }
        setValidationLoading(prev => ({...prev, bank: true}));
        setValidationMessages(prev => ({...prev, bank: ''}));
        try {
            const bankApiUrl = import.meta.env.VITE_BANK_API_URL || 'https://transbankuat.sabbpe.com';

            // Generate IST timestamp (Transbank requires IST)
            const now = new Date();
            const istOffset = 5.5 * 60 * 60 * 1000;
            const ist = new Date(now.getTime() + istOffset);
            const transactionTimestamp = ist.toISOString().replace('T', ' ').substring(0, 19);

            // Step 1: Generate Transbank token
            const tokenRes = await fetch(`${bankApiUrl}/api/v1/token/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_Id: import.meta.env.VITE_TRANSBANK_CLIENT_ID,
                    transaction_timestamp: transactionTimestamp,
                    processor: import.meta.env.VITE_TRANSBANK_PROCESSOR || 'TRANSBANK',
                }),
            });
            const tokenJson = await tokenRes.json();
            const token = tokenJson?.token;
            if (!token) {
                throw new Error(tokenJson?.message || 'Failed to generate token');
            }

            // Step 2: Generate requestId and trackingRefNo
            const requestId = crypto.randomUUID();
            const trackingRefNo = requestId.split('-')[0];

            // Step 3: Validate bank account
            const res = await fetch(`${bankApiUrl}/api/bank-account-validation`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    requestId,
                    custName: bank_account_holder,
                    custIfsc: bank_ifsc,
                    custAcctNo: bank_account_number,
                    trackingRefNo,
                    txnType: 'IMPS',
                }),
            });
            const result = await res.json();
            console.log('Transbank validation response:', result);

            // Parse Transbank response (acValidationStatus may be at top level or inside data)
            const acValidationStatus = result.acValidationStatus || result.data?.acValidationStatus;
            const successStatuses = ['ACCOUNT_VALID', 'VALID', 'VALIDATED', 'SUCCESS', 'ACCOUNT_VERIFIED'];
            const isValid = acValidationStatus
                ? successStatuses.includes(String(acValidationStatus).toUpperCase())
                : false;

            if (isValid) {
                setBankValidated('verified');
                setBankLocked(true);
                setBankVerifiedName(result.nameAtBank || result.data?.nameAtBank || bank_account_holder);
                setValidationMessages(prev => ({...prev, bank: ''}));
            } else {
                setBankValidated('invalid');
                const errMsg = (result.message || result.data?.message) && (result.message || result.data?.message) !== 'SUCCESS' ? (result.message || result.data?.message) : 'Bank account validation failed';
                setValidationMessages(prev => ({...prev, bank: errMsg}));
            }
        } catch (error) {
            setBankValidated('invalid');
            setValidationMessages(prev => ({...prev, bank: error instanceof Error ? error.message : 'Bank validation API unavailable'}));
        }
        setValidationLoading(prev => ({...prev, bank: false}));
    };

    const resetPanValidation = () => { setPanValidated('unchecked'); setPanLocked(false); setValidationMessages(prev => ({...prev, pan: ''})); };
    const resetBankValidation = () => { setBankValidated('unchecked'); setBankLocked(false); setBankVerifiedName(''); setValidationMessages(prev => ({...prev, bank: ''})); };
    const allValidated = panValidated === 'verified' && bankValidated === 'verified' && !!signedAgreementFile;

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = (reader.result as string)?.split(',')[1];
                if (base64) resolve(base64);
                else reject(new Error('Failed to read file'));
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const resetCreateDistForm = () => {
        setNewDistributor({ company_name: '', contact_person: '', email: '', mobile_number: '', pan_number: '', bank_account_holder: '', bank_name: '', bank_account_number: '', bank_ifsc: '', address: '', city: '', state: '', pincode: '', default_commission_rate: '', payout_cycle: 'monthly' });
        setProfilePhotoFile(null);
        setSignedAgreementFile(null);
        setPanDocFile(null);
        resetPanValidation();
        resetBankValidation();
    };

    const handleCreateDistributor = async () => {
        const { company_name, contact_person, email, mobile_number } = newDistributor;
        if (!company_name || !contact_person || !email || !mobile_number) {
            alert('All fields are required');
            return;
        }
        if (!signedAgreementFile) {
            alert('Signed agreement copy is required');
            return;
        }
        setCreatingDist(true);
        try {
            const token = authService.getToken();
            const payload: any = { ...newDistributor };

            if (profilePhotoFile) {
                payload.profilePhotoBase64 = await fileToBase64(profilePhotoFile);
                payload.profilePhotoFileName = profilePhotoFile.name;
            }
            if (panDocFile) {
                payload.panFileBase64 = await fileToBase64(panDocFile);
                payload.panDocumentFilename = panDocFile.name;
            }
            payload.signedAgreementBase64 = await fileToBase64(signedAgreementFile);
            payload.signedAgreementFileName = signedAgreementFile.name;

            const res = await fetch(`${window.location.origin}/api/distributor/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?.access_token}` },
                body: JSON.stringify(payload),
            });
            const result = await res.json();
            if (result.success) {
                alert('Distributor created successfully! Now send credentials.');
                setShowCreateDistModal(false);
                resetCreateDistForm();
                fetchDistributors();
                // Since agreement is pre-approved, immediately prompt admin to send credentials
                setShowCredentialsModal({ dist: result.data });
            } else {
                alert(result.error?.message || 'Failed to create distributor');
            }
        } catch (e) {
            alert('Failed to create distributor');
        } finally {
            setCreatingDist(false);
        }
    };

    if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <div className="flex items-center gap-4 border-b border-gray-200 pb-4 mb-6">
                        <button onClick={()=>setActiveTab('merchants')} className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-all ${activeTab==='merchants'?'bg-blue-600 text-white shadow-sm':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Merchant Applications</button>
                        <button onClick={()=>setActiveTab('distributors')} className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-all ${activeTab==='distributors'?'bg-blue-600 text-white shadow-sm':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Distributor Onboarding</button>
                    </div>
                </div>

                {activeTab === 'merchants' && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
                            <StatCard title="Total" value={applications.length} icon={<AlertCircle className="w-6 h-6"/>} color="blue"/>
                            <StatCard title="Submitted" value={applications.filter(a=>a.onboarding_status==='submitted').length} icon={<Clock className="w-6 h-6"/>} color="yellow"/>
                            <StatCard title="Validating" value={applications.filter(a=>a.onboarding_status==='validating'||a.onboarding_status==='pending_bank_approval').length} icon={<PlayCircle className="w-6 h-6"/>} color="purple"/>
                            <StatCard title="Approved" value={applications.filter(a=>a.onboarding_status==='approved'||a.onboarding_status==='verified').length} icon={<CheckCircle className="w-6 h-6"/>} color="green"/>
                            <StatCard title="Rejected" value={applications.filter(a=>a.onboarding_status==='rejected'||a.onboarding_status==='bank_rejected').length} icon={<XCircle className="w-6 h-6"/>} color="red"/>
                        </div>

                        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5"/><input type="text" placeholder="Search..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"/></div>
                                <div className="relative"><Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5"/>
                                    <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg appearance-none">
                                        <option value="all">All Status</option>
                                        <option value="pending">Pending</option><option value="in_progress">In Progress</option>
                                        <option value="submitted">Submitted</option><option value="validating">Validating</option>
                                        <option value="pending_bank_approval">Pending Bank Approval</option>
                                        <option value="verified">Verified</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
                                    </select>
                                </div>
                                <button onClick={exportToCSV} className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Download className="w-5 h-5"/> Export CSV</button>
                            </div>
                        </div>

                        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>{['Merchant Details','Business Info','Status','Applied On','Actions'].map(h=><th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}</tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {filteredApps.map(app => (
                                        <tr key={app.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4"><div className="font-medium text-gray-900">{app.full_name}</div><div className="text-sm text-gray-500">{app.email}</div><div className="text-sm text-gray-500">{app.mobile_number}</div></td>
                                            <td className="px-6 py-4"><div className="font-medium text-gray-900">{app.business_name}</div><div className="text-sm text-gray-500">GST: {app.gst_number||'N/A'}</div></td>
                                            <td className="px-6 py-4">{getStatusBadge(app.onboarding_status)}</td>
                                            <td className="px-6 py-4 text-sm text-gray-500">{new Date(app.created_at).toLocaleDateString()}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <button onClick={()=>setSelectedApp(app)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Eye className="w-5 h-5"/></button>
                                                    {app.onboarding_status==='submitted' && (<><button onClick={()=>validateMerchant(app.id)} className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700">Validate</button><button onClick={()=>rejectMerchant(app.id)} className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700">Reject</button></>)}
                                                    {(app.onboarding_status==='validating'||app.onboarding_status==='pending_bank_approval') && <span className="px-3 py-1 text-sm text-purple-700 bg-purple-50 rounded">Processing...</span>}
                                                    {app.onboarding_status!=='approved' && app.onboarding_status!=='rejected' && <button onClick={()=>manualApprove(app.id)} className="px-3 py-1 text-sm border border-green-600 text-green-600 rounded hover:bg-green-50">Override</button>}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {selectedApp && <ApplicationDetailModal application={selectedApp} onClose={()=>setSelectedApp(null)} onValidate={validateMerchant} onReject={rejectMerchant} onApprove={manualApprove}/>}
                    </>
                )}

                {activeTab === 'distributors' && (
                    <>
                        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <h2 className="text-2xl font-bold text-gray-900">Distributor Onboarding</h2>
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                    <input type="text" placeholder="Search distributors..." value={distSearchTerm} onChange={e=>setDistSearchTerm(e.target.value)} className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64" />
                                </div>
                                <button onClick={() => setShowCreateDistModal(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium shadow-sm">+ Create Distributor</button>
                            </div>
                        </div>

                        {distLoading ? (
                            <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div></div>
                        ) : distributors.length === 0 ? (
                            <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-100">
                                <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                                <p className="text-gray-400 text-lg font-medium">No distributors found</p>
                                <p className="text-gray-400 text-sm mt-1">Create your first distributor to get started</p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
                                                {['Company','Contact','Email','Agreement','KYC','Sent','Uploaded','Actions'].map(h=><th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {distributors
                                                .filter((dist: any) =>
                                                    !distSearchTerm ||
                                                    dist.company_name?.toLowerCase().includes(distSearchTerm.toLowerCase()) ||
                                                    dist.contact_person?.toLowerCase().includes(distSearchTerm.toLowerCase()) ||
                                                    dist.email?.toLowerCase().includes(distSearchTerm.toLowerCase())
                                                )
                                                .map((dist: any, idx: number) => (
                                            <tr key={dist.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/40 transition-colors`}>
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                                                            {(dist.company_name||'?').charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="font-medium text-gray-900 text-sm">{dist.company_name}</div>
                                                            {dist.default_commission_rate && <div className="text-xs text-gray-400">{dist.default_commission_rate}% commission</div>}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <div className="text-sm font-medium text-gray-800">{dist.contact_person || '-'}</div>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <div className="text-sm text-gray-500 max-w-[180px] truncate" title={dist.email}>{dist.email}</div>
                                                </td>
                                                <td className="px-5 py-4">{getDistAgreementBadge(dist.agreement_status)}</td>
                                                <td className="px-5 py-4">
                                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                                                        dist.kyc_status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                                                        dist.kyc_status === 'submitted' ? 'bg-amber-100 text-amber-700' :
                                                        dist.kyc_status === 'rejected' ? 'bg-red-100 text-red-700' :
                                                        'bg-gray-100 text-gray-500'
                                                    }`}>{(dist.kyc_status || 'pending').replace(/_/g,' ').toUpperCase()}</span>
                                                    {dist.kyc_status === 'submitted' && (
                                                        <div className="flex gap-1.5 mt-2">
                                                            <button onClick={()=>handleApproveKYC(dist.id)} disabled={actionLoading} className="px-2.5 py-1 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors disabled:opacity-50 shadow-sm">Approve</button>
                                                            <button onClick={()=>handleRejectKYC(dist.id)} disabled={actionLoading} className="px-2.5 py-1 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm">Reject</button>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-5 py-4 text-sm text-gray-500 whitespace-nowrap">{dist.agreement_sent_at ? new Date(dist.agreement_sent_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : <span className="text-gray-300">—</span>}</td>
                                                <td className="px-5 py-4 text-sm text-gray-500 whitespace-nowrap">{dist.agreement_uploaded_at ? new Date(dist.agreement_uploaded_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : <span className="text-gray-300">—</span>}</td>
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center gap-1.5 flex-wrap min-w-[140px]">
                                                        {(dist.agreement_status === 'pending' || dist.agreement_status === 'rejected') && (
                                                            <button onClick={()=>setShowAgreementModal({ dist })} disabled={actionLoading} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm">Send Agreement</button>
                                                        )}
                                                        {dist.agreement_status === 'uploaded' && (
                                                            <>
                                                                <button onClick={()=>viewSignedAgreement(dist.id)} disabled={actionLoading} className="px-3 py-1.5 text-xs font-medium border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50 transition-colors disabled:opacity-50">View</button>
                                                                <button onClick={()=>handleApproveAgreement(dist.id)} disabled={actionLoading} className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors disabled:opacity-50 shadow-sm">Approve</button>
                                                                <button onClick={()=>{ setShowRejectModal({ dist }); setRejectReason(''); }} disabled={actionLoading} className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm">Reject</button>
                                                            </>
                                                        )}
                                                        {dist.agreement_status === 'approved' && (
                                                            <button onClick={()=>setShowCredentialsModal({ dist })} disabled={actionLoading} className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50 shadow-sm">Send Credentials</button>
                                                        )}
                                                        {dist.agreement_status === 'credentials_sent' && <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 rounded-md border border-purple-200">Credentials Sent</span>}
                                                        {dist.agreement_status === 'onboarding_completed' && <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-md border border-emerald-200">Completed</span>}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="bg-gray-50 px-5 py-3 border-t border-gray-100 text-sm text-gray-500">
                                    Showing {distributors.filter((d:any) => !distSearchTerm || d.company_name?.toLowerCase().includes(distSearchTerm.toLowerCase())).length} of {distributors.length} distributors
                                </div>
                            </div>
                        )}

                        {/* Send Agreement Modal */}
                        {showAgreementModal && (
                            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                                <div className="bg-white rounded-lg max-w-lg w-full p-6">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Send Agreement</h3>
                                    <p className="text-sm text-gray-600 mb-4">Upload the agreement PDF for <strong>{showAgreementModal.dist.company_name}</strong></p>
                                    <input type="file" accept=".pdf" onChange={e=>{ if (e.target.files?.[0]) { const f=e.target.files[0]; handleSendAgreement(showAgreementModal.dist.id, f); } }} disabled={actionLoading} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                                    {actionLoading && <p className="text-sm text-blue-600 mt-2">Uploading and sending...</p>}
                                    <button onClick={()=>{ if (!actionLoading) setShowAgreementModal(null); }} className="mt-4 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">Cancel</button>
                                </div>
                            </div>
                        )}

                        {/* Reject Modal */}
                        {showRejectModal && (
                            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                                <div className="bg-white rounded-lg max-w-lg w-full p-6">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Reject Agreement</h3>
                                    <p className="text-sm text-gray-600 mb-4">Reject agreement for <strong>{showRejectModal.dist.company_name}</strong></p>
                                    <textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} placeholder="Reason for rejection" rows={3} disabled={actionLoading} className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"/>
                                    <div className="flex justify-end gap-2 mt-4">
                                        <button onClick={()=>{ setShowRejectModal(null); setRejectReason(''); }} disabled={actionLoading} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">Cancel</button>
                                        <button onClick={()=>handleRejectAgreement(showRejectModal.dist.id)} disabled={actionLoading || !rejectReason.trim()} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm">Reject</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Send Credentials Modal */}
                        {showCredentialsModal && (
                            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                                <div className="bg-white rounded-lg max-w-lg w-full p-6">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Send Credentials</h3>
                                    <p className="text-sm text-gray-600 mb-4">Set password for <strong>{showCredentialsModal.dist.company_name}</strong> ({showCredentialsModal.dist.email})</p>
                                    <input type="text" value={credPassword} onChange={e=>setCredPassword(e.target.value)} placeholder="Enter password (min 6 chars)" disabled={actionLoading} className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"/>
                                    <div className="flex justify-end gap-2 mt-4">
                                        <button onClick={()=>{ setShowCredentialsModal(null); setCredPassword(''); }} disabled={actionLoading} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">Cancel</button>
                                        <button onClick={()=>handleSendCredentials(showCredentialsModal.dist.id)} disabled={actionLoading || credPassword.length < 6} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm">Send</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Create Distributor Modal */}
                        {showCreateDistModal && (
                            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                                <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Create Distributor</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
                                            <input value={newDistributor.company_name} onChange={e=>setNewDistributor(prev=>({...prev,company_name:e.target.value}))} className="w-full border border-gray-300 rounded-lg p-2 text-sm" /></div>
                                        <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Contact Person *</label>
                                            <input value={newDistributor.contact_person} onChange={e=>setNewDistributor(prev=>({...prev,contact_person:e.target.value}))} className="w-full border border-gray-300 rounded-lg p-2 text-sm" /></div>
                                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                                            <input type="email" value={newDistributor.email} onChange={e=>setNewDistributor(prev=>({...prev,email:e.target.value}))} className="w-full border border-gray-300 rounded-lg p-2 text-sm" /></div>
                                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Mobile *</label>
                                            <input value={newDistributor.mobile_number} onChange={e=>setNewDistributor(prev=>({...prev,mobile_number:e.target.value}))} className="w-full border border-gray-300 rounded-lg p-2 text-sm" /></div>

                                        {/* Profile Photo */}
                                        <div className="col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Profile Photo</label>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={e => setProfilePhotoFile(e.target.files?.[0] || null)}
                                                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                            />
                                            {profilePhotoFile && <p className="text-xs text-green-600 mt-1">Selected: {profilePhotoFile.name}</p>}
                                        </div>

                                        {/* PAN */}
                                        <div className="col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">PAN Number</label>
                                            <div className="flex gap-2 items-start">
                                                <input value={newDistributor.pan_number} onChange={e=>{ setNewDistributor(prev=>({...prev,pan_number:e.target.value.toUpperCase()})); if (panLocked) resetPanValidation(); }} disabled={panLocked} className="flex-1 border border-gray-300 rounded-lg p-2 text-sm uppercase disabled:bg-gray-100 disabled:cursor-not-allowed" />
                                                {!panLocked ? (
                                                    <button onClick={handleValidatePAN} className="shrink-0 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm whitespace-nowrap">Validate PAN</button>
                                                ) : (
                                                    <button onClick={resetPanValidation} className="shrink-0 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">Edit</button>
                                                )}
                                            </div>
                                            {panValidated === 'verified' && <p className="text-xs text-green-600 mt-1">✅ PAN Verified</p>}
                                            {panValidated === 'invalid' && <p className="text-xs text-red-600 mt-1">❌ {validationMessages.pan}</p>}
                                        </div>
                                        {/* PAN Document Upload */}
                                        <div className="col-span-2 border rounded-lg p-3 bg-gray-50">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">PAN Card Document</label>
                                            <input
                                                type="file"
                                                accept="image/jpeg,image/png,application/pdf"
                                                onChange={e => setPanDocFile(e.target.files?.[0] || null)}
                                                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                            />
                                            {panDocFile && <p className="text-xs text-green-600 mt-1">Selected: {panDocFile.name}</p>}
                                        </div>

                                        <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                                            <input value={newDistributor.address} onChange={e=>setNewDistributor(prev=>({...prev,address:e.target.value}))} className="w-full border border-gray-300 rounded-lg p-2 text-sm" /></div>
                                        <div><label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                                            <input value={newDistributor.city} onChange={e=>setNewDistributor(prev=>({...prev,city:e.target.value}))} className="w-full border border-gray-300 rounded-lg p-2 text-sm" /></div>
                                        <div><label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                                            <input value={newDistributor.state} onChange={e=>setNewDistributor(prev=>({...prev,state:e.target.value}))} className="w-full border border-gray-300 rounded-lg p-2 text-sm" /></div>
                                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Pincode</label>
                                            <input value={newDistributor.pincode} onChange={e=>setNewDistributor(prev=>({...prev,pincode:e.target.value}))} className="w-full border border-gray-300 rounded-lg p-2 text-sm" /></div>

                                        {/* Bank */}
                                        <div className="col-span-2 border-t pt-4 mt-2"><span className="text-sm font-semibold text-gray-800">Bank Details</span></div>
                                        <div className="col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Account Holder</label>
                                            <div className="flex gap-2">
                                                <input value={newDistributor.bank_account_holder} onChange={e=>{ setNewDistributor(prev=>({...prev,bank_account_holder:e.target.value})); if (bankLocked) resetBankValidation(); }} disabled={bankLocked} className="flex-1 border border-gray-300 rounded-lg p-2 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed" />
                                                {bankLocked && <button onClick={resetBankValidation} className="shrink-0 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm self-start">Edit</button>}
                                            </div>
                                        </div>
                                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                                            <input value={newDistributor.bank_account_number} onChange={e=>{ setNewDistributor(prev=>({...prev,bank_account_number:e.target.value})); if (bankLocked) resetBankValidation(); }} disabled={bankLocked} className="w-full border border-gray-300 rounded-lg p-2 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed" /></div>
                                        <div><label className="block text-sm font-medium text-gray-700 mb-1">IFSC</label>
                                            <input value={newDistributor.bank_ifsc} onChange={e=>{ setNewDistributor(prev=>({...prev,bank_ifsc:e.target.value.toUpperCase()})); if (bankLocked) resetBankValidation(); }} disabled={bankLocked} className="w-full border border-gray-300 rounded-lg p-2 text-sm uppercase disabled:bg-gray-100 disabled:cursor-not-allowed" /></div>
                                        <div className="col-span-2">
                                            {!bankLocked ? (
                                                <button onClick={handleValidateBank} disabled={validationLoading.bank} className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">{validationLoading.bank ? 'Validating...' : 'Validate Bank'}</button>
                                            ) : null}
                                            {bankValidated === 'verified' && <p className="text-xs text-green-600 mt-1">✅ Bank Verified</p>}
                                            {bankValidated === 'invalid' && <p className="text-xs text-red-600 mt-1">❌ {validationMessages.bank}</p>}
                                        </div>

                                        {/* Signed Agreement Copy */}
                                        <div className="col-span-2 border-t pt-4 mt-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Signed Agreement Copy *</label>
                                            <input
                                                type="file"
                                                accept=".pdf"
                                                onChange={e => setSignedAgreementFile(e.target.files?.[0] || null)}
                                                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                            />
                                            {signedAgreementFile ? (
                                                <p className="text-xs text-green-600 mt-1">Selected: {signedAgreementFile.name}</p>
                                            ) : (
                                                <p className="text-xs text-gray-500 mt-1">Upload the signed agreement PDF to approve instantly.</p>
                                            )}
                                        </div>

                                        {/* Commission */}
                                        <div className="col-span-2 border-t pt-4 mt-2"><span className="text-sm font-semibold text-gray-800">Commission & Payout</span></div>
                                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Commission Rate (%)</label>
                                            <input type="number" value={newDistributor.default_commission_rate} onChange={e=>setNewDistributor(prev=>({...prev,default_commission_rate:e.target.value}))} className="w-full border border-gray-300 rounded-lg p-2 text-sm" /></div>
                                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Payout Cycle</label>
                                            <select
                                                value={newDistributor.payout_cycle}
                                                onChange={e=>setNewDistributor(prev=>({...prev,payout_cycle:e.target.value}))}
                                                className="w-full border border-gray-300 rounded-lg p-2 text-sm"
                                            >
                                                <option value="monthly">Monthly</option>
                                                <option value="weekly">Weekly</option>
                                                <option value="biweekly">Fortnightly</option>
                                            </select>
                                    </div>
                                    <div className="flex justify-end gap-2 mt-6 border-t pt-4">
                                        <button onClick={()=>{ setShowCreateDistModal(false); resetCreateDistForm(); }} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">Cancel</button>
                                        <button onClick={handleCreateDistributor} disabled={!allValidated || creatingDist} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm">
                                            {creatingDist ? 'Creating...' : !allValidated ? 'Validate All Fields First' : 'Create Distributor'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    </>
                )}
            </div>
        </div>
    );
}

