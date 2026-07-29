// src/components/onboarding/EntityDocuments.tsx
//
// Step 6 of merchant onboarding " upload entity-level business documents.
// The document list is pre-populated in entityDocuments[] by EntityTypeSelection
// via getEntityDocRequirements(). This component renders and handles uploads.
//
// Each doc is uploaded to Supabase Storage and inserted into merchant_documents
// with person_id = NULL (entity-level, not person-level)

import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useMerchantData } from '@/hooks/useMerchantData';
import { useAuth } from '@/components/auth/AuthProvider';
import { api } from '@/lib/rest-api';
import { OnboardingData, EntityDocData, EntityType } from '@/types/onboarding';
import {
    Upload, CheckCircle, AlertTriangle, RefreshCw,
    FileText, ChevronRight, Info, Star,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';

// â”€â”€â”€ Slot state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface DocSlotState {
    uploadStatus: 'idle' | 'uploading' | 'success' | 'failed';
    fileName?: string;
    filePath?: string;
    fileSize?: number;
    mimeType?: string;
    uploadError?: string;
    docId?: string;
}

const EMPTY_SLOT: DocSlotState = { uploadStatus: 'idle' };

// â”€â”€â”€ Upload slot widget â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€“

interface UploadSlotProps {
    doc: EntityDocData;
    displayLabel: string;
    slot: DocSlotState;
    onUpload: (file: File) => void;
}

const UploadSlot: React.FC<UploadSlotProps> = ({ doc, displayLabel, slot, onUpload }) => {
    const { t } = useI18n();
    const inputRef = useRef<HTMLInputElement>(null);
    const isUploading = slot.uploadStatus === 'uploading';
    const isSuccess = slot.uploadStatus === 'success';
    const isFailed = slot.uploadStatus === 'failed';

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground">{displayLabel}</span>
                {doc.isMandatory ? (
    <span className="flex items-center gap-0.5 text-xs text-destructive font-medium">
        <Star className="h-2.5 w-2.5 fill-destructive" /> {t('entityDocuments.requiredLabel')}
    </span>
) : doc.requirementGroup ? (
    <span className="text-xs text-amber-700 font-medium">{t('upload.anyOneRequired')}</span>
) : (
    <span className="text-xs text-muted-foreground">({t('common.optional')})</span>
)}

                {isSuccess && <CheckCircle className="h-4 w-4 text-green-600 ml-auto" />}
            </div>

            <input
                ref={inputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                disabled={isUploading}
                onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) { onUpload(f); e.target.value = ''; }
                }}
            />

            <div
                onClick={() => !isUploading && inputRef.current?.click()}
                className={`
                    flex items-center gap-3 p-3 rounded-lg border transition-all
                    ${isUploading ? 'border-blue-200 bg-blue-50 cursor-not-allowed' : ''}
                    ${isSuccess ? 'border-green-300 bg-green-50 cursor-pointer' : ''}
                    ${isFailed ? 'border-red-300 bg-red-50 cursor-pointer' : ''}
                    ${!isUploading && !isSuccess && !isFailed
                        ? 'border-dashed border-border hover:border-primary/50 hover:bg-muted/30 cursor-pointer'
                        : ''}
                `}
            >
                {isUploading ? (
                    <RefreshCw className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0" />
                ) : isSuccess ? (
                    <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                ) : isFailed ? (
                    <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                ) : (
                    <Upload className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                    {isUploading && <p className="text-xs text-blue-700">{t('upload.uploading')}</p>}
                    {isSuccess && (
                        <p className="text-xs text-green-700 truncate font-medium">{slot.fileName}</p>
                    )}
                    {isFailed && (
                        <p className="text-xs text-red-600 truncate">
                            {slot.uploadError || t('upload.uploadFailed')}
                        </p>
                    )}
                    {!isUploading && !isSuccess && !isFailed && (
                        <p className="text-xs text-muted-foreground">
                            {t('upload.clickToUpload')}
                        </p>
                    )}
                </div>
                {isSuccess && (
                    <span className="text-xs text-muted-foreground flex-shrink-0">{t('upload.replace')}</span>
                )}
            </div>
        </div>
    );
};

