// src/components/onboarding/PersonKYC.tsx
//
// Step 5 of merchant onboarding — collect KYC for all persons.
// Dynamically adapts to entity type:
//   - Proprietorship/Individual: 1 person, PAN + Aadhaar + address proof
//   - Partnership/LLP: min 2 partners, PAN + address proof each
//   - Pvt/Public Ltd: min 1 director, PAN + address proof each
//   - Trust/Society: 1 trustee, PAN + address proof
//   - HUF: 1 karta, PAN + address proof
//   - Education/Govt: 1 signatory, all optional
//
// On Continue:
//   1. INSERTs rows into merchant_persons
//   2. merchant_documents already written per-upload (with person_id)
//   3. Updates parent onboarding state

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useMerchantData } from '@/hooks/useMerchantData';
import { useAuth } from '@/components/auth/AuthProvider';
import { api } from '@/lib/rest-api';
import { authService } from '@/lib/auth-service';
import {
    OnboardingData,
    PersonKYCData,
    EntityType,
    PersonRole,
    AddressProofType,
    MIN_PERSONS,
    PRIMARY_PERSON_ROLE,
    REQUIRES_AADHAAR,
    AUTHORITY_LETTER_APPLICABLE,
} from '@/types/onboarding';
import {
    User,
    Users,
    Upload,
    CheckCircle,
    AlertTriangle,
    RefreshCw,
    Plus,
    Trash2,
    ChevronRight,
    Sparkles,
    CreditCard,
    FileText,
    Shield,
    Info,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';

// ─── OCR Service (calls Spring Boot backend /api/ocr/extract) ─────────────────

const API_URL = import.meta.env.VITE_API_URL || '';

interface ExtractedData {
    panNumber?: string;
    aadhaarNumber?: string;
    extractedName?: string;
    dateOfBirth?: string;
    confidence: number;
}

class RealOCRService {

    async processDocument(file: File, documentType: 'PAN' | 'AADHAAR', onProgress?: (p: number) => void): Promise<ExtractedData> {
        onProgress?.(10);
        const formData = new FormData();
        formData.append('doc_front_image', file);
        formData.append('doc_type', documentType);
        onProgress?.(30);
        const token = authService.getToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const response = await fetch(`${API_URL}/api/kyc/ocr`, {
            method: 'POST',
            headers,
            body: formData,
        });
        if (!response.ok) throw new Error(`OCR service error: ${response.statusText}`);
        const json = await response.json();
        onProgress?.(80);
        if (!json.success || !json.data) {
            throw new Error(json.error?.message || json.data?.rawText || 'OCR failed');
        }
        onProgress?.(100);
        return {
            panNumber: json.data.panNumber || undefined,
            aadhaarNumber: json.data.aadhaarNumber || undefined,
            extractedName: json.data.extractedName || undefined,
            dateOfBirth: json.data.dateOfBirth || undefined,
            confidence: json.data.confidence || 0,
        };
    }
}

const ocrService = new RealOCRService();

// ─── Doc upload state per document slot ──────────────────────────────────────

interface DocSlotState {
    uploadStatus: 'idle' | 'uploading' | 'success' | 'failed';
    ocrStatus: 'idle' | 'processing' | 'success' | 'failed';
    ocrProgress: number;
    fileName?: string;
    filePath?: string;
    fileSize?: number;
    uploadError?: string;
    ocrError?: string;
    docId?: string; // merchant_documents row id
}

const EMPTY_DOC_SLOT: DocSlotState = {
    uploadStatus: 'idle',
    ocrStatus: 'idle',
    ocrProgress: 0,
};

// ─── Per-person UI state ──────────────────────────────────────────────────────

interface PersonUIState {
    // Form fields
    fullName: string;
    panNumber: string;
    aadhaarNumber: string;
    addressProofType: AddressProofType | '';
    isAuthorizedSignatory: boolean;

    // Doc slots
    panSlot: DocSlotState;
    aadhaarSlot: DocSlotState;
    addressProofSlot: DocSlotState;
    authorityLetterSlot: DocSlotState;

    // OCR auto-filled flags
    panAutoFilled: boolean;
    aadhaarAutoFilled: boolean;
    nameAutoFilled: boolean;

    // DB id — set after merchant_persons INSERT
    personId?: string;
}

function emptyPersonUI(): PersonUIState {
    return {
        fullName: '',
        panNumber: '',
        aadhaarNumber: '',
        addressProofType: '',
        isAuthorizedSignatory: false,
        panSlot: { ...EMPTY_DOC_SLOT },
        aadhaarSlot: { ...EMPTY_DOC_SLOT },
        addressProofSlot: { ...EMPTY_DOC_SLOT },
        authorityLetterSlot: { ...EMPTY_DOC_SLOT },
        panAutoFilled: false,
        aadhaarAutoFilled: false,
        nameAutoFilled: false,
    };
}

// ─── Single doc upload widget ─────────────────────────────────────────────────

interface DocUploadSlotProps {
    label: string;
    required: boolean;
    slot: DocSlotState;
    onUpload: (file: File) => void;
    accept?: string;
    hint?: string;
}

const DocUploadSlot: React.FC<DocUploadSlotProps> = ({
    label, required, slot, onUpload, accept = 'image/*,.pdf', hint,
}) => {
    const { t } = useI18n();
    const inputRef = useRef<HTMLInputElement>(null);
    const isProcessing = slot.uploadStatus === 'uploading' || slot.ocrStatus === 'processing';
    const isSuccess = slot.uploadStatus === 'success';
    const isFailed = slot.uploadStatus === 'failed';

    return (
        <div className="space-y-1.5">
            <Label className="text-xs">
                {label} {required && <span className="text-destructive">*</span>}
            </Label>
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                className="hidden"
                disabled={isProcessing}
                onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) { onUpload(f); e.target.value = ''; }
                }}
            />
            <div
                onClick={() => !isProcessing && inputRef.current?.click()}
                className={`
                    flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
                    ${isProcessing ? 'cursor-not-allowed border-blue-200 bg-blue-50' : ''}
                    ${isSuccess ? 'border-green-300 bg-green-50' : ''}
                    ${isFailed ? 'border-red-300 bg-red-50' : ''}
                    ${!isProcessing && !isSuccess && !isFailed ? 'border-dashed border-border hover:border-primary/50 hover:bg-muted/40' : ''}
                `}
            >
                {isProcessing ? (
                    <RefreshCw className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0" />
                ) : isSuccess ? (
                    <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                ) : isFailed ? (
                    <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                ) : (
                    <Upload className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                    {isProcessing ? (
                        <p className="text-xs text-blue-700 truncate">
                            {t('upload.processing')} {slot.ocrProgress > 0 ? `${slot.ocrProgress}%` : ''}
                        </p>
                    ) : isSuccess ? (
                        <p className="text-xs text-green-700 truncate font-medium">{slot.fileName}</p>
                    ) : isFailed ? (
                        <p className="text-xs text-red-600 truncate">
                            {slot.uploadError || t('upload.uploadFailed')}
                        </p>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            {hint || t('upload.clickToUploadHint')}
                        </p>
                    )}
                </div>
            </div>
            {isProcessing && slot.ocrProgress > 0 && (
                <Progress value={slot.ocrProgress} className="h-1" />
            )}
            {isSuccess && slot.ocrStatus === 'failed' && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {t('upload.ocrFailed')}
                </p>
            )}
        </div>
    );
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface PersonKYCProps {
    data?: Partial<OnboardingData>;
    onDataChange?: (data: Partial<OnboardingData>) => void;
    onNext?: () => void;
    onPrev?: () => void;
    merchantProfile?: Record<string, unknown>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const PersonKYC: React.FC<PersonKYCProps> = ({
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
    const minPersons = entityType ? (MIN_PERSONS[entityType] ?? 1) : 1;
    const primaryRole: PersonRole = entityType ? PRIMARY_PERSON_ROLE[entityType] : 'authorized_person';
    const addPersonLabels: Partial<Record<EntityType, string>> = {
        partnership: t('personKyc.addPartner'),
        llp: t('personKyc.addPartner'),
        pvt_ltd: t('personKyc.addDirector'),
        public_ltd: t('personKyc.addDirector'),
        trust: t('personKyc.addTrustee'),
        society: t('personKyc.addTrustee'),
    };
    const addLabel = entityType ? (addPersonLabels[entityType] || '') : '';
    const requiresAadhaar = entityType ? REQUIRES_AADHAAR[entityType] : false;
    const authorityApplicable = entityType ? AUTHORITY_LETTER_APPLICABLE[entityType] : false;
    const isOptionalKYC = entityType === 'education' || entityType === 'government_psu';

    // ── Persons UI state ──────────────────────────────────────────────────────
    const [persons, setPersons] = useState<PersonUIState[]>(() => {
        // Restore from data.persons if available
        if (data?.persons && data.persons.length > 0) {
            return data.persons.map(p => ({
                fullName: p.fullName,
                panNumber: p.panNumber,
                aadhaarNumber: p.aadhaarNumber || '',
                addressProofType: (p.addressProofType || '') as AddressProofType | '',
                isAuthorizedSignatory: p.isAuthorizedSignatory,
                panSlot: p.panDocPath
                    ? { uploadStatus: 'success', ocrStatus: 'success', ocrProgress: 100, fileName: p.panDocName, filePath: p.panDocPath, fileSize: p.panDocSize, docId: p.panDocId }
                    : { ...EMPTY_DOC_SLOT },
                aadhaarSlot: p.addressProofDocPath && requiresAadhaar
                    ? { uploadStatus: 'success', ocrStatus: 'success', ocrProgress: 100, fileName: p.addressProofDocName, filePath: p.addressProofDocPath, fileSize: p.addressProofDocSize }
                    : { ...EMPTY_DOC_SLOT },
                addressProofSlot: p.addressProofDocPath
                    ? { uploadStatus: 'success', ocrStatus: 'success', ocrProgress: 100, fileName: p.addressProofDocName, filePath: p.addressProofDocPath, fileSize: p.addressProofDocSize, docId: p.addressProofDocId }
                    : { ...EMPTY_DOC_SLOT },
                authorityLetterSlot: p.authorityLetterPath
                    ? { uploadStatus: 'success', ocrStatus: 'idle', ocrProgress: 100, fileName: p.authorityLetterName, filePath: p.authorityLetterPath, docId: p.authorityLetterDocId }
                    : { ...EMPTY_DOC_SLOT },
                panAutoFilled: false,
                aadhaarAutoFilled: false,
                nameAutoFilled: false,
                personId: p.id,
            }));
        }
        // Default: start with minPersons empty slots (min 1)
        const count = Math.max(minPersons, 1);
        return Array.from({ length: count }, () => emptyPersonUI());
    });

    // Authorized signatory toggle
    const [signatoryIsDifferent, setSignatoryIsDifferent] = useState(
        data?.authorizedSignatoryIsDifferent ?? false
    );

    const [saving, setSaving] = useState(false);

    // Sync form fields when chatbot fills data
    useEffect(() => {
        if (!data?.panNumber && !data?.aadhaarNumber) return;
        setPersons(prev => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            updated[0] = {
                ...updated[0],
                panNumber: data.panNumber || updated[0].panNumber,
                aadhaarNumber: data.aadhaarNumber || updated[0].aadhaarNumber,
            };
            return updated;
        });
    }, [data?.panNumber, data?.aadhaarNumber]);

    // ── Pre-fill from Quick Scan results ──────────────────────────────────────
    useEffect(() => {
        if (!data?.scanResults) return;
        const sr = data.scanResults;

        setPersons(prev => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            const p = { ...updated[0] };

            // From PAN card scan
            if (sr.pan) {
                if (sr.pan.name) { p.fullName = sr.pan.name; p.nameAutoFilled = true; }
                if (sr.pan.number) { p.panNumber = sr.pan.number; p.panAutoFilled = true; }
                p.panSlot = {
                    uploadStatus: 'success',
                    ocrStatus: 'success',
                    ocrProgress: 100,
                    fileName: sr.pan.fileName,
                    filePath: sr.pan.filePath,
                };
            }

            // From Aadhaar card scan
            if (sr.aadhaarFront) {
                if (sr.aadhaarFront.name && !p.fullName) { p.fullName = sr.aadhaarFront.name; p.nameAutoFilled = true; }
                if (sr.aadhaarFront.number) { p.aadhaarNumber = sr.aadhaarFront.number; p.aadhaarAutoFilled = true; }
                p.aadhaarSlot = {
                    uploadStatus: 'success',
                    ocrStatus: 'success',
                    ocrProgress: 100,
                    fileName: sr.aadhaarFront.fileName,
                    filePath: sr.aadhaarFront.filePath,
                };
                // Auto-set address proof to Aadhaar
                if (!p.addressProofType) p.addressProofType = 'aadhaar';
                // Set address proof upload as done (reuse Aadhaar file)
                p.addressProofSlot = {
                    uploadStatus: 'success',
                    ocrStatus: 'idle',
                    ocrProgress: 100,
                    fileName: sr.aadhaarFront.fileName,
                    filePath: sr.aadhaarFront.filePath,
                };
            }

            updated[0] = p;
            return updated;
        });
    }, [data?.scanResults]);

    // ── Upload to Supabase Storage ─────────────────────────────────────────────
    const uploadToStorage = useCallback(async (
        file: File,
        folder: string
    ): Promise<string> => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
            throw new Error('Unsupported file type. Use JPG, PNG, WebP, or PDF.');
        }
        if (file.size > 5 * 1024 * 1024) {
            throw new Error('File too large. Maximum size is 5MB.');
        }

        const uploadResult = await api.uploadFile(file);
        if (!uploadResult) throw new Error('Upload failed');
        return uploadResult.url || uploadResult.filePath || uploadResult.path || '';
    }, []);

    // ── Insert into merchant_documents ────────────────────────────────────────
    const insertDocument = useCallback(async (params: {
        filePath: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
        documentType: string;
        docCategory: string;
        personId?: string;
    }): Promise<string | undefined> => {
        const merchantId = merchantProfile?.id as string | undefined;
        if (!merchantId) {
            console.warn('No merchant_id — skipping document insert');
            return undefined;
        }
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
            console.error('Document insert error:', err);
            return undefined;
        }
    }, [merchantProfile?.id]);

    // ── Update a single field on a person ─────────────────────────────────────
    const updatePerson = useCallback((
        index: number,
        updates: Partial<PersonUIState>
    ) => {
        setPersons(prev => prev.map((p, i) => i === index ? { ...p, ...updates } : p));
    }, []);

    // ── Handle PAN upload + OCR ───────────────────────────────────────────────
    const handlePanUpload = useCallback(async (index: number, file: File) => {
        updatePerson(index, {
            panSlot: { uploadStatus: 'uploading', ocrStatus: 'processing', ocrProgress: 10 },
        });

        const [uploadResult, ocrResult] = await Promise.allSettled([
            uploadToStorage(file, 'pan-cards'),
            ocrService.processDocument(file, 'PAN', p =>
                updatePerson(index, { panSlot: { uploadStatus: 'uploading', ocrStatus: 'processing', ocrProgress: p } })
            ),
        ]);

        const finalSlot: DocSlotState = {
            uploadStatus: uploadResult.status === 'fulfilled' ? 'success' : 'failed',
            ocrStatus: ocrResult.status === 'fulfilled' ? 'success' : 'failed',
            ocrProgress: 100,
            fileName: file.name,
            fileSize: file.size,
            filePath: uploadResult.status === 'fulfilled' ? uploadResult.value : undefined,
            uploadError: uploadResult.status === 'rejected' ? String(uploadResult.reason) : undefined,
            ocrError: ocrResult.status === 'rejected' ? String(ocrResult.reason) : undefined,
        };

        // Insert into merchant_documents — person_id will be updated after merchant_persons INSERT
        if (finalSlot.filePath) {
            const docId = await insertDocument({
                filePath: finalSlot.filePath,
                fileName: file.name,
                fileSize: file.size,
                mimeType: file.type,
                documentType: 'pan_card',
                docCategory: 'person_kyc',
                personId: persons[index].personId,
            });
            finalSlot.docId = docId;
        }

        // Apply OCR results
        const updates: Partial<PersonUIState> = { panSlot: finalSlot };
        if (ocrResult.status === 'fulfilled') {
            const ocr = ocrResult.value;
            if (ocr.panNumber) {
                updates.panNumber = ocr.panNumber;
                updates.panAutoFilled = true;
            }
            if (ocr.extractedName && !persons[index].fullName) {
                updates.fullName = ocr.extractedName;
                updates.nameAutoFilled = true;
            }
        }
        updatePerson(index, updates);

        if (finalSlot.uploadStatus === 'success') {
            toast({ title: 'PAN card uploaded', description: ocrResult.status === 'fulfilled' ? 'Details auto-extracted.' : 'Uploaded. Please fill details manually.' });
        } else {
            toast({ variant: 'destructive', title: 'PAN upload failed', description: String(uploadResult.status === 'rejected' ? uploadResult.reason : 'Unknown error') });
        }
    }, [updatePerson, uploadToStorage, insertDocument, persons, toast]);

    // ── Handle Aadhaar upload + OCR ───────────────────────────────────────────
    const handleAadhaarUpload = useCallback(async (index: number, file: File) => {
        updatePerson(index, {
            aadhaarSlot: { uploadStatus: 'uploading', ocrStatus: 'processing', ocrProgress: 10 },
        });

        const [uploadResult, ocrResult] = await Promise.allSettled([
            uploadToStorage(file, 'aadhaar-cards'),
            ocrService.processDocument(file, 'AADHAAR', p =>
                updatePerson(index, { aadhaarSlot: { uploadStatus: 'uploading', ocrStatus: 'processing', ocrProgress: p } })
            ),
        ]);

        const finalSlot: DocSlotState = {
            uploadStatus: uploadResult.status === 'fulfilled' ? 'success' : 'failed',
            ocrStatus: ocrResult.status === 'fulfilled' ? 'success' : 'failed',
            ocrProgress: 100,
            fileName: file.name,
            fileSize: file.size,
            filePath: uploadResult.status === 'fulfilled' ? uploadResult.value : undefined,
            uploadError: uploadResult.status === 'rejected' ? String(uploadResult.reason) : undefined,
        };

        const updates: Partial<PersonUIState> = { aadhaarSlot: finalSlot };
        if (ocrResult.status === 'fulfilled') {
            const ocr = ocrResult.value;
            if (ocr.aadhaarNumber) {
                updates.aadhaarNumber = ocr.aadhaarNumber;
                updates.aadhaarAutoFilled = true;
            }
            if (ocr.extractedName && !persons[index].fullName) {
                updates.fullName = ocr.extractedName;
                updates.nameAutoFilled = true;
            }
        }
        updatePerson(index, updates);

        if (finalSlot.uploadStatus === 'success') {
            toast({ title: 'Aadhaar uploaded', description: ocrResult.status === 'fulfilled' ? 'Details auto-extracted.' : 'Uploaded. Fill details manually.' });
        } else {
            toast({ variant: 'destructive', title: 'Aadhaar upload failed', description: String(uploadResult.status === 'rejected' ? uploadResult.reason : 'Unknown error') });
        }
    }, [updatePerson, uploadToStorage, persons, toast]);

    // ── Handle address proof upload (no OCR) ──────────────────────────────────
    const handleAddressProofUpload = useCallback(async (index: number, file: File) => {
        updatePerson(index, {
            addressProofSlot: { uploadStatus: 'uploading', ocrStatus: 'idle', ocrProgress: 0 },
        });
        try {
            const filePath = await uploadToStorage(file, 'address-proofs');
            const docId = await insertDocument({
                filePath,
                fileName: file.name,
                fileSize: file.size,
                mimeType: file.type,
                documentType: 'address_proof',
                docCategory: 'person_kyc',
                personId: persons[index].personId,
            });
            updatePerson(index, {
                addressProofSlot: {
                    uploadStatus: 'success',
                    ocrStatus: 'idle',
                    ocrProgress: 100,
                    fileName: file.name,
                    fileSize: file.size,
                    filePath,
                    docId,
                },
            });
            toast({ title: 'Address proof uploaded' });
        } catch (err) {
            updatePerson(index, {
                addressProofSlot: {
                    uploadStatus: 'failed',
                    ocrStatus: 'idle',
                    ocrProgress: 0,
                    uploadError: String(err),
                },
            });
            toast({ variant: 'destructive', title: 'Upload failed', description: String(err) });
        }
    }, [updatePerson, uploadToStorage, insertDocument, persons, toast]);

    // ── Handle authority letter upload ────────────────────────────────────────
    const handleAuthorityLetterUpload = useCallback(async (index: number, file: File) => {
        updatePerson(index, {
            authorityLetterSlot: { uploadStatus: 'uploading', ocrStatus: 'idle', ocrProgress: 0 },
        });
        try {
            const filePath = await uploadToStorage(file, 'authority-letters');
            const docId = await insertDocument({
                filePath,
                fileName: file.name,
                fileSize: file.size,
                mimeType: file.type,
                documentType: 'authority_letter',
                docCategory: 'person_kyc',
                personId: persons[index].personId,
            });
            updatePerson(index, {
                authorityLetterSlot: {
                    uploadStatus: 'success',
                    ocrStatus: 'idle',
                    ocrProgress: 100,
                    fileName: file.name,
                    fileSize: file.size,
                    filePath,
                    docId,
                },
            });
            toast({ title: 'Authority letter uploaded' });
        } catch (err) {
            updatePerson(index, {
                authorityLetterSlot: {
                    uploadStatus: 'failed',
                    ocrStatus: 'idle',
                    ocrProgress: 0,
                    uploadError: String(err),
                },
            });
            toast({ variant: 'destructive', title: 'Upload failed', description: String(err) });
        }
    }, [updatePerson, uploadToStorage, insertDocument, persons, toast]);

    // ── Add / remove person ───────────────────────────────────────────────────
    const addPerson = useCallback(() => {
        setPersons(prev => [...prev, emptyPersonUI()]);
    }, []);

    const removePerson = useCallback((index: number) => {
        setPersons(prev => prev.filter((_, i) => i !== index));
    }, []);

    // ── Validation ────────────────────────────────────────────────────────────
    const validate = useCallback((): string | null => {
        if (persons.length < minPersons) {
            return `At least ${minPersons} ${primaryRole}${minPersons > 1 ? 's' : ''} required for this entity type.`;
        }
        for (let i = 0; i < persons.length; i++) {
            const p = persons[i];
            const label = `Person ${i + 1}`;
            if (!isOptionalKYC) {
                if (!p.fullName.trim()) return `${label}: Full name is required`;
                if (!p.panNumber.trim()) return `${label}: PAN number is required`;
                if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p.panNumber.trim())) return `${label}: Invalid PAN format`;
                if (p.panSlot.uploadStatus !== 'success') return `${label}: PAN card upload is required`;
                if (!p.addressProofType) return `${label}: Select address proof type`;
                if (p.addressProofSlot.uploadStatus !== 'success') return `${label}: Address proof upload is required`;
                if (requiresAadhaar && i === 0) {
                    if (!p.aadhaarNumber.trim()) return `${label}: Aadhaar number is required`;
                    if (p.aadhaarSlot.uploadStatus !== 'success') return `${label}: Aadhaar card upload is required`;
                }
            }
        }
        // Check at least one person is marked as signatory (unless using separate signatory)
        if (!signatoryIsDifferent) {
            const hasSignatory = persons.some(p => p.isAuthorizedSignatory);
            if (!hasSignatory && !isOptionalKYC && persons.length > 0) {
                // Auto-set first person as signatory if none selected
            }
        }
        return null;
    }, [persons, minPersons, primaryRole, isOptionalKYC, requiresAadhaar, signatoryIsDifferent]);

    // ── Save merchant_persons and continue ────────────────────────────────────
    const handleContinue = useCallback(async () => {
        const validationError = validate();
        if (validationError) {
            toast({ variant: 'destructive', title: 'Incomplete KYC', description: validationError });
            return;
        }

        setSaving(true);

        try {
            const merchantId = merchantProfile?.id as string | undefined;

            // Auto-set first person as signatory if none selected and not using separate
            let finalPersons = [...persons];
            if (!signatoryIsDifferent && !finalPersons.some(p => p.isAuthorizedSignatory)) {
                finalPersons = finalPersons.map((p, i) => i === 0 ? { ...p, isAuthorizedSignatory: true } : p);
            }

            // Build PersonKYCData array for parent state
            const personKYCData: PersonKYCData[] = finalPersons.map((p, i) => ({
                id: p.personId,
                role: primaryRole,
                fullName: p.fullName.trim(),
                panNumber: p.panNumber.trim().toUpperCase(),
                aadhaarNumber: requiresAadhaar && i === 0 ? p.aadhaarNumber.trim() : undefined,
                addressProofType: p.addressProofType as AddressProofType || undefined,
                isAuthorizedSignatory: p.isAuthorizedSignatory,
                sequenceOrder: i + 1,
                panDocPath: p.panSlot.filePath,
                panDocName: p.panSlot.fileName,
                panDocSize: p.panSlot.fileSize,
                panDocId: p.panSlot.docId,
                addressProofDocPath: p.addressProofSlot.filePath,
                addressProofDocName: p.addressProofSlot.fileName,
                addressProofDocSize: p.addressProofSlot.fileSize,
                addressProofDocId: p.addressProofSlot.docId,
                authorityLetterPath: p.authorityLetterSlot.filePath,
                authorityLetterName: p.authorityLetterSlot.fileName,
                authorityLetterDocId: p.authorityLetterSlot.docId,
            }));

            // Save persons via API
            if (merchantId && personKYCData.length > 0) {
                const status = (merchantProfile as any)?.onboarding_status || (merchantProfile as any)?.onboardingStatus;
                const isEditable = !status || status === 'draft' || status === 'rejected' || status === 'submitted';
                if (isEditable) {
                    try {
                        await api.post('/merchant/profile', {
                            persons: personKYCData.map(p => ({
                                role: p.role,
                                fullName: p.fullName,
                                panNumber: p.panNumber || null,
                                addressProofType: p.addressProofType || null,
                                isAuthorizedSignatory: p.isAuthorizedSignatory,
                                sequenceOrder: p.sequenceOrder,
                            }))
                        });
                    } catch (e: any) {
                        console.error('Failed to save persons:', e);
                    }
                }
            }

            // Update parent onboarding data
            onDataChange?.({
                persons: personKYCData,
                authorizedSignatoryIsDifferent: signatoryIsDifferent,
                // Keep top-level fields in sync for backward compat
                panNumber: personKYCData[0]?.panNumber || '',
                aadhaarNumber: requiresAadhaar ? (personKYCData[0]?.aadhaarNumber || '') : '',
                // Also write to documents map for ReviewSubmit backward compat
                documents: {
                    ...(data?.documents || {}),
                    ...(personKYCData[0]?.panDocPath ? {
                        panCard: {
                            file: new File([], personKYCData[0].panDocName || 'pan.jpg'),
                            path: personKYCData[0].panDocPath,
                        },
                    } : {}),
                    ...(requiresAadhaar && personKYCData[0]?.addressProofDocPath ? {
                        aadhaarCard: {
                            file: new File([], personKYCData[0].addressProofDocName || 'aadhaar.jpg'),
                            path: personKYCData[0].addressProofDocPath,
                        },
                    } : {}),
                },
            });

            onNext?.();
        } catch (err) {
            console.error('Error in PersonKYC handleContinue:', err);
            toast({
                variant: 'destructive',
                title: 'Unexpected error',
                description: 'Please try again.',
            });
        } finally {
            setSaving(false);
        }
    }, [
        validate, persons, primaryRole, requiresAadhaar, signatoryIsDifferent,
        merchantProfile, onDataChange, onNext, data?.documents, toast,
    ]);

    // ── Role label helper ─────────────────────────────────────────────────────
    const getRoleLabel = (index: number): string => {
        const n = String(index + 1);
        const roleMap: Record<PersonRole, string> = {
            proprietor: t('personKyc.roles.proprietor'),
            partner: t('personKyc.roles.partner', { n }),
            director: t('personKyc.roles.director', { n }),
            karta: t('personKyc.roles.karta'),
            trustee: t('personKyc.roles.trustee', { n }),
            authorized_person: t('personKyc.roles.authorized_person'),
            signatory: t('personKyc.roles.signatory'),
        };
        return roleMap[primaryRole] || t('personKyc.roles.person', { n });
    };

    const primaryRoleLabel = getRoleLabel(0).replace(/\s+\d+$/, '');

    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div className="max-w-3xl mx-auto space-y-8 pb-12">

            {/* Header */}
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-foreground">{t('personKyc.title')}</h2>
                <p className="text-muted-foreground text-base">
                    {minPersons > 1
                        ? t('personKyc.subtitleMany', { role: primaryRoleLabel, count: minPersons })
                        : t('personKyc.subtitleOne', { role: primaryRoleLabel })}
                </p>
            </div>

            {/* Info banner for optional KYC */}
            {isOptionalKYC && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
                    <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <p>
                        {t('personKyc.optionalBanner', {
                            entity: entityType === 'education'
                                ? t('personKyc.education')
                                : t('personKyc.governmentPsu'),
                        })}
                    </p>
                </div>
            )}

            {/* Quick Scan complete banner */}
            {data?.scanResults && (data.scanResults.pan || data.scanResults.aadhaarFront) && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
                    <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-green-600" />
                    <div>
                        <p className="font-medium">Quick Scan complete</p>
                        <p className="text-xs text-green-700 mt-0.5">
                            PAN and Aadhaar details auto-filled from your scanned documents.
                            Review and correct if needed.
                        </p>
                    </div>
                </div>
            )}

            {/* Person cards */}
            {persons.map((person, index) => (
                <Card key={index} className="relative">
                    <CardHeader className="pb-4">
                        <CardTitle className="flex items-center justify-between text-base">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                                    {index + 1}
                                </div>
                                {getRoleLabel(index)}
                            </div>
                            {/* Remove button — only if above minimum */}
                            {persons.length > Math.max(minPersons, 1) && index >= minPersons && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removePerson(index)}
                                    className="text-destructive hover:text-destructive h-8 px-2"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}
                        </CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-5">

                        {/* Full name */}
                        <div>
                            <Label className="flex items-center gap-1.5 text-sm">
                                {t('personKyc.fullName')}
                                {!isOptionalKYC && <span className="text-destructive">*</span>}
                                {person.nameAutoFilled && (
                                    <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                                        <Sparkles className="h-3 w-3" /> {t('personKyc.autoFilled')}
                                    </span>
                                )}
                            </Label>
                            <Input
                                value={person.fullName}
                                onChange={e => updatePerson(index, { fullName: e.target.value, nameAutoFilled: false })}
                                placeholder={t('personKyc.placeholderName')}
                                className={`mt-1 ${person.nameAutoFilled ? 'border-green-300 bg-green-50' : ''}`}
                            />
                        </div>

                        {/* PAN */}
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div>
                                <Label className="flex items-center gap-1.5 text-sm">
                                    <CreditCard className="h-3.5 w-3.5" />
                                    {t('personKyc.panNumber')}
                                    {!isOptionalKYC && <span className="text-destructive">*</span>}
                                    {person.panAutoFilled && (
                                        <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                                            <Sparkles className="h-3 w-3" /> {t('personKyc.autoFilled')}
                                        </span>
                                    )}
                                </Label>
                                <Input
                                    value={person.panNumber}
                                    onChange={e => updatePerson(index, {
                                        panNumber: e.target.value.toUpperCase(),
                                        panAutoFilled: false,
                                    })}
                                    placeholder="ABCDE1234F"
                                    maxLength={10}
                                    className={`mt-1 font-mono ${person.panAutoFilled ? 'border-green-300 bg-green-50' : ''}`}
                                />
                            </div>

                            <DocUploadSlot
                                label={t('personKyc.panCard')}
                                required={!isOptionalKYC}
                                slot={person.panSlot}
                                onUpload={f => handlePanUpload(index, f)}
                                accept="image/*"
                                hint={t('personKyc.uploadPanHint')}
                            />
                        </div>

                        {/* Aadhaar — only for first person of proprietorship/individual */}
                        {requiresAadhaar && index === 0 && (
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div>
                                    <Label className="flex items-center gap-1.5 text-sm">
                                        <Shield className="h-3.5 w-3.5" />
                                        {t('personKyc.aadhaarNumber')}
                                        <span className="text-destructive">*</span>
                                        {person.aadhaarAutoFilled && (
                                            <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                                                <Sparkles className="h-3 w-3" /> {t('personKyc.autoFilled')}
                                            </span>
                                        )}
                                    </Label>
                                    <Input
                                        value={person.aadhaarNumber}
                                        onChange={e => updatePerson(index, {
                                            aadhaarNumber: e.target.value,
                                            aadhaarAutoFilled: false,
                                        })}
                                        placeholder={t('personKyc.placeholderAadhaar')}
                                        maxLength={14}
                                        className={`mt-1 font-mono ${person.aadhaarAutoFilled ? 'border-green-300 bg-green-50' : ''}`}
                                    />
                                </div>

                                <DocUploadSlot
                                    label={t('personKyc.aadhaarCard')}
                                    required={true}
                                    slot={person.aadhaarSlot}
                                    onUpload={f => handleAadhaarUpload(index, f)}
                                    accept="image/*"
                                    hint={t('personKyc.uploadAadhaarHint')}
                                />
                            </div>
                        )}

                        {/* Address proof */}
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div>
                                <Label className="text-sm">
                                    {t('personKyc.addressProofType')}
                                    {!isOptionalKYC && <span className="text-destructive ml-1">*</span>}
                                </Label>
                                <Select
                                    value={person.addressProofType}
                                    onValueChange={v => updatePerson(index, { addressProofType: v as AddressProofType })}
                                >
                                    <SelectTrigger className="mt-1">
                                        <SelectValue placeholder={t('personKyc.selectDocType')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="voter_id">{t('personKyc.voterId')}</SelectItem>
                                        <SelectItem value="passport">{t('personKyc.passport')}</SelectItem>
                                        <SelectItem value="driving_license">{t('personKyc.drivingLicense')}</SelectItem>
                                        <SelectItem value="aadhaar">{t('personKyc.aadhaarOption')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <DocUploadSlot
                                label={t('personKyc.addressProofDoc')}
                                required={!isOptionalKYC}
                                slot={person.addressProofSlot}
                                onUpload={f => handleAddressProofUpload(index, f)}
                                hint={person.addressProofType
                                    ? t('personKyc.uploadAddressHint', { type: person.addressProofType.replace(/_/g, ' ') })
                                    : t('personKyc.selectTypeFirst')}
                            />
                        </div>

                        {/* Authority letter — for authorized_person role */}
                        {authorityApplicable && signatoryIsDifferent && index === persons.length - 1 && (
                            <div className="pt-2 border-t border-border">
                                <DocUploadSlot
                                    label={t('personKyc.authorityLetter')}
                                    required={true}
                                    slot={person.authorityLetterSlot}
                                    onUpload={f => handleAuthorityLetterUpload(index, f)}
                                    hint={t('personKyc.authorityHint')}
                                />
                            </div>
                        )}

                        {/* Signatory toggle — only if not using separate signatory */}
                        {!signatoryIsDifferent && persons.length > 1 && (
                            <div className="flex items-center justify-between pt-2 border-t border-border">
                                <div>
                                    <p className="text-sm font-medium">{t('personKyc.authorizedSignatory')}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {t('personKyc.authorizedSignatoryHint')}
                                    </p>
                                </div>
                                <Switch
                                    checked={person.isAuthorizedSignatory}
                                    onCheckedChange={checked => {
                                        // Only one signatory at a time
                                        setPersons(prev => prev.map((p, i) => ({
                                            ...p,
                                            isAuthorizedSignatory: i === index ? checked : (checked ? false : p.isAuthorizedSignatory),
                                        })));
                                    }}
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>
            ))}

            {/* Add person button */}
            {addLabel && (
                <Button
                    variant="outline"
                    onClick={addPerson}
                    className="w-full border-dashed"
                >
                    <Plus className="h-4 w-4 mr-2" />
                    {addLabel}
                </Button>
            )}

            {/* Authorized signatory section */}
            {authorityApplicable && (
                <Card className="border-amber-200 bg-amber-50/50">
                    <CardContent className="pt-5 space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-semibold text-foreground">
                                    {t('personKyc.signatoryDifferent')}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {t('personKyc.signatoryDifferentHint')}
                                </p>
                            </div>
                            <Switch
                                checked={signatoryIsDifferent}
                                onCheckedChange={v => {
                                    setSignatoryIsDifferent(v);
                                    if (v) {
                                        // Add an authorized_person slot at the end
                                        setPersons(prev => [...prev, {
                                            ...emptyPersonUI(),
                                            isAuthorizedSignatory: true,
                                        }]);
                                    } else {
                                        // Remove the last person if it was the authorized_person
                                        setPersons(prev => {
                                            const last = prev[prev.length - 1];
                                            if (last?.isAuthorizedSignatory && prev.length > minPersons) {
                                                return prev.slice(0, -1);
                                            }
                                            return prev;
                                        });
                                    }
                                }}
                            />
                        </div>
                        {signatoryIsDifferent && (
                            <p className="text-xs text-amber-700 flex items-center gap-1.5">
                                <Info className="h-3.5 w-3.5" />
                                {t('personKyc.signatoryAddedHint')}
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Navigation */}
            <div className="flex justify-between items-center pt-2">
                <Button variant="outline" onClick={onPrev} disabled={saving}>
                    {t('common.back')}
                </Button>
                <Button
                    onClick={handleContinue}
                    disabled={saving}
                    className="min-w-[140px]"
                >
                    {saving ? t('common.saving') : t('common.continue')}
                    {!saving && <ChevronRight className="h-4 w-4 ml-1" />}
                </Button>
            </div>
        </div>
    );
};

export default PersonKYC;



