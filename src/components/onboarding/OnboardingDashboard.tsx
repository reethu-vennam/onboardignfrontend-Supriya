// export default OnboardingDashboard;
import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UPIQRCode } from '@/components/onboarding/UPIQRCode';
import {
    CheckCircle,
    Clock,
    AlertCircle,
    Phone,
    Mail,
    Upload,
    RefreshCw,
    ArrowLeft,
    PenLine,
    FileText,
    Loader2,
} from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { useMerchantData } from '@/hooks/useMerchantData';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api-client';
import { WhatsAppSupportButton } from './WhatsAppSupportButton';
import { CPVRecorder } from '@/components/onboarding/CPVRecorder';
import { PGAgreement } from '@/components/onboarding/PGAgreement';
import { buildSabbpeOrderReference, fetchIntegrationCost, fetchSabbpeTxnDetails, startSabbpeHostedPayment, storeSabbpeTransactionId } from '@/api/sabbpePaymentApi';
import {
    isSabbpePaymentComplete,
    clearSabbpePaymentCompletion,
    setSabbpePaymentReturnPath,
    setSabbpePaymentMerchantId,
    setSabbpePaymentToken,
} from '@/lib/sabbpePaymentState';

type KYCStatus = 'pending' | 'verified' | 'approved' | 'rejected' | 'bank_rejected' | 'cpv_pending' | 'cpv_verified' | 'agreement_pending' | 'agreement_signed';

