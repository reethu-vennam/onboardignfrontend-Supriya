// src/components/onboarding/DoingBusinessAddress.tsx
//
// Step 7 — operating address proof. Only shown when operatingAddressDifferent = true.
// useOnboardingFlow skips this step when operating address = registered address.
//
// Saves to merchant_documents: doc_category = 'doing_business', person_id = NULL

import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useMerchantData } from '@/hooks/useMerchantData';
import { useAuth } from '@/components/auth/AuthProvider';
import { api } from '@/lib/rest-api';
import { OnboardingData, EntityType } from '@/types/onboarding';
import {
    Upload, CheckCircle, AlertTriangle, RefreshCw,
    MapPin, ChevronRight, Info, FileText,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';

// ─── Name requirement by entity type ─────────────────────────────────────────

type DocOptionKey = 'electricityBill' | 'waterBill' | 'landlineBill' | 'rentAgreement';

const DOC_OPTIONS: { value: string; labelKey: DocOptionKey; hintKey: 'notOlderThan3Months' | 'rentAgreementHint' }[] = [
    { value: 'utility_bill', labelKey: 'electricityBill', hintKey: 'notOlderThan3Months' },
    { value: 'utility_bill', labelKey: 'waterBill', hintKey: 'notOlderThan3Months' },
    { value: 'utility_bill', labelKey: 'landlineBill', hintKey: 'notOlderThan3Months' },
    { value: 'rent_agreement', labelKey: 'rentAgreement', hintKey: 'rentAgreementHint' },
];

function getNameRequirementKey(entityType: EntityType | ''): string {
    switch (entityType) {
        case 'proprietorship':
        case 'individual':
            return 'nameReqProprietor';
        case 'partnership':
        case 'llp':
            return 'nameReqPartnership';
        case 'pvt_ltd':
        case 'public_ltd':
            return 'nameReqCompany';
        case 'trust':
        case 'society':
            return 'nameReqTrust';
        case 'huf':
            return 'nameReqHuf';
        default:
            return 'nameReqDefault';
    }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DoingBusinessAddressProps {
    data?: Partial<OnboardingData>;
    onDataChange?: (data: Partial<OnboardingData>) => void;
    onNext?: () => void;
    onPrev?: () => void;
    merchantProfile?: Record<string, unknown>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const DoingBusinessAddress: React.FC<DoingBusinessAddressProps> = ({
    data,
    onDataChange,
    onNext,
    onPrev,
    merchantProfile: merchantProfileProp,
}) => {
    const { toast } = useToast();
    const { t } = useI18n();
    const { user } = useAuth();
    const { merchantProfile: dbMerchantProfile } = useMerchantData();
    const merchantProfile = merchantProfileProp || dbMerchantProfile;

    const entityType = (data?.entityType || '') as EntityType | '';

    const [selectedOptionKey, setSelectedOptionKey] = useState<DocOptionKey | ''>('');
    const [selectedValue, setSelectedValue] = useState('');

    const getDocLabel = (key: DocOptionKey) => t(`doingBusiness.${key}`);

    const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'failed'>(
        data?.doingBusinessDocPath ? 'success' : 'idle'
    );
    const [fileName, setFileName] = useState(data?.doingBusinessDocName || '');
    const [filePath, setFilePath] = useState(data?.doingBusinessDocPath || '');
    const [fileSize, setFileSize] = useState(data?.doingBusinessDocSize || 0);
    const [docId, setDocId] = useState(data?.doingBusinessDocId || '');
    const [uploadError, setUploadError] = useState('');
    const [saving, setSaving] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);

    const isUploading = uploadStatus === 'uploading';
    const isSuccess = uploadStatus === 'success';
    const isFailed = uploadStatus === 'failed';

    // ── Pre-fill from Quick Scan results ──────────────────────────────────────
    React.useEffect(() => {
        if (!data?.scanResults?.addressProof) return;
        const ap = data.scanResults.addressProof;
        setFilePath(ap.filePath);
        setFileName(ap.fileName);
        setFileSize(0);
        setUploadStatus('success');
    }, [data?.scanResults]);

    // ── Upload ────────────────────────────────────────────────────────────────

    const handleUpload = useCallback(async (file: File) => {
        if (!selectedValue) {
            toast({ variant: 'destructive', title: 'Select document type first' });
            return;
        }

        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
        if (!allowed.includes(file.type)) {
            toast({ variant: 'destructive', title: 'Unsupported file type', description: 'Use JPG, PNG, or PDF.' });
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast({ variant: 'destructive', title: 'File too large', description: 'Maximum 5MB allowed.' });
            return;
        }

        setUploadStatus('uploading');
        setUploadError('');

        try {
            const isDistributorFlow = Boolean((data as any)?.isDistributorFlow || merchantProfileProp);
            const uploadUserId = isDistributorFlow
                ? user?.id
                : ((merchantProfile?.user_id as string) || user?.id);
            if (!uploadUserId) throw new Error('User not authenticated');

            const ext = file.name.split('.').pop();
            const path = `${uploadUserId}/doing-business_${Date.now()}.${ext}`;

            const uploadResult = await api.uploadFile(file);
            if (!uploadResult) throw new Error('Upload failed');

            // Insert into merchant_documents
            const merchantId = merchantProfile?.id as string | undefined;
            let insertedId: string | undefined;
            if (merchantId) {
                await api.post('/merchant/profile', {
                    documents: [{ fileName: file.name, filePath: uploadResult.url, documentType: selectedValue }]
                });
            }

            setFilePath(path);
            setFileName(file.name);
            setFileSize(file.size);
            setDocId(insertedId || '');
            setUploadStatus('success');
            toast({ title: `${selectedOptionKey ? getDocLabel(selectedOptionKey) : ''} uploaded successfully` });

        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setUploadStatus('failed');
            setUploadError(msg);
            toast({ variant: 'destructive', title: 'Upload failed', description: msg });
        }
    }, [selectedValue, selectedOptionKey, merchantProfile, merchantProfileProp, user?.id, toast, getDocLabel]);

    // ── Continue ──────────────────────────────────────────────────────────────

    const handleContinue = useCallback(async () => {
        if (!isSuccess) {
            toast({
                variant: 'destructive',
                title: 'Document required',
                description: 'Upload a utility bill or rent agreement for your operating address.',
            });
            return;
        }
        setSaving(true);
        try {
            onDataChange?.({
                doingBusinessDocPath: filePath,
                doingBusinessDocName: fileName,
                doingBusinessDocSize: fileSize,
                doingBusinessDocId: docId,
            });
            onNext?.();
        } finally {
            setSaving(false);
        }
    }, [isSuccess, filePath, fileName, fileSize, docId, onDataChange, onNext, toast]);

    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div className="max-w-2xl mx-auto space-y-8 pb-12">

            {/* Header */}
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-foreground">{t('doingBusiness.title')}</h2>
                <p className="text-muted-foreground text-base">
                    {t('doingBusiness.subtitle')}
                </p>
            </div>

            {/* Quick Scan complete banner */}
            {data?.scanResults?.addressProof && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
                    <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-green-600" />
                    <div>
                        <p className="font-medium">Quick Scan complete</p>
                        <p className="text-xs text-green-700 mt-0.5">
                            Address proof uploaded from Quick Scan. Just select the document type below.
                        </p>
                    </div>
                </div>
            )}

            {/* Address comparison */}
            <div className="grid sm:grid-cols-2 gap-4">
                {data?.registeredAddress?.addressLine1 && (
                    <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            {t('doingBusiness.registeredAddress')}
                        </p>
                        <p className="text-sm text-foreground">
                            {data.registeredAddress.addressLine1}, {data.registeredAddress.city}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {data.registeredAddress.state} — {data.registeredAddress.pincode}
                        </p>
                    </div>
                )}
                {data?.operatingAddress?.addressLine1 && (
                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-1">
                        <p className="text-xs font-semibold text-primary uppercase tracking-wide flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {t('doingBusiness.operatingAddress')}
                        </p>
                        <p className="text-sm text-foreground">
                            {data.operatingAddress.addressLine1}, {data.operatingAddress.city}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {data.operatingAddress.state} — {data.operatingAddress.pincode}
                        </p>
                    </div>
                )}
            </div>

            {/* Name requirement notice */}
            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
                <Info className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                    <p className="font-medium">{t('doingBusiness.important')}</p>
                    <p className="text-xs mt-0.5 text-amber-700">
                        {t(`doingBusiness.${getNameRequirementKey(entityType)}`)} {t('doingBusiness.documentNotOlder')}
                    </p>
                </div>
            </div>

            {/* Upload card */}
            <Card>
                <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <FileText className="h-5 w-5 text-primary" />
                        {t('doingBusiness.uploadProof')}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">

                    {/* Doc type */}
                    <div>
                        <Label>
                            {t('doingBusiness.documentType')} <span className="text-destructive">*</span>
                        </Label>
                        <Select
                            value={selectedOptionKey}
                            onValueChange={val => {
                                const opt = DOC_OPTIONS.find(o => o.labelKey === val);
                                if (opt) {
                                    setSelectedOptionKey(opt.labelKey);
                                    setSelectedValue(opt.value);
                                    if (isSuccess) setUploadStatus('idle');
                                }
                            }}
                        >
                            <SelectTrigger className="mt-1">
                                <SelectValue placeholder={t('upload.selectDocType')} />
                            </SelectTrigger>
                            <SelectContent>
                                {DOC_OPTIONS.map(opt => (
                                    <SelectItem key={opt.labelKey} value={opt.labelKey}>
                                        {getDocLabel(opt.labelKey)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {selectedOptionKey && (
                            <p className="text-xs text-muted-foreground mt-1">
                                {t(`upload.${DOC_OPTIONS.find(o => o.labelKey === selectedOptionKey)?.hintKey}`)}
                            </p>
                        )}
                    </div>

                    {/* Upload area */}
                    <div>
                        <Label>
                            {t('upload.uploadDocument')} <span className="text-destructive">*</span>
                        </Label>
                        <input
                            ref={inputRef}
                            type="file"
                            accept="image/*,.pdf"
                            className="hidden"
                            disabled={isUploading || !selectedValue}
                            onChange={e => {
                                const f = e.target.files?.[0];
                                if (f) { handleUpload(f); e.target.value = ''; }
                            }}
                        />
                        <div
                            onClick={() => {
                                if (!selectedValue) {
                                    toast({ variant: 'destructive', title: 'Select document type first' });
                                    return;
                                }
                                if (!isUploading) inputRef.current?.click();
                            }}
                            className={`
                                mt-1 flex flex-col items-center justify-center gap-3 p-10
                                rounded-xl border-2 transition-all
                                ${isUploading ? 'border-blue-200 bg-blue-50 cursor-not-allowed' : ''}
                                ${isSuccess ? 'border-green-300 bg-green-50 cursor-pointer' : ''}
                                ${isFailed ? 'border-red-300 bg-red-50 cursor-pointer' : ''}
                                ${!isUploading && !isSuccess && !isFailed
                                    ? !selectedValue
                                        ? 'border-dashed border-border bg-muted/20 opacity-60 cursor-not-allowed'
                                        : 'border-dashed border-border hover:border-primary/50 hover:bg-muted/30 cursor-pointer'
                                    : ''}
                            `}
                        >
                            {isUploading && (
                                <>
                                    <RefreshCw className="h-8 w-8 text-blue-500 animate-spin" />
                                    <p className="text-sm text-blue-700 font-medium">{t('upload.uploading')}</p>
                                </>
                            )}
                            {isSuccess && (
                                <>
                                    <CheckCircle className="h-8 w-8 text-green-600" />
                                    <div className="text-center">
                                        <p className="text-sm text-green-700 font-medium">{fileName}</p>
                                        <p className="text-xs text-green-600 mt-0.5">{t('upload.uploadedReplace')}</p>
                                    </div>
                                </>
                            )}
                            {isFailed && (
                                <>
                                    <AlertTriangle className="h-8 w-8 text-red-500" />
                                    <div className="text-center">
                                        <p className="text-sm text-red-600 font-medium">{t('upload.uploadFailed')}</p>
                                        <p className="text-xs text-red-500 mt-0.5">{uploadError || t('upload.uploadFailed')}</p>
                                    </div>
                                </>
                            )}
                            {!isUploading && !isSuccess && !isFailed && (
                                <>
                                    <Upload className="h-8 w-8 text-muted-foreground" />
                                    <div className="text-center">
                                        <p className="text-sm text-foreground font-medium">
                                            {selectedValue ? t('upload.clickToUploadShort') : t('upload.selectDocTypeFirst')}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{t('upload.formats')}</p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Accepted doc list */}
                    <div className="p-3 rounded-lg bg-muted/30 border border-border text-xs text-muted-foreground space-y-1">
                        <p className="font-medium text-foreground">{t('upload.acceptedDocuments')}</p>
                        {DOC_OPTIONS.map(opt => (
                            <p key={opt.labelKey} className="flex items-center gap-1.5">
                                <span className="w-1 h-1 rounded-full bg-muted-foreground inline-block" />
                                {getDocLabel(opt.labelKey)} — {t(`upload.${opt.hintKey}`)}
                            </p>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex justify-between items-center pt-2">
                <Button variant="outline" onClick={onPrev} disabled={saving}>
                    {t('common.back')}
                </Button>
                <Button
                    onClick={handleContinue}
                    disabled={saving || !isSuccess}
                    className="min-w-[140px]"
                >
                    {saving ? t('common.saving') : t('common.continue')}
                    {!saving && <ChevronRight className="h-4 w-4 ml-1" />}
                </Button>
            </div>
        </div>
    );
};

export default DoingBusinessAddress;


