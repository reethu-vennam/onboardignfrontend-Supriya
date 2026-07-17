import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Upload, CheckCircle, XCircle, Clock, Loader2, FileText, ArrowLeft } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api-client';

type OnboardingStatus = 'loading' | 'invalid' | 'expired' | 'used' | 'sent' | 'rejected' | 'uploaded' | 'approved' | 'error';
type AgreementData = {
    company_name: string;
    agreement_status: string;
    agreement_rejection_reason: string | null;
    agreement_download_url: string | null;
};

export default function DistributorOnboardingPage() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const [status, setStatus] = useState<OnboardingStatus>('loading');
    const [agreementData, setAgreementData] = useState<AgreementData | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [uploading, setUploading] = useState(false);

    const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;

    const fetchAgreement = useCallback(async () => {
        if (!token) {
            setStatus('invalid');
            setErrorMessage('No onboarding token provided.');
            return;
        }
        try {
            setStatus('loading');
            const res = await fetch(`${backendUrl}/api/distributor/onboarding/agreement/download?token=${encodeURIComponent(token)}`);
            const result = await res.json();

            if (!res.ok || !result.success) {
                const msg = result.error?.message || 'Unknown error';
                if (msg === 'Invalid token') setStatus('invalid');
                else if (msg === 'Token expired') setStatus('expired');
                else if (msg === 'Token already used') setStatus('used');
                else { setStatus('error'); setErrorMessage(msg); }
                return;
            }

            setAgreementData(result.data);
            const s = result.data.agreement_status;
            if (s === 'sent' || s === 'rejected') setStatus(s === 'rejected' ? 'rejected' : 'sent');
            else if (s === 'uploaded') setStatus('uploaded');
            else if (s === 'approved') setStatus('approved');
            else if (s === 'credentials_sent' || s === 'onboarding_completed') setStatus('approved');
            else setStatus('error');
        } catch (e) {
            setStatus('error');
            setErrorMessage('Could not connect to server. Please try again.');
        }
    }, [token, backendUrl]);

    useEffect(() => { fetchAgreement(); }, [fetchAgreement]);

    const handleUpload = async () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.pdf';
        fileInput.onchange = async () => {
            const file = fileInput.files?.[0];
            if (!file) return;

            if (file.size > 10 * 1024 * 1024) {
                alert('File too large. Maximum size is 10MB.');
                return;
            }

            setUploading(true);
            try {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const base64 = (e.target?.result as string)?.split(',')[1];
                    if (!base64) { alert('Failed to read file'); setUploading(false); return; }
                    const res = await fetch(`${backendUrl}/api/distributor/onboarding/agreement/upload-signed?token=${encodeURIComponent(token || '')}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fileBase64: base64, fileName: file.name }),
                    });
                    const result = await res.json();
                    if (result.success) {
                        setStatus('uploaded');
                        alert('Signed agreement uploaded successfully! The admin will review it shortly.');
                    } else {
                        alert(result.error?.message || 'Upload failed');
                    }
                    setUploading(false);
                };
                reader.readAsDataURL(file);
            } catch (e) {
                alert('Upload failed. Please try again.');
                setUploading(false);
            }
        };
        fileInput.click();
    };

    const getDownloadButton = () => {
        if (!agreementData?.agreement_download_url) return null;
        return (
            <a href={agreementData.agreement_download_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-lg font-medium">
                <Download className="h-5 w-5" /> Download Agreement PDF
            </a>
        );
    };

    const getUploadButton = () => (
        <button onClick={handleUpload} disabled={uploading}
            className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-lg font-medium">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            {uploading ? 'Uploading...' : 'Select & Upload Signed PDF'}
        </button>
    );

    if (status === 'loading') {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
                    <p className="text-gray-600 text-lg">Loading onboarding portal...</p>
                </div>
            </div>
        );
    }

    if (status === 'invalid' || status === 'expired' || status === 'used') {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-sm max-w-md w-full p-8 text-center">
                    <XCircle className={`h-16 w-16 mx-auto mb-4 ${status === 'expired' ? 'text-orange-400' : 'text-red-400'}`} />
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                        {status === 'invalid' ? 'Invalid Link' : status === 'expired' ? 'Link Expired' : 'Link Already Used'}
                    </h2>
                    <p className="text-gray-600 mb-6">
                        {status === 'invalid' && 'This onboarding link is not valid. Please contact SabbPe support for assistance.'}
                        {status === 'expired' && 'This onboarding link has expired (valid for 14 days). Please contact the admin to send a new agreement.'}
                        {status === 'used' && 'This onboarding link has already been used. Your signed agreement has been submitted. Please wait for admin review.'}
                    </p>
                    <div className="text-sm text-gray-500">
                        <p>Need help? Email <a href="mailto:onboarding@sabbpe.com" className="text-blue-600 underline">onboarding@sabbpe.com</a></p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-2xl mx-auto px-4 py-12">
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <div className="bg-blue-600 px-8 py-6">
                        <h1 className="text-2xl font-bold text-white">Distributor Onboarding</h1>
                        {agreementData && (
                            <p className="text-blue-100 mt-1">{agreementData.company_name}</p>
                        )}
                    </div>

                    <div className="p-8 space-y-6">
                        {/* Status */}
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 mb-2">Agreement Status</h2>
                            <div className="flex items-center gap-3">
                                {status === 'sent' && (
                                    <div className="flex items-center gap-2 text-blue-600">
                                        <FileText className="h-5 w-5" />
                                        <span>Agreement ready — download, sign, and upload below.</span>
                                    </div>
                                )}
                                {status === 'rejected' && (
                                    <div className="flex items-center gap-2 text-red-600">
                                        <XCircle className="h-5 w-5" />
                                        <div>
                                            <span>Agreement was rejected.</span>
                                            {agreementData?.agreement_rejection_reason && (
                                                <p className="text-sm mt-1">Reason: {agreementData.agreement_rejection_reason}</p>
                                            )}
                                            <p className="text-sm mt-1">Please download the agreement again, make corrections, and re-upload.</p>
                                        </div>
                                    </div>
                                )}
                                {status === 'uploaded' && (
                                    <div className="flex items-center gap-2 text-yellow-600">
                                        <Clock className="h-5 w-5" />
                                        <span>Signed agreement received. Awaiting admin review. You will receive an email with login credentials once approved.</span>
                                    </div>
                                )}
                                {status === 'approved' && (
                                    <div className="flex items-center gap-2 text-green-600">
                                        <CheckCircle className="h-5 w-5" />
                                        <span>Onboarding complete! Check your email for login credentials.</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        {(status === 'sent' || status === 'rejected') && (
                            <div className="space-y-6">
                                <div className="border-t border-gray-200 pt-6">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Step 1: Download Agreement</h3>
                                    {agreementData?.agreement_download_url ? (
                                        getDownloadButton()
                                    ) : (
                                        <p className="text-sm text-gray-400 italic">No agreement file available. Please contact support.</p>
                                    )}
                                </div>

                                <div className="border-t border-gray-200 pt-6">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Step 2: Upload Signed Copy</h3>
                                    <p className="text-sm text-gray-600 mb-4">After signing, upload the PDF here. Maximum file size: 10MB.</p>
                                    {getUploadButton()}
                                </div>
                            </div>
                        )}

                        {status === 'uploaded' && (
                            <div className="border-t border-gray-200 pt-6">
                                <p className="text-gray-600">Thank you! Your signed agreement has been submitted successfully. The admin team will review it and send your login credentials via email.</p>
                            </div>
                        )}

                        {status === 'approved' && (
                            <div className="border-t border-gray-200 pt-6">
                                <p className="text-gray-600">Your distributor account is ready. Please check your email for login instructions.</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-6 text-center">
                    <p className="text-sm text-gray-500">
                        Need help? Contact <a href="mailto:onboarding@sabbpe.com" className="text-blue-600 underline">onboarding@sabbpe.com</a>
                    </p>
                </div>
            </div>
        </div>
    );
}
