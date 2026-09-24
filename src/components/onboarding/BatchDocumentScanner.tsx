import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/rest-api';
import { authService } from '@/lib/auth-service';
import { ScanResults, ScanResult, EntityType } from '@/types/onboarding';
import {
    Camera,
    CheckCircle,
    AlertTriangle,
    RefreshCw,
    Upload,
    X,
    Zap,
    CreditCard,
    Shield,
    FileText,
    Landmark,
    MapPin,
} from 'lucide-react';

// ─── OCR Service ────────────────────────────────────────────────────────────

const API_URL = import.meta.env.VITE_API_URL || '';

interface OcrResponse {
    success: boolean;
    data?: {
        panNumber?: string;
        aadhaarNumber?: string;
        extractedName?: string;
        dateOfBirth?: string;
        gstNumber?: string;
        businessName?: string;
        entityType?: string;
        stateCode?: string;
        state?: string;
        ifscCode?: string;
        accountNumber?: string;
        bankName?: string;
        branchName?: string;
        accountHolderName?: string;
        address?: string;
        addressLine1?: string;
        city?: string;
        pincode?: string;
        confidence?: number;
    };
    error?: { message?: string };
}

async function callOcr(file: File, docType: string): Promise<OcrResponse> {
    const formData = new FormData();
    formData.append('doc_front_image', file);
    formData.append('doc_type', docType);
    const token = authService.getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(`${API_URL}/api/kyc/ocr`, {
        method: 'POST',
        headers,
        body: formData,
    });
    if (!response.ok) throw new Error(`OCR error: ${response.statusText}`);
    return response.json();
}

async function uploadFile(file: File): Promise<{ url: string }> {
    return api.uploadFile(file);
}

// ─── Slot State ──────────────────────────────────────────────────────────────

interface SlotState {
    status: 'idle' | 'uploading' | 'ocr' | 'success' | 'failed';
    progress: number;
    fileName?: string;
    filePath?: string;
    ocrData?: OcrResponse['data'];
    error?: string;
}

const EMPTY_SLOT: SlotState = { status: 'idle', progress: 0 };

// ─── Slot Definition ─────────────────────────────────────────────────────────