// â”€â”€â”€ Section labels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€â”€ Storage folder map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€“

const DOC_FOLDER: Record<string, string> = {
    gst_certificate: 'gst-certificates',
    partnership_deed: 'partnership-deeds',
    llp_agreement: 'llp-agreements',
    moa: 'moa-docs',
    aoa: 'aoa-docs',
    certificate_of_incorporation: 'incorporation-certs',
    trust_deed: 'trust-deeds',
    huf_deed: 'huf-deeds',
    shop_act_certificate: 'shop-act-certs',
    affiliation_letter: 'affiliation-letters',
    work_order: 'work-orders',
    undertaking: 'undertakings',
    bank_statement: 'bank-statements',
};

// â”€â”€â”€ Props â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface EntityDocumentsProps {
    data?: Partial<OnboardingData>;
    onDataChange?: (data: Partial<OnboardingData>) => void;
    onNext?: () => void;
    onPrev?: () => void;
    merchantProfile?: Record<string, unknown>;
}

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const EntityDocuments: React.FC<EntityDocumentsProps> = ({
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

    const entityType = (data?.entityType || '') as EntityType;

    const translateDocLabel = useCallback((doc: EntityDocData): string => {
        if (doc.docType === 'gst_certificate') {
            if (entityType === 'education' || entityType === 'government_psu') {
                return t('entityDocuments.docs.gst_certificate_pan');
            }
            if (doc.label.includes('if applicable')) {
                return t('entityDocuments.docs.gst_certificate_optional');
            }
        }
        const key = `entityDocuments.docs.${doc.docType}`;
        const translated = t(key);
        return translated !== key ? translated : doc.label;
    }, [entityType, t]);
    const entityDocs = data?.entityDocuments || [];

    // Slot state keyed by docType " restore from existing data if available
    const [slots, setSlots] = useState<Record<string, DocSlotState>>(() => {
        const initial: Record<string, DocSlotState> = {};
        for (const doc of entityDocs) {
            initial[doc.docType] = doc.filePath
                ? {
                    uploadStatus: 'success',
                    fileName: doc.fileName,
                    filePath: doc.filePath,
                    fileSize: doc.fileSize,
                    mimeType: doc.mimeType,
                    docId: doc.docId,
                }
                : { ...EMPTY_SLOT };
        }
        return initial;
    });

    const [saving, setSaving] = useState(false);

    const uploadToStorage = useCallback(async (file: File, folder: string): Promise<string> => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
        if (!allowed.includes(file.type)) throw new Error('Unsupported file type. Use JPG, PNG, or PDF.');
        if (file.size > 5 * 1024 * 1024) throw new Error('File too large. Maximum 5MB allowed.');

        const uploadResult = await api.uploadFile(file);
        if (!uploadResult) throw new Error('Upload failed');
        return uploadResult.url || uploadResult.filePath || uploadResult.path || '';
    }, []);

    const insertDocument = useCallback(async (params: {
        filePath: string; fileName: string; fileSize: number;
        mimeType: string; documentType: string; docCategory: string;
    }): Promise<string | undefined> => {
        const merchantId = merchantProfile?.id as string | undefined;
        if (!merchantId) return undefined;
        try {
            const result = await api.post('/merchant/profile', {
                documents: [{
                    fileName: params.fileName,
                    filePath: params.filePath,
                    fileSize: params.fileSize,
                    mimeType: params.mimeType,
                    documentType: params.documentType,
                    docCategory: params.docCategory,
                }],
            });
            return result?.id;
        } catch (err) {
            console.error('Entity document insert error:', err);
            return undefined;
        }
    }, [merchantProfile?.id]);

    const handleUpload = useCallback(async (doc: EntityDocData, file: File) => {
        setSlots(prev => ({ ...prev, [doc.docType]: { uploadStatus: 'uploading' } }));
        try {
            const folder = DOC_FOLDER[doc.docType] || 'business-docs';
            const filePath = await uploadToStorage(file, folder);
            const docId = await insertDocument({
                filePath, fileName: file.name, fileSize: file.size,
                mimeType: file.type, documentType: doc.docType, docCategory: doc.docCategory,
            });
            setSlots(prev => ({
                ...prev,
                [doc.docType]: {
                    uploadStatus: 'success', fileName: file.name,
                    filePath, fileSize: file.size, mimeType: file.type, docId,
                },
            }));
            toast({ title: `${doc.label} uploaded` });
        } catch (err) {
            setSlots(prev => ({
                ...prev,
                [doc.docType]: { uploadStatus: 'failed', uploadError: String(err) },
            }));
            toast({ variant: 'destructive', title: 'Upload failed', description: String(err) });
        }
    }, [uploadToStorage, insertDocument, toast]);

    const validate = useCallback((): string | null => {
        const missing = entityDocs
            .filter(d => d.isMandatory && slots[d.docType]?.uploadStatus !== 'success')
            .map(d => d.label);

        if (missing.length > 0) {
            return `Please upload: ${missing.join(', ')}`;
        }

        const requirementGroups = entityDocs.reduce<Record<string, EntityDocData[]>>((acc, doc) => {
            if (!doc.requirementGroup) return acc;
            if (!acc[doc.requirementGroup]) acc[doc.requirementGroup] = [];
            acc[doc.requirementGroup].push(doc);
            return acc;
        }, {});

        for (const [groupKey, docs] of Object.entries(requirementGroups)) {
            const hasAnyUploaded = docs.some(doc => slots[doc.docType]?.uploadStatus === 'success');
            if (!hasAnyUploaded) {
                return `Please upload one of: ${docs.map(doc => doc.label).join(' or ')}`;
            }
        }

        return null;
    }, [entityDocs, slots]);

    const handleContinue = useCallback(async () => {
        const err = validate();
        if (err) {
            toast({ variant: 'destructive', title: 'Required documents missing', description: err });
            return;
        }
        setSaving(true);
        try {
            const updatedDocs: EntityDocData[] = entityDocs.map(doc => {
                const slot = slots[doc.docType];
                return {
                    ...doc,
                    filePath: slot?.filePath,
                    fileName: slot?.fileName,
                    fileSize: slot?.fileSize,
                    mimeType: slot?.mimeType,
                    docId: slot?.docId,
                    isUploaded: slot?.uploadStatus === 'success',
                };
            });

            const legacyDocs: Record<string, { file: File; path: string }> = {
                ...(data?.documents || {}),
            };
            for (const doc of updatedDocs) {
                if (!doc.filePath) continue;
                if (['gst_certificate', 'partnership_deed', 'llp_agreement', 'moa',
                     'trust_deed', 'huf_deed', 'certificate_of_incorporation',
                     'undertaking'].includes(doc.docType)) {
                    if (!legacyDocs.businessProof) {
                        legacyDocs.businessProof = {
                            file: new File([], doc.fileName || 'business.pdf'),
                            path: doc.filePath,
                        };
                    }
                }
                if (doc.docType === 'bank_statement') {
                    legacyDocs.bankStatement = {
                        file: new File([], doc.fileName || 'bank.pdf'),
                        path: doc.filePath,
                    };
                }
            }

            onDataChange?.({ entityDocuments: updatedDocs, documents: legacyDocs });
            onNext?.();
        } catch (err) {
            console.error('EntityDocuments handleContinue error:', err);
            toast({ variant: 'destructive', title: 'Unexpected error', description: 'Please try again.' });
        } finally {
            setSaving(false);
        }
    }, [validate, entityDocs, slots, data?.documents, onDataChange, onNext, toast]);

    const docsByCategory = entityDocs.reduce<Record<string, EntityDocData[]>>((acc, doc) => {
        if (!acc[doc.docCategory]) acc[doc.docCategory] = [];
        acc[doc.docCategory].push(doc);
        return acc;
    }, {});

    const standaloneMandatoryDocs = entityDocs.filter(d => d.isMandatory && !d.requirementGroup);
    const requirementGroups = entityDocs.reduce<Record<string, EntityDocData[]>>((acc, doc) => {
        if (!doc.requirementGroup) return acc;
        if (!acc[doc.requirementGroup]) acc[doc.requirementGroup] = [];
        acc[doc.requirementGroup].push(doc);
        return acc;
    }, {});
    const totalMandatory = standaloneMandatoryDocs.length + Object.keys(requirementGroups).length;
    const uploadedMandatory = standaloneMandatoryDocs.filter(
        d => slots[d.docType]?.uploadStatus === 'success'
    ).length + Object.values(requirementGroups).filter(
        docs => docs.some(doc => slots[doc.docType]?.uploadStatus === 'success')
    ).length;
    const totalOptional = entityDocs.filter(d => !d.isMandatory).length;
    const uploadedOptional = entityDocs.filter(
        d => !d.isMandatory && slots[d.docType]?.uploadStatus === 'success'
    ).length;

    const entityLabel = entityType
        ? entityType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        : '';

    return (
        <div className="max-w-3xl mx-auto space-y-8 pb-12">

            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-foreground">{t('entityDocuments.title')}</h2>
                <p className="text-muted-foreground text-base">
                    {t('entityDocuments.subtitle', { entity: entityLabel })}
                </p>
            </div>

            {totalMandatory > 0 && (
                <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/40 border border-border text-sm">
                    <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                            uploadedMandatory === totalMandatory
                                ? 'bg-green-100 text-green-700'
                                : 'bg-primary/10 text-primary'
                        }`}>
                            {uploadedMandatory}/{totalMandatory}
                        </div>
                        <span className="text-muted-foreground">
                            {uploadedMandatory === totalMandatory
                                ? t('entityDocuments.requiredComplete')
                                : t('entityDocuments.requiredDocs')}
                        </span>
                    </div>
                    {totalOptional > 0 && (
                        <>
                            <div className="w-px h-5 bg-border" />
                            <span className="text-muted-foreground">
                                {uploadedOptional}/{totalOptional} {t('entityDocuments.optional')}
                            </span>
                        </>
                    )}
                </div>
            )}

            <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="font-medium">{t('entityDocuments.requirementsFor', { entity: entityLabel })}</p>
                    <p className="text-blue-700 text-xs mt-0.5">
                        {t('entityDocuments.requirementsHint')}
                    </p>
                </div>
            </div>

            {(['entity_reg', 'entity_specific', 'bank'] as const).map(category => {
                const docs = docsByCategory[category];
                if (!docs || docs.length === 0) return null;
                return (
                    <Card key={category}>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <FileText className="h-5 w-5 text-primary" />
                                {t(`entityDocuments.sections.${category}.title`)}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground">
                                {t(`entityDocuments.sections.${category}.description`)}
                            </p>
                        </CardHeader>
                        <CardContent className="space-y-5">
    {category === 'entity_reg' && docs.some(doc => doc.requirementGroup === 'proprietorship_registration_proof') && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t('entityDocuments.proprietorshipNote')}
        </div>
    )}

    {docs.map(doc => (
        <UploadSlot
            key={doc.docType}
            doc={doc}
            displayLabel={translateDocLabel(doc)}
            slot={slots[doc.docType] || EMPTY_SLOT}
            onUpload={f => handleUpload(doc, f)}
        />
    ))}
</CardContent>

                    </Card>
                );
            })}

            {entityDocs.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>{t('upload.noDocsRequired')}</p>
                    <p className="text-sm mt-1">{t('upload.clickContinueEmpty')}</p>
                </div>
            )}

            <div className="flex justify-between items-center pt-2">
                <Button variant="outline" onClick={onPrev} disabled={saving}>
                    {t('common.back')}
                </Button>
                <Button onClick={handleContinue} disabled={saving} className="min-w-[140px]">
                    {saving ? t('common.saving') : t('common.continue')}
                    {!saving && <ChevronRight className="h-4 w-4 ml-1" />}
                </Button>
            </div>
        </div>
    );
};

export default EntityDocuments;