export const OnboardingDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { merchantProfile, kycData, loading, refetch } = useMerchantData();
    const { toast } = useToast();
    const [isPaying, setIsPaying] = React.useState(false);
    const [isTxnDetailsOpen, setIsTxnDetailsOpen] = React.useState(false);
    const [isTxnDetailsLoading, setIsTxnDetailsLoading] = React.useState(false);
    const [txnDetailsError, setTxnDetailsError] = React.useState('');
    const [txnDetails, setTxnDetails] = React.useState<Record<string, unknown> | null>(null);
    const [integrationCost, setIntegrationCost] = React.useState<number | null>(null);
    const [integrationCostLoading, setIntegrationCostLoading] = React.useState(false);

    const profilePaymentStatus = React.useMemo(() => {
        const raw = merchantProfile?.txn_details;
        if (!raw) return '';

        try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const status = (parsed as Record<string, unknown>)?.status;
            return typeof status === 'string' ? status.toUpperCase() : '';
        } catch {
            return '';
        }
    }, [merchantProfile?.txn_details]);

    // Consider payment complete only when success is confirmed (not just transaction id creation)
    const paymentCompleted = profilePaymentStatus === 'SUCCESS' || isSabbpePaymentComplete(merchantProfile?.user_id);

    const formatTxnDetailValue = (value: unknown) => {
        if (value === null || value === undefined || value === '') {
            return '-';
        }

        if (Array.isArray(value)) {
            return value.length ? value.map((item) => formatTxnDetailValue(item)).join(', ') : '-';
        }

        if (typeof value === 'object') {
            return JSON.stringify(value, null, 2);
        }

        return String(value);
    };

    const getTxnDetailValue = (...keys: string[]) => {
        if (!txnDetails) {
            return null;
        }

        for (const key of keys) {
            if (key in txnDetails) {
                return txnDetails[key];
            }
        }

        return null;
    };

    const txnSummaryFields = [
        { label: 'Status', keys: ['status'] },
        { label: 'Amount', keys: ['amount'] },
        { label: 'Currency', keys: ['currency'] },
        { label: 'Payment Method', keys: ['payment_method'] },
        { label: 'Gateway', keys: ['gateway'] },
        { label: 'Merchant Order Ref', keys: ['merchant_order_ref'] },
        { label: 'Master Transaction ID', keys: ['master_transaction_id', 'transaction_id', 'txnid'] },
        { label: 'Completed At', keys: ['payment_completed_at'] },
    ] as const;

    const summaryCardValues = txnSummaryFields
        .map((field) => ({ label: field.label, value: getTxnDetailValue(...field.keys) }))
        .filter((field) => field.value !== null && field.value !== undefined && field.value !== '');

    const extraTxnEntries = txnDetails
        ? Object.entries(txnDetails).filter(([key]) => !txnSummaryFields.some((field) => (field.keys as readonly string[]).includes(key)))
        : [];

    const handleSabbpePayment = async () => {
        if (!merchantProfile) {
            toast({ variant: 'destructive', title: 'Merchant data unavailable', description: 'Please refresh and try again.' });
            return;
        }

        if (paymentCompleted || isPaying) {
            return;
        }

        if (!merchantProfile.full_name || !merchantProfile.email || !merchantProfile.mobile_number) {
            toast({ variant: 'destructive', title: 'Missing customer details', description: 'Merchant name, email, or phone is missing.' });
            return;
        }

        setIsPaying(true);
        try {
            setSabbpePaymentReturnPath(`${window.location.pathname}${window.location.search}`);
            // Persist merchant user id in session so payment-result page can mark completion
            setSabbpePaymentMerchantId(String(merchantProfile.user_id || merchantProfile.id));
            if (merchantProfile.user_id) {
                clearSabbpePaymentCompletion(String(merchantProfile.user_id));
            }

            let resolvedIntegrationCost = integrationCost;
            if (resolvedIntegrationCost === null) {
                // Ensure we never fall back to env amount for initiate when backend cost API exists
                resolvedIntegrationCost = await fetchIntegrationCost();
                setIntegrationCost(resolvedIntegrationCost);
            }

            if (!Number.isFinite(resolvedIntegrationCost) || resolvedIntegrationCost <= 0) {
                throw new Error('Invalid integration cost from backend');
            }

            const orderReference = buildSabbpeOrderReference(merchantProfile.id, merchantProfile.user_id);
            const { paymentUrl, sabbpeToken, transactionId } = await startSabbpeHostedPayment(
                { orderReference },
                resolvedIntegrationCost
            );

            if (!transactionId) {
                throw new Error('Missing transaction id from SabbPe token generation');
            }

            await storeSabbpeTransactionId(transactionId);
            setSabbpePaymentToken(sabbpeToken);

            toast({ title: 'Redirecting to payment gateway', description: 'Redirecting to payment gateway...' });
            window.location.href = paymentUrl;
        } catch (error) {
            console.error('SabbPe payment error:', error);
            toast({
                variant: 'destructive',
                title: 'Payment failed',
                description: error instanceof Error ? error.message : 'Unable to start payment. Please try again.',
            });
            setIsPaying(false);
        }
    };

    const handleViewTransactionDetails = async () => {
        const transactionId = merchantProfile?.['Transaction Id'];

        if (!transactionId) {
            toast({
                variant: 'destructive',
                title: 'Transaction not available',
                description: 'No transaction id has been stored for this merchant yet.',
            });
            return;
        }

        try {
            setIsTxnDetailsLoading(true);
            setTxnDetailsError('');

            const { data } = await fetchSabbpeTxnDetails(transactionId);
            const details = data?.data?.txnDetails ?? null;

            setTxnDetails(details);
            setIsTxnDetailsOpen(true);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to fetch transaction details';
            setTxnDetailsError(message);
            setIsTxnDetailsOpen(true);
            toast({
                variant: 'destructive',
                title: 'Unable to load transaction details',
                description: message,
            });
        } finally {
            setIsTxnDetailsLoading(false);
        }
    };

    // Load integration cost on page load so the amount is available before initiating payment
    React.useEffect(() => {
        let mounted = true;
        (async () => {
            setIntegrationCostLoading(true);
            try {
                const cost = await fetchIntegrationCost();
                if (mounted) setIntegrationCost(cost);
            } catch (err) {
                console.warn('Could not fetch integration cost from backend', err);
                // keep integrationCost as null; click handler will retry before initiate
            } finally {
                if (mounted) setIntegrationCostLoading(false);
            }
        })();

        return () => {
            mounted = false;
        };
    }, []);

    const downloadSplitLetter = async () => {
        try {
            const mp = merchantProfile as any;
            const splitConfig = mp?.split_payment_config;
            const splitAccounts = splitConfig
                ? (typeof splitConfig === 'string' ? JSON.parse(splitConfig) : splitConfig)
                : [];

            if (!splitAccounts.length) {
                toast({ variant: 'destructive', title: 'No split config', description: 'Please configure split payment accounts in Product Selection first.' });
                return;
            }

            const { default: jsPDF } = await import('jspdf');
            const pdf = new jsPDF();
            const pageWidth = pdf.internal.pageSize.getWidth();
            const margin = 14;
            let y = 20;

            const addText = (text: string, x: number, fontSize = 10, bold = false) => {
                pdf.setFontSize(fontSize);
                pdf.setFont('helvetica', bold ? 'bold' : 'normal');
                const lines = pdf.splitTextToSize(text, pageWidth - margin * 2);
                pdf.text(lines, x, y);
                y += lines.length * (fontSize * 0.45) + 2;
            };

            // Business name header
            addText(merchantProfile?.business_name || 'Merchant', pageWidth / 2, 14, true);
            pdf.setFontSize(9);
            pdf.text([
                `PAN: ${merchantProfile?.pan_number || 'N/A'}`,
                `GSTIN: ${merchantProfile?.gst_number || 'N/A'}`,
            ].join('   |   '), pageWidth / 2, y, { align: 'center' });
            y += 10;

            // Horizontal line
            pdf.setDrawColor(200, 200, 200);
            pdf.line(margin, y, pageWidth - margin, y);
            y += 8;

            // Address
            addText('To,', margin); y += 1;
            addText('The Settlement Team', margin); y += 1;
            addText('Easebuzz', margin); y += 6;

            addText('Subject: Authorization for Settlement Split Between Multiple Vendors', margin, 10, true);
            y += 4;
            addText('Dear Sir/Madam,', margin); y += 4;

            addText('We hereby authorize and request you to enable and process settlement split for transactions received on our merchant account. The settlement distribution details are as follows:', margin);
            y += 6;

            // Table header
            const cols = [18, 38, 20, 20, 30, 22, 16, 18];
            const headers = ['Label', 'Account Holder', 'Bank', 'Branch', 'Account No', 'IFSC', 'Payout%', 'Deduction'];
            const colX: number[] = [];
            let cx = margin;
            cols.forEach(w => { colX.push(cx); cx += w; });
            const tableWidth = cols.reduce((a, b) => a + b, 0);
            const rowH = 7;

            // Header row
            pdf.setFillColor(34, 197, 94);
            pdf.rect(margin, y, tableWidth, rowH, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(7);
            pdf.setFont('helvetica', 'bold');
            headers.forEach((h, i) => pdf.text(h, colX[i] + 1, y + 5));
            y += rowH;

            // Data rows
            pdf.setTextColor(0, 0, 0);
            pdf.setFont('helvetica', 'normal');
            splitAccounts.forEach((acc: any, idx: number) => {
                if (idx % 2 === 0) {
                    pdf.setFillColor(240, 253, 244);
                    pdf.rect(margin, y, tableWidth, rowH, 'F');
                }
                pdf.setDrawColor(200, 200, 200);
                pdf.rect(margin, y, tableWidth, rowH, 'S');
                const row = [
                    acc.label || '', acc.accountHolderName || '', acc.bankName || '',
                    acc.branchName || '', acc.accountNumber || '', acc.ifscCode || '',
                    `${acc.payoutPercentage}%`, acc.isDeductionAccount ? 'YES' : 'NO'
                ];
                row.forEach((val, i) => {
                    const truncated = String(val).substring(0, Math.floor(cols[i] / 2.2));
                    pdf.text(truncated, colX[i] + 1, y + 5);
                });
                y += rowH;
            });

            // Total row
            pdf.setFillColor(220, 252, 231);
            pdf.rect(margin, y, tableWidth, rowH, 'F');
            pdf.setFont('helvetica', 'bold');
            const total = splitAccounts.reduce((s: number, a: any) => s + (parseFloat(a.payoutPercentage) || 0), 0);
            pdf.text('TOTAL', colX[0] + 1, y + 5);
            pdf.text(`${total.toFixed(1)}%`, colX[6] + 1, y + 5);
            y += rowH + 10;

            pdf.setFont('helvetica', 'normal');
            addText('Kindly process settlements accordingly as per the above instructions until further written notice from our side.', margin);
            y += 4;
            addText('We take full responsibility for the above instructions and confirm that all vendors are legally associated with our business operations.', margin);
            y += 8;

            addText('Thanking You,', margin); y += 4;
            addText(`For ${merchantProfile?.business_name || 'Merchant'}`, margin); y += 10;
            addText('Authorized Signatory', margin, 10, true); y += 1;
            addText(`Name: ${merchantProfile?.full_name || ''}`, margin); y += 1;
            addText(`Date: ${new Date().toLocaleDateString('en-IN')}`, margin);

            pdf.save(`Split_Payment_Authorization_${(merchantProfile?.business_name || 'Merchant').replace(/\s+/g, '_')}.pdf`);
            toast({ title: 'Letter Downloaded', description: 'Split payment authorization letter has been downloaded.' });
        } catch (error) {
            console.error('PDF generation error:', error);
            toast({ variant: 'destructive', title: 'Download failed', description: 'Could not generate the letter. Please try again.' });
        }
    };

    // Debug log
    useEffect(() => {
        console.log('🔍 Dashboard Status Check:', {
            status: merchantProfile?.onboarding_status,
            upi_vpa: merchantProfile?.upi_vpa,
            upi_qr_string: merchantProfile?.upi_qr_string,
            fullProfile: merchantProfile
        });
    }, [merchantProfile]);

    const getStatusInfo = (status: KYCStatus) => {
        switch (status) {
            case 'pending':
                return {
                    icon: Clock,
                    color: 'bg-yellow-500',
                    badgeVariant: 'secondary' as const,
                    title: 'Application Submitted',
                    description: 'Your application is submitted. KYC Under Review by SabbPe',
                    timeframe: 'KYC Review in progress ~5min'
                };
            case 'verified':
                return {
                    icon: RefreshCw,
                    color: 'bg-blue-500',
                    badgeVariant: 'default' as const,
                    title: 'KYC Verified ✅',
                    description: 'Your KYC has been verified. Awaiting bank approval for account activation.',
                    timeframe: 'Bank review in progress ~15min'
                };
            case 'approved':
                return {
                    icon: CheckCircle,
                    color: 'bg-green-500',
                    badgeVariant: 'default' as const,
                    title: 'Account Approved!',
                    description: 'Congratulations! Your merchant account has been approved.',
                    timeframe: 'You can now start accepting payments'
                };
            case 'rejected':
                return {
                    icon: AlertCircle,
                    color: 'bg-red-500',
                    badgeVariant: 'destructive' as const,
                    title: 'Application Rejected',
                    description: 'Your application has been rejected. Please contact support for more details.',
                    timeframe: 'Contact support for clarification'
                };
            case 'bank_rejected':
                return {
                    icon: AlertCircle,
                    color: 'bg-orange-500',
                    badgeVariant: 'destructive' as const,
                    title: 'Bank Verification Failed',
                    description: 'Your application was rejected by the bank. Please resubmit your bank details or contact support.',
                    timeframe: 'Please resubmit your application'
                };
            case 'cpv_pending':
                return {
                    icon: RefreshCw,
                    color: merchantProfile?.cpv_status === 'cpv_rejected' ? 'bg-orange-500' : 'bg-purple-500',
                    badgeVariant: 'default' as const,
                    title: merchantProfile?.cpv_status === 'cpv_rejected'
                        ? '⚠️ CPV Video Rejected — Re-record Required'
                        : 'Shop Verification Required (CPV)',
                    description: merchantProfile?.cpv_status === 'cpv_rejected'
                        ? `Your shop video was rejected. Reason: ${(merchantProfile as any)?.cpv_rejection_reason || 'Please re-record your shop video.'}`
                        : 'Your KYC is verified. Please record a short video of your business premises to proceed.',
                    timeframe: 'Record and submit your shop video below'
                };
            case 'cpv_verified':
                return {
                    icon: RefreshCw,
                    color: 'bg-blue-500',
                    badgeVariant: 'default' as const,
                    title: 'CPV Verified ✅ — Awaiting Bank Approval',
                    description: 'Your shop verification is complete. Your application is now with the bank for final approval.',
                    timeframe: 'Bank review in progress ~15min'
                };
            case 'agreement_pending':
                return {
                    icon: PenLine,
                    color: 'bg-indigo-500',
                    badgeVariant: 'default' as const,
                    title: 'Agreement Ready to Sign',
                    description: 'The bank has set your commercial rates. Please review and sign the Payment Gateway agreement to proceed.',
                    timeframe: 'Sign the agreement below to continue'
                };
            case 'agreement_signed':
                return {
                    icon: RefreshCw,
                    color: 'bg-teal-500',
                    badgeVariant: 'default' as const,
                    title: 'Agreement Signed ✅ — Awaiting Bank Final Approval',
                    description: 'You have signed the agreement. The bank is doing a final review before activating your account.',
                    timeframe: 'Final bank review in progress'
                };
        }
    };

    // Map database status to dashboard status
    const kycStatus: KYCStatus = merchantProfile?.onboarding_status === 'pending_bank_approval' ? 'verified' :
        merchantProfile?.onboarding_status === 'verified' ? 'verified' :
            merchantProfile?.onboarding_status === 'approved' ? 'approved' :
                merchantProfile?.onboarding_status === 'rejected' ? 'rejected' :
                    merchantProfile?.onboarding_status === 'bank_rejected' ? 'bank_rejected' :
                        merchantProfile?.onboarding_status === 'cpv_pending' ? 'cpv_pending' :
                            merchantProfile?.onboarding_status === 'cpv_verified' ? 'cpv_verified' :
                                merchantProfile?.onboarding_status === 'agreement_pending' ? 'agreement_pending' :
                                    merchantProfile?.onboarding_status === 'agreement_signed' ? 'agreement_signed' :
                                        'pending';

    const applicationId = merchantProfile?.application_id || merchantProfile?.id?.slice(-6).toUpperCase() || 'LOADING';

    const statusInfo = getStatusInfo(kycStatus);
    const StatusIcon = statusInfo.icon;

    // Determine verification steps based on actual data
    const verificationSteps = [
        {
            name: 'Document Upload',
            status: (merchantProfile?.pan_number && merchantProfile?.aadhaar_number) ? 'completed' : 'pending'
        },
        {
            name: 'KYC Verification',
            status: (kycData?.videoKycCompleted || kycData?.kycStatus === 'verified' || ['approved', 'pending_bank_approval', 'cpv_pending', 'cpv_verified', 'agreement_pending', 'agreement_signed'].includes(merchantProfile?.onboarding_status || '')) ? 'completed' : 'pending'
        },
        {
            name: 'Bank Verification',
            status: kycStatus === 'approved' ? 'completed' : 'pending'
        },
        {
            name: 'Final Review',
            status: kycStatus === 'approved' ? 'completed' : 'pending'
        },
    ];

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5">
            <div className="container max-w-6xl mx-auto px-4 py-8">
                {/* Back Button */}
                <div className="mb-6">
                    <Button
                        variant="outline"
                        onClick={() => navigate('/')}
                        className="gap-2"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Home
                    </Button>
                </div>

                {/* Header */}
                <div className="text-center mb-8">
                    <Logo size="lg" className="mb-4" />
                    <h1 className="text-3xl font-bold text-foreground mb-2">
                        Merchant Dashboard
                    </h1>
                    <p className="text-muted-foreground">
                        Track your onboarding progress and account status
                    </p>
                </div>

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Main Status Card */}
                    <div className="lg:col-span-2">
                        <Card className="shadow-[var(--shadow-card)]">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle>Application Status</CardTitle>
                                    <Badge variant={statusInfo.badgeVariant}>
                                        {kycStatus.toUpperCase()}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-start gap-4 mb-6">
                                    <div className={`p-3 rounded-full ${statusInfo.color} text-white`}>
                                        <StatusIcon className="h-6 w-6" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-xl font-semibold text-foreground mb-2">
                                            {statusInfo.title}
                                        </h3>
                                        <p className="text-muted-foreground mb-2">
                                            {statusInfo.description}
                                        </p>
                                        <p className="text-sm font-medium text-primary">
                                            {statusInfo.timeframe}
                                        </p>
                                    </div>
                                </div>

                                {/* Application Details */}
                                <div className="grid md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-xl">
                                    <div>
                                        <span className="text-sm text-muted-foreground">Application ID:</span>
                                        <div className="font-mono text-foreground">{applicationId}</div>
                                    </div>
                                    <div>
                                        <span className="text-sm text-muted-foreground">Submitted On:</span>
                                        <div className="text-foreground">
                                            {merchantProfile?.created_at ?
                                                new Date(merchantProfile.created_at).toLocaleDateString() :
                                                new Date().toLocaleDateString()
                                            }
                                        </div>
                                    </div>
                                </div>

                                {paymentCompleted && merchantProfile?.['Transaction Id'] && (
                                    <div className="mt-6 space-y-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <h4 className="font-semibold text-foreground">Transaction Details</h4>
                                                <p className="text-sm text-muted-foreground">
                                                    View the stored JSON for this payment by transaction id.
                                                </p>
                                            </div>
                                            <Button
                                                variant="outline"
                                                onClick={handleViewTransactionDetails}
                                                disabled={isTxnDetailsLoading}
                                                className="gap-2"
                                            >
                                                {isTxnDetailsLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                                                View transaction details
                                            </Button>
                                        </div>

                                        {isTxnDetailsOpen && (
                                            <Card className="border bg-background shadow-sm">
                                                <CardContent className="p-4 space-y-4">
                                                    {txnDetailsError ? (
                                                        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
                                                            {txnDetailsError}
                                                        </div>
                                                    ) : txnDetails ? (
                                                        <div className="space-y-4">
                                                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/60 px-4 py-3">
                                                                <div>
                                                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Payment Summary</p>
                                                                    <p className="text-sm font-semibold text-foreground">
                                                                        {formatTxnDetailValue(getTxnDetailValue('status'))}
                                                                    </p>
                                                                </div>
                                                                <Badge variant="secondary" className="capitalize">
                                                                    {formatTxnDetailValue(getTxnDetailValue('payment_method'))}
                                                                </Badge>
                                                            </div>

                                                            {summaryCardValues.length > 0 && (
                                                                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                                                    {summaryCardValues.map((field) => (
                                                                        <div key={field.label} className="rounded-lg border bg-card p-3">
                                                                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{field.label}</p>
                                                                            <p className="mt-1 break-words text-sm font-semibold text-foreground">
                                                                                {formatTxnDetailValue(field.value)}
                                                                            </p>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {extraTxnEntries.length > 0 && (
                                                                <div className="space-y-3">
                                                                    <p className="text-sm font-semibold text-foreground">Additional Details</p>
                                                                    <div className="grid gap-3 sm:grid-cols-2">
                                                                        {extraTxnEntries.map(([key, value]) => (
                                                                            <div key={key} className="rounded-lg border bg-background p-3">
                                                                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{key.replace(/_/g, ' ')}</p>
                                                                                <p className="mt-1 break-words text-sm text-foreground">
                                                                                    {formatTxnDetailValue(value)}
                                                                                </p>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
                                                            No transaction details available yet.
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        )}
                                    </div>
                                )}

                                {/* Verification Progress */}
                                <div className="mt-6">
                                    <h4 className="font-semibold text-foreground mb-4">Verification Progress</h4>
                                    <div className="space-y-3">
                                        {verificationSteps.map((step, index) => (
                                            <div key={index} className="flex items-center gap-3">
                                                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${step.status === 'completed'
                                                    ? 'bg-primary text-white'
                                                    : 'bg-muted text-muted-foreground'
                                                    }`}>
                                                    {step.status === 'completed' ? (
                                                        <CheckCircle className="h-4 w-4" />
                                                    ) : (
                                                        <Clock className="h-4 w-4" />
                                                    )}
                                                </div>
                                                <span className={step.status === 'completed' ? 'text-foreground' : 'text-muted-foreground'}>
                                                    {step.name}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                {kycStatus === 'rejected' && (
                                    <div className="mt-6">
                                        <Button
                                            className="w-full"
                                            onClick={() => navigate('/merchant-onboarding')}
                                        >
                                            <Upload className="h-4 w-4 mr-2" />
                                            Re-upload Documents
                                        </Button>
                                    </div>
                                )}

                                {/* Bank Rejection reason + restart */}
                                {kycStatus === 'bank_rejected' && (
                                    <div className="mt-6 space-y-4">
                                        {merchantProfile?.rejection_reason && (
                                            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                                                <p className="text-sm font-semibold text-orange-700 mb-1">Bank Rejection Reason:</p>
                                                <p className="text-sm text-orange-600">{merchantProfile.rejection_reason}</p>
                                            </div>
                                        )}
                                        <Button
                                            className="w-full bg-orange-600 hover:bg-orange-700"
                                            onClick={async () => {
                                                try {
                                                    const { data } = await apiClient.post('/merchants/restart-onboarding');
                                                    if (data.success) {
                                                        await refetch();
                                                        navigate('/merchant-onboarding');
                                                    } else {
                                                        toast({ variant: 'destructive', title: 'Error', description: data.message });
                                                    }
                                                } catch (e: any) {
                                                    toast({ variant: 'destructive', title: 'Error', description: e.message || 'Failed to restart onboarding' });
                                                }
                                            }}
                                        >
                                            <RefreshCw className="h-4 w-4 mr-2" />
                                            Restart Onboarding
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <div className="mt-4">
                            <Button
                                onClick={paymentCompleted ? handleViewTransactionDetails : handleSabbpePayment}
                                disabled={
                                    isPaying ||
                                    (!paymentCompleted && integrationCostLoading) ||
                                    (paymentCompleted && isTxnDetailsLoading)
                                }
                                className={`w-full h-12 text-sm font-semibold ${paymentCompleted
                                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                                    : 'bg-red-600 text-white hover:bg-red-700'
                                }`}
                                variant={paymentCompleted ? 'default' : 'destructive'}
                            >
                                {isPaying ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Redirecting to payment gateway...
                                    </>
                                ) : !paymentCompleted && integrationCostLoading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading payment amount...
                                    </>
                                ) : paymentCompleted && isTxnDetailsLoading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading transaction details...
                                    </>
                                ) : paymentCompleted ? (
                                    'View txn details'
                                ) : (
                                    'Pay with Sabbpe'
                                )}
                            </Button>
                        </div>

                    </div>

                    {/* Sidebar - Right Column */}
                    <div className="space-y-6">
                        {/* UPI QR Code - Top Right when approved */}
                        {kycStatus === 'approved' && merchantProfile?.upi_qr_string && merchantProfile?.upi_vpa && (
                            <UPIQRCode
                                upiString={merchantProfile.upi_qr_string}
                                vpa={merchantProfile.upi_vpa}
                                merchantName={merchantProfile.business_name || 'Merchant'}
                            />
                        )}

                        {/* Quick Actions */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Quick Actions</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <Button
                                    variant="outline"
                                    className="w-full justify-start"
                                    onClick={() => {
                                        refetch();
                                        window.location.reload();
                                    }}
                                >
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    Refresh Status
                                </Button>

                                {(kycStatus === 'pending' || kycStatus === 'rejected') && (
                                    <Button
                                        variant="outline"
                                        className="w-full justify-start"
                                        onClick={() => navigate('/merchant-onboarding')}
                                    >
                                        <Upload className="h-4 w-4 mr-2" />
                                        Continue Onboarding
                                    </Button>
                                )}
                            </CardContent>
                        </Card>

                        {/* Support */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Need Help?</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="text-sm text-muted-foreground mb-3">
                                    Our customer support team is here to help you 24/7
                                </div>

                                <Button variant="outline" className="w-full justify-start">
                                    <Phone className="h-4 w-4 mr-2" />
                                    Call Support
                                </Button>

                                <Button variant="outline" className="w-full justify-start">
                                    <Mail className="h-4 w-4 mr-2" />
                                    Email Support
                                </Button>
                                 <Button
                                                                    variant="outline"
                                                                    className="w-full justify-start"
                                                                    style={{ color: '#25D366', fontWeight: 600, border: 'none', background: 'transparent', cursor: 'pointer' }}
                                                                    onClick={() => {
                                                                        const message = `Hello SabPe Support Team,\n\nI am currently in the process of completing my merchant onboarding application and have encountered an issue that is preventing me from proceeding further.\n\nI have carefully reviewed the information provided, but I am still unable to resolve the problem on my own. I kindly request your assistance in guiding me through the necessary steps to complete the onboarding successfully.\n\nPlease let me know the required actions or documents, if any.\n\nThank you for your time and support.`;
                                                                        const encodedMessage = encodeURIComponent(message);
                                                                        const whatsappUrl = `https://wa.me/919958750013?text=${encodedMessage}`;
                                                                        window.open(whatsappUrl, '_blank');
                                                                    }}
                                                                >
                                                                    <svg style={{marginRight: 8}} xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><path fill="#25D366" d="M12 2C6.477 2 2 6.477 2 12c0 1.85.504 3.59 1.38 5.08L2.05 22.05l5.08-1.33A9.953 9.953 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2Zm0 18a7.952 7.952 0 0 1-4.07-1.13l-.29-.17-3.02.79.8-2.95-.18-.3A7.963 7.963 0 1 1 20 12c0 4.418-3.582 8-8 8Zm4.29-5.71c-.2-.1-1.18-.58-1.36-.65-.18-.07-.31-.1-.44.1-.13.2-.5.65-.62.78-.12.13-.23.15-.43.05-.2-.1-.84-.31-1.6-.98-.59-.53-.99-1.18-1.11-1.38-.12-.2-.01-.3.09-.4.09-.09.2-.23.3-.34.1-.11.13-.19.2-.32.07-.13.04-.24-.02-.34-.06-.1-.44-1.06-.6-1.45-.16-.39-.32-.34-.44-.35-.11-.01-.24-.01-.37-.01-.13 0-.34.05-.52.24.-.18.19-.7.68-.7 1.66 0 .98.72 1.93.82 2.07.1.14 1.41 2.16 3.42 2.95.48.17.85.27 1.14.34.48.1.92.09 1.27.06.39-.04 1.18-.48 1.35-.94.17-.46.17-.85.12-.94.-.05-.09-.18.-.13.-.38.-.23Z"/></svg>
                                                                        WhatsApp Support
                                                                </Button>
                                {/* WhatsApp Help at the bottom of every step */}
                                <div style={{marginTop: '2rem', textAlign: 'center'}}>
                                    <p style={{fontWeight: 500, marginBottom: 8}}>Need Help on WhatsApp?</p>
                                    <WhatsAppSupportButton
                                        style={{background: 'transparent', color: '#25D366', boxShadow: 'none', fontSize: 16, padding: '8px 16px'}}
                                    />
                                </div>


                                <div className="pt-3 border-t">
                                    <div className="text-sm">
                                        <div className="font-medium text-foreground">Support Hours:</div>
                                        <div className="text-muted-foreground">24/7 - All days</div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Next Steps */}
                        {kycStatus === 'approved' && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Next Steps</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="text-sm text-muted-foreground mb-3">
                                        Your account is ready! Here's what you can do next:
                                    </div>

                                    <Button className="w-full">
                                        Access Merchant Portal
                                    </Button>

                                    <Button variant="outline" className="w-full">
                                        Download POS App
                                    </Button>

                                    <Button variant="outline" className="w-full">
                                        Integration Docs
                                    </Button>

                                    {/* Split Payment Letter — only if merchant has split config */}
                                    {merchantProfile?.split_payment_config && (
                                        <Button
                                            variant="outline"
                                            className="w-full justify-start text-blue-600 border-blue-200 hover:bg-blue-50"
                                            onClick={downloadSplitLetter}
                                        >
                                            <FileText className="h-4 w-4 mr-2" />
                                            Download Split Payment Letter
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>

                {/* CPV Recorder — full width, below main grid, only for cpv_pending */}
                {kycStatus === 'cpv_pending' && merchantProfile && (
                    <div className="mt-6">
                        <CPVRecorder
                            merchantId={merchantProfile.id}
                            userId={merchantProfile.user_id}
                            onSubmitted={() => refetch()}
                        />
                    </div>
                )}

                {/* Agreement Link — shown when bank has sent the agreement link */}
                {kycStatus === 'agreement_pending' && merchantProfile && (
                    <div className="mt-6">
                        {(merchantProfile as any).agreement_link ? (
                            <Card className="border-indigo-200 bg-indigo-50">
                                <CardContent className="p-6">
                                    <div className="flex items-start gap-4">
                                        <div className="p-3 rounded-full bg-indigo-500 text-white flex-shrink-0">
                                            <FileText className="h-6 w-6" />
                                        </div>
                                        <div className="flex-1 space-y-4">
                                            <div>
                                                <h3 className="text-lg font-semibold text-indigo-900 mb-1">
                                                    Agreement Ready for Signing
                                                </h3>
                                                <p className="text-sm text-indigo-700">
                                                    The bank has sent your merchant agreement. Please open the link below, review and sign it, then confirm here.
                                                </p>
                                            </div>

                                            <a
                                                href={(merchantProfile as any).agreement_link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm"
                                            >
                                                📄 Open & Sign Agreement
                                            </a>

                                            <div className="border-t border-indigo-200 pt-4">
                                                <p className="text-sm text-indigo-700 mb-3">
                                                    Once you have signed the agreement on DocuSeal, click below to notify the bank:
                                                </p>
                                                <button
                                                    onClick={async () => {
                                                        if (!window.confirm('Confirm that you have signed the agreement?')) return;
                                                        try {
                                                            const { data } = await apiClient.post('/merchants/confirm-agreement-signed');
                                                            if (data?.success) {
                                                                refetch();
                                                            }
                                                        } catch (e) {
                                                            console.error(e);
                                                        }
                                                    }}
                                                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm"
                                                >
                                                    ✅ I Have Signed the Agreement
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : (
                            <Card className="border-yellow-200 bg-yellow-50">
                                <CardContent className="p-6">
                                    <p className="text-yellow-800 text-sm">
                                        ⏳ The bank is preparing your agreement. You will receive a link shortly.
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
};