interface SlotDef {
    key: keyof ScanResults;
    label: string;
    icon: React.ReactNode;
    docType: string;
    required: boolean;
    hint: string;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface BatchDocumentScannerProps {
    entityType: EntityType;
    requiresAadhaar: boolean;
    requiresGst: boolean;
    onComplete: (scanResults: ScanResults) => void;
    onClose: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const BatchDocumentScanner: React.FC<BatchDocumentScannerProps> = ({
    entityType,
    requiresAadhaar,
    requiresGst,
    onComplete,
    onClose,
}) => {
    const { toast } = useToast();

    const slots: SlotDef[] = [
        {
            key: 'pan',
            label: 'PAN Card (Front)',
            icon: <CreditCard className="h-5 w-5" />,
            docType: 'PAN',
            required: true,
            hint: 'Photograph the front of your PAN card',
        },
        ...(requiresAadhaar
            ? [
                  {
                      key: 'aadhaarFront' as keyof ScanResults,
                      label: 'Aadhaar Card (Front)',
                      icon: <Shield className="h-5 w-5" />,
                      docType: 'AADHAAR',
                      required: true,
                      hint: 'Photograph the front of your Aadhaar card',
                  },
                  {
                      key: 'aadhaarBack' as keyof ScanResults,
                      label: 'Aadhaar Card (Back)',
                      icon: <MapPin className="h-5 w-5" />,
                      docType: 'AADHAAR_BACK',
                      required: true,
                      hint: 'Photograph the back — we extract your address',
                  },
              ]
            : []),
        ...(requiresGst
            ? [
                  {
                      key: 'gst' as keyof ScanResults,
                      label: 'GST Certificate',
                      icon: <FileText className="h-5 w-5" />,
                      docType: 'GST',
                      required: true,
                      hint: 'Photograph your GST registration certificate',
                  },
              ]
            : []),
        {
            key: 'cheque',
            label: 'Cancelled Cheque',
            icon: <Landmark className="h-5 w-5" />,
            docType: 'CHEQUE',
            required: true,
            hint: 'Photograph a cancelled cheque for bank details',
        },
        {
            key: 'addressProof',
            label: 'Address Proof',
            icon: <MapPin className="h-5 w-5" />,
            docType: '',
            required: false,
            hint: 'Electricity bill, water bill, or rent agreement',
        },
    ];

    const [slotStates, setSlotStates] = useState<Record<string, SlotState>>(() => {
        const initial: Record<string, SlotState> = {};
        for (const slot of slots) {
            initial[slot.key] = { ...EMPTY_SLOT };
        }
        return initial;
    });

    const inputRefs = useRef<Record<string, HTMLInputElement>>({});

    const updateSlot = useCallback((key: string, updates: Partial<SlotState>) => {
        setSlotStates(prev => ({
            ...prev,
            [key]: { ...prev[key], ...updates },
        }));
    }, []);

    const handleUpload = useCallback(async (slot: SlotDef, file: File) => {
        updateSlot(slot.key, { status: 'uploading', progress: 10, error: undefined });

        try {
            // Upload file
            const uploadResult = await uploadFile(file);
            updateSlot(slot.key, { progress: 40, filePath: uploadResult.url, fileName: file.name });

            // Run OCR if applicable
            if (slot.docType) {
                updateSlot(slot.key, { status: 'ocr', progress: 50 });
                try {
                    const ocrResponse = await callOcr(file, slot.docType);
                    if (ocrResponse.success && ocrResponse.data) {
                        updateSlot(slot.key, {
                            status: 'success',
                            progress: 100,
                            ocrData: ocrResponse.data,
                        });
                    } else {
                        updateSlot(slot.key, {
                            status: 'success',
                            progress: 100,
                            ocrData: undefined,
                            error: 'Upload successful but OCR extraction failed',
                        });
                    }
                } catch {
                    updateSlot(slot.key, {
                        status: 'success',
                        progress: 100,
                        ocrData: undefined,
                        error: 'Upload successful but OCR extraction failed',
                    });
                }
            } else {
                // No OCR (address proof)
                updateSlot(slot.key, {
                    status: 'success',
                    progress: 100,
                });
            }
        } catch (err) {
            updateSlot(slot.key, {
                status: 'failed',
                progress: 0,
                error: String(err),
            });
        }
    }, [updateSlot]);

    const handleFileChange = useCallback((slot: SlotDef, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleUpload(slot, file);
            e.target.value = '';
        }
    }, [handleUpload]);

    const buildScanResults = useCallback((): ScanResults => {
        const results: ScanResults = {};

        const pan = slotStates.pan;
        if (pan?.status === 'success' && pan.filePath) {
            results.pan = {
                name: pan.ocrData?.extractedName,
                number: pan.ocrData?.panNumber || '',
                filePath: pan.filePath,
                fileName: pan.fileName || '',
            };
        }

        const aadhaarF = slotStates.aadhaarFront;
        if (aadhaarF?.status === 'success' && aadhaarF.filePath) {
            results.aadhaarFront = {
                name: aadhaarF.ocrData?.extractedName,
                number: aadhaarF.ocrData?.aadhaarNumber || '',
                filePath: aadhaarF.filePath,
                fileName: aadhaarF.fileName || '',
            };
        }

        const aadhaarB = slotStates.aadhaarBack;
        if (aadhaarB?.status === 'success' && aadhaarB.filePath) {
            results.aadhaarBack = {
                name: aadhaarB.ocrData?.extractedName,
                number: aadhaarB.ocrData?.aadhaarNumber || '',
                filePath: aadhaarB.filePath,
                fileName: aadhaarB.fileName || '',
                addressLine1: aadhaarB.ocrData?.addressLine1,
                city: aadhaarB.ocrData?.city,
                state: aadhaarB.ocrData?.state,
                pincode: aadhaarB.ocrData?.pincode,
            };
        }

        const gst = slotStates.gst;
        if (gst?.status === 'success' && gst.filePath) {
            results.gst = {
                name: gst.ocrData?.businessName,
                number: gst.ocrData?.gstNumber || '',
                filePath: gst.filePath,
                fileName: gst.fileName || '',
                businessName: gst.ocrData?.businessName,
                entityType: gst.ocrData?.entityType,
                stateCode: gst.ocrData?.stateCode,
                state: gst.ocrData?.state,
            };
        }

        const cheque = slotStates.cheque;
        if (cheque?.status === 'success' && cheque.filePath) {
            results.cheque = {
                name: cheque.ocrData?.accountHolderName,
                number: cheque.ocrData?.accountNumber || '',
                filePath: cheque.filePath,
                fileName: cheque.fileName || '',
                ifscCode: cheque.ocrData?.ifscCode,
                bankName: cheque.ocrData?.bankName,
                branchName: cheque.ocrData?.branchName,
                accountHolderName: cheque.ocrData?.accountHolderName,
            };
        }

        const addrProof = slotStates.addressProof;
        if (addrProof?.status === 'success' && addrProof.filePath) {
            results.addressProof = {
                name: 'Address Proof',
                number: '',
                filePath: addrProof.filePath,
                fileName: addrProof.fileName || '',
            };
        }

        return results;
    }, [slotStates]);

    const requiredSlots = slots.filter(s => s.required);
    const completedRequired = requiredSlots.filter(
        s => slotStates[s.key]?.status === 'success'
    ).length;
    const allRequiredDone = completedRequired === requiredSlots.length;

    const handleDone = useCallback(() => {
        const results = buildScanResults();
        onComplete(results);
        toast({
            title: 'Documents scanned',
            description: `${completedRequired} documents scanned successfully. Forms will be auto-filled.`,
        });
    }, [buildScanResults, onComplete, completedRequired, toast]);

    const handleSkip = useCallback(() => {
        const results = buildScanResults();
        onComplete(results);
    }, [buildScanResults, onComplete]);

    return (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white border-b border-border px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-bold text-foreground">Quick Scan</h2>
                </div>
                <Button variant="ghost" size="sm" onClick={onClose}>
                    <X className="h-5 w-5" />
                </Button>
            </div>

            <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
                {/* Progress */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                            {completedRequired} of {requiredSlots.length} required documents
                        </span>
                        <span className="font-medium text-primary">
                            {Math.round((completedRequired / requiredSlots.length) * 100)}%
                        </span>
                    </div>
                    <Progress
                        value={(completedRequired / requiredSlots.length) * 100}
                        className="h-2"
                    />
                </div>

                {/* Info */}
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
                    <p className="font-medium">How it works</p>
                    <p className="text-xs text-blue-700 mt-1">
                        Photograph each document. We'll extract details and auto-fill your forms.
                        You can skip non-required documents.
                    </p>
                </div>

                {/* Upload Slots */}
                {slots.map(slot => {
                    const state = slotStates[slot.key];
                    const isProcessing = state?.status === 'uploading' || state?.status === 'ocr';
                    const isSuccess = state?.status === 'success';
                    const isFailed = state?.status === 'failed';

                    return (
                        <Card
                            key={slot.key}
                            className={`transition-all ${
                                isSuccess
                                    ? 'border-green-300 bg-green-50'
                                    : isFailed
                                    ? 'border-red-300 bg-red-50'
                                    : isProcessing
                                    ? 'border-blue-200 bg-blue-50'
                                    : ''
                            }`}
                        >
                            <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                    {/* Icon */}
                                    <div
                                        className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                            isSuccess
                                                ? 'bg-green-100 text-green-600'
                                                : isFailed
                                                ? 'bg-red-100 text-red-600'
                                                : isProcessing
                                                ? 'bg-blue-100 text-blue-600'
                                                : 'bg-muted text-muted-foreground'
                                        }`}
                                    >
                                        {isProcessing ? (
                                            <RefreshCw className="h-5 w-5 animate-spin" />
                                        ) : isSuccess ? (
                                            <CheckCircle className="h-5 w-5" />
                                        ) : isFailed ? (
                                            <AlertTriangle className="h-5 w-5" />
                                        ) : (
                                            slot.icon
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium text-foreground">
                                                {slot.label}
                                            </p>
                                            {slot.required && (
                                                <span className="text-xs text-destructive font-medium">
                                                    Required
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {slot.hint}
                                        </p>

                                        {/* Status */}
                                        {isProcessing && (
                                            <div className="mt-2 space-y-1">
                                                <Progress value={state.progress} className="h-1.5" />
                                                <p className="text-xs text-blue-600">
                                                    {state.status === 'uploading'
                                                        ? 'Uploading...'
                                                        : 'Extracting details...'}
                                                </p>
                                            </div>
                                        )}

                                        {isSuccess && state.ocrData && (
                                            <div className="mt-2 p-2 rounded bg-green-100 text-xs text-green-800 space-y-0.5">
                                                {state.ocrData.extractedName && (
                                                    <p>Name: <span className="font-medium">{state.ocrData.extractedName}</span></p>
                                                )}
                                                {state.ocrData.panNumber && (
                                                    <p>PAN: <span className="font-medium font-mono">{state.ocrData.panNumber}</span></p>
                                                )}
                                                {state.ocrData.aadhaarNumber && (
                                                    <p>Aadhaar: <span className="font-medium font-mono">{state.ocrData.aadhaarNumber}</span></p>
                                                )}
                                                {state.ocrData.gstNumber && (
                                                    <p>GST: <span className="font-medium font-mono">{state.ocrData.gstNumber}</span></p>
                                                )}
                                                {state.ocrData.businessName && (
                                                    <p>Business: <span className="font-medium">{state.ocrData.businessName}</span></p>
                                                )}
                                                {state.ocrData.ifscCode && (
                                                    <p>IFSC: <span className="font-medium font-mono">{state.ocrData.ifscCode}</span></p>
                                                )}
                                                {state.ocrData.accountNumber && (
                                                    <p>Account: <span className="font-medium font-mono">{state.ocrData.accountNumber}</span></p>
                                                )}
                                                {state.ocrData.bankName && (
                                                    <p>Bank: <span className="font-medium">{state.ocrData.bankName}</span></p>
                                                )}
                                                {state.ocrData.addressLine1 && (
                                                    <p>Address: <span className="font-medium">{state.ocrData.addressLine1}</span></p>
                                                )}
                                                {state.ocrData.city && (
                                                    <p>City: <span className="font-medium">{state.ocrData.city}</span></p>
                                                )}
                                                {state.ocrData.state && (
                                                    <p>State: <span className="font-medium">{state.ocrData.state}</span></p>
                                                )}
                                                {state.ocrData.pincode && (
                                                    <p>Pincode: <span className="font-medium">{state.ocrData.pincode}</span></p>
                                                )}
                                            </div>
                                        )}

                                        {isSuccess && !state.ocrData && (
                                            <p className="mt-1 text-xs text-green-600">
                                                Uploaded successfully
                                            </p>
                                        )}

                                        {isFailed && (
                                            <p className="mt-1 text-xs text-red-600">
                                                {state.error || 'Upload failed'}
                                            </p>
                                        )}

                                        {state?.error && isSuccess && (
                                            <p className="mt-1 text-xs text-amber-600">
                                                {state.error}
                                            </p>
                                        )}
                                    </div>

                                    {/* Upload Button */}
                                    {!isProcessing && !isSuccess && (
                                        <div>
                                            <input
                                                ref={el => {
                                                    if (el) inputRefs.current[slot.key] = el;
                                                }}
                                                type="file"
                                                accept="image/*"
                                                capture="environment"
                                                className="hidden"
                                                onChange={e => handleFileChange(slot, e)}
                                            />
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => inputRefs.current[slot.key]?.click()}
                                            >
                                                <Camera className="h-4 w-4 mr-1" />
                                                Scan
                                            </Button>
                                        </div>
                                    )}

                                    {isSuccess && (
                                        <div>
                                            <input
                                                ref={el => {
                                                    if (el) inputRefs.current[slot.key] = el;
                                                }}
                                                type="file"
                                                accept="image/*"
                                                capture="environment"
                                                className="hidden"
                                                onChange={e => handleFileChange(slot, e)}
                                            />
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => inputRefs.current[slot.key]?.click()}
                                            >
                                                Retake
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}

                {/* Action Buttons */}
                <div className="sticky bottom-0 bg-white border-t border-border pt-4 pb-6 space-y-3">
                    <Button
                        onClick={handleDone}
                        disabled={!allRequiredDone}
                        className="w-full"
                        size="lg"
                    >
                        <CheckCircle className="h-5 w-5 mr-2" />
                        {allRequiredDone
                            ? `Continue with ${completedRequired} documents`
                            : `Upload ${requiredSlots.length - completedRequired} more required documents`}
                    </Button>
                    <Button
                        onClick={handleSkip}
                        variant="ghost"
                        className="w-full"
                    >
                        Skip — fill manually
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default BatchDocumentScanner;
