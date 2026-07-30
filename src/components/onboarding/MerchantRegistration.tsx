
// JavaScript source code
import React, { useState, useCallback } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useMerchantData } from '@/hooks/useMerchantData';
import { RaiseTicketButton } from '../RaiseTicketButton';
import { ViewTicketButton } from '../ViewTicketButton';
import { WhatsAppSupportButton } from './WhatsAppSupportButton';
import {
    Upload,
    FileText,
    User,
    Building,
    CheckCircle,
    RefreshCw,
    Sparkles,
    CreditCard,
    Camera,
    AlertTriangle,
    Settings
} from 'lucide-react';

import { api } from '@/lib/rest-api';

interface ExtractedData {
    panNumber?: string;
    aadhaarNumber?: string;
    extractedName?: string;
    dateOfBirth?: string;
    confidence: number;
}

interface DocumentUploadCardProps {
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    file: File | null;
    uploadStatus: 'idle' | 'uploading' | 'success' | 'failed';
    ocrStatus: 'idle' | 'processing' | 'success' | 'failed';
    ocrProgress?: number;
    onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
    description: string;
    uploadError?: string;
    ocrError?: string;
}

interface AutoFillInputProps {
    label: string;
    value: string;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder: string;
    type?: string;
    maxLength?: number;
    required?: boolean;
    isAutoFilled: boolean;
}

interface FormData {
    fullName: string;
    panNumber: string;
    aadhaarNumber: string;
    mobileNumber: string;
    email: string;
    businessName: string;
    gstNumber: string;
    hasGST: boolean;
    documents?: {
        panCard?: { file: File; path: string };
        aadhaarCard?: { file: File; path: string };
        businessProof?: { file: File; path: string };
        bankStatement?: { file: File; path: string };  // ? Registration page
        cancelledCheque?: { file: File; path: string }; // ? Bank Details page
        [key: string]: { file: File; path: string } | undefined;
    };
}

interface MerchantRegistrationProps {
    onNext?: () => void;
    onPrev?: () => void;
    data?: FormData;
    onDataChange?: (data: Partial<FormData>) => void;
}

interface DocumentState {
    file: File | null;
    uploadStatus: 'idle' | 'uploading' | 'success' | 'failed';
    ocrStatus: 'idle' | 'processing' | 'success' | 'failed';
    ocrProgress: number;
    uploadPath?: string;
    uploadError?: string;
    ocrError?: string;
}

// Real OCR Service using OCR.space
// OCR Service using Google Vision API
class RealOCRService {
    private apiKey = import.meta.env.VITE_GOOGLE_VISION_API_KEY || '';
    private endpoint = 'https://vision.googleapis.com/v1/images:annotate';

    private async fileToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
        });
    }

    private detectDocumentType(text: string): 'pan_card' | 'aadhaar_card' | 'unknown' {
        const cleanText = text.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ');

        const panPatterns = [
            /INCOME\s*TAX\s*DEPARTMENT/,
            /PERMANENT\s*ACCOUNT\s*NUMBER/,
            /GOVT?\s*OF\s*INDIA/,
            /PAN/
        ];
        const aadhaarPatterns = [
            /UNIQUE\s*IDENTIFICATION\s*AUTHORITY/,
            /GOVERNMENT\s*OF\s*INDIA/,
            /AADHAAR/,
            /\bUID\b/
        ];

        const panMatches = panPatterns.filter(p => p.test(cleanText)).length;
        const aadhaarMatches = aadhaarPatterns.filter(p => p.test(cleanText)).length;
        const hasPanNumber = /[A-Z]{5}[0-9]{4}[A-Z]{1}/.test(cleanText);
        const hasAadhaarNumber = /[2-9]{1}[0-9]{3}[\s-]?[0-9]{4}[\s-]?[0-9]{4}/.test(cleanText);

        if ((panMatches >= 1 || hasPanNumber) && panMatches >= aadhaarMatches) return 'pan_card';
        if ((aadhaarMatches >= 1 || hasAadhaarNumber) && aadhaarMatches >= panMatches) return 'aadhaar_card';
        return 'unknown';
    }

    private extractPANData(text: string): ExtractedData {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        const cleanText = text.replace(/[^\w\s/-]/g, ' ').replace(/\s+/g, ' ');

        const panMatch = cleanText.match(/[A-Z]{5}[0-9]{4}[A-Z]{1}/);
        const panNumber = panMatch ? panMatch[0] : undefined;

        let dateOfBirth;
        const dobMatch = cleanText.match(/(\d{1,2})[\/\-.] (\d{1,2})[\/\-.](\d{4})/);
        if (dobMatch) dateOfBirth = dobMatch[0];

        const excludeWords = ['INCOME','TAX','DEPARTMENT','GOVT','GOVERNMENT','INDIA','PERMANENT','ACCOUNT','NUMBER','SIGNATURE','PAN'];
        let extractedName;
        let maxScore = 0;
        for (const line of lines) {
            const words = line.toUpperCase().split(/\s+/);
            const hasExcluded = words.some(w => excludeWords.some(e => w.includes(e)));
            const isAllCaps = line === line.toUpperCase();
            const hasLetters = /[A-Z]/.test(line);
            const hasNumbers = /[0-9]/.test(line);
            if (!hasExcluded && isAllCaps && hasLetters && !hasNumbers && line.length > 3) {
                const score = line.length + (words.length * 2);
                if (score > maxScore) { maxScore = score; extractedName = line.trim(); }
            }
        }

        return { panNumber, extractedName, dateOfBirth, confidence: panNumber ? 90 : 40 };
    }

    private extractAadhaarData(text: string): ExtractedData {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        const cleanText = text.replace(/[^\w\s/-]/g, ' ').replace(/\s+/g, ' ');

        let aadhaarNumber;
        for (const pattern of [/[2-9]{1}[0-9]{3}[\s-]?[0-9]{4}[\s-]?[0-9]{4}/, /[2-9][0-9]{11}/]) {
            const match = cleanText.match(pattern);
            if (match) {
                const raw = match[0].replace(/[\s-]/g, '');
                aadhaarNumber = raw.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
                break;
            }
        }

        let dateOfBirth;
        const dobMatch = cleanText.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
        if (dobMatch) dateOfBirth = dobMatch[0];

        const excludeWords = ['UNIQUE','IDENTIFICATION','AUTHORITY','GOVERNMENT','INDIA','AADHAAR','MALE','FEMALE','DOB','VID'];
        let extractedName;
        let maxScore = 0;
        for (const line of lines) {
            const words = line.toUpperCase().split(/\s+/);
            const hasExcluded = words.some(w => excludeWords.some(e => w.includes(e)));
            const isAllCaps = line === line.toUpperCase();
            const hasLetters = /[A-Z]/.test(line);
            const hasNumbers = /[0-9]/.test(line);
            if (!hasExcluded && isAllCaps && hasLetters && !hasNumbers && line.length > 3) {
                const score = line.length + (words.length * 2);
                if (score > maxScore) { maxScore = score; extractedName = line.trim(); }
            }
        }

        return { aadhaarNumber, extractedName, dateOfBirth, confidence: aadhaarNumber ? 90 : 40 };
    }

    async processDocument(
        file: File,
        onProgress?: (progress: number) => void
    ): Promise<ExtractedData> {
        console.log('Starting Google Vision OCR:', file.name);

        if (!this.apiKey) {
            throw new Error('Google Vision API key not configured');
        }

        try {
            onProgress?.(10);
            const base64 = await this.fileToBase64(file);
            onProgress?.(30);

            const docType = file.name.toLowerCase().includes('aadhaar') ? 'aadhaar_card' : 'pan_card';

            const requestBody = {
                requests: [{
                    image: { content: base64.split(',')[1] },
                    features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 50 }],
                    imageContext: {
                        languageHints: docType === 'aadhaar_card' ? ['en', 'hi'] : ['en']
                    }
                }]
            };

            onProgress?.(50);

            const response = await fetch(`${this.endpoint}?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) throw new Error(`Vision API error: ${response.statusText}`);

            const result = await response.json();
            onProgress?.(80);

            if (result.responses[0]?.error) {
                throw new Error(result.responses[0].error.message);
            }

            const extractedText = result.responses[0]?.textAnnotations?.[0]?.description || '';
            console.log('Vision OCR Text:', extractedText);

            const detectedType = this.detectDocumentType(extractedText);
            console.log('Document type detected:', detectedType);

            onProgress?.(100);

            if (detectedType === 'pan_card') return this.extractPANData(extractedText);
            if (detectedType === 'aadhaar_card') return this.extractAadhaarData(extractedText);

            // Fallback: try both and return whichever has data
            const panData = this.extractPANData(extractedText);
            const aadhaarData = this.extractAadhaarData(extractedText);
            if (panData.panNumber) return panData;
            if (aadhaarData.aadhaarNumber) return aadhaarData;

            throw new Error('Document type not recognized');

        } catch (error) {
            console.error('OCR processing error:', error);
            throw error;
        }
    }
}

const ocrService = new RealOCRService();
// ? AutoFillInput Component OUTSIDE MerchantRegistration
const AutoFillInput: React.FC<AutoFillInputProps> = ({
    label,
    value,
    onChange,
    placeholder,
    type = "text",
    maxLength,
    required = false,
    isAutoFilled
}) => {
    return (
        <div>
            <Label className="flex items-center gap-2 mb-2">
                {label} {required && <span className="text-red-500">*</span>}
                {isAutoFilled && (
                    <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                        <Sparkles className="h-3 w-3" />
                        Auto-filled
                    </span>
                )}
            </Label>
            <Input
                type={type}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                maxLength={maxLength}
                className={isAutoFilled ? 'border-green-300 bg-green-50' : ''}
            />
        </div>
    );
};

const MerchantRegistration: React.FC<MerchantRegistrationProps & { merchantProfile?: Record<string, unknown> }> = ({
    onNext,
    onPrev,
    data,
    onDataChange,
    merchantProfile: merchantProfileProp
}) => {
    console.log('?? MerchantRegistration Component Mounted/Updated');
    console.log('   - merchantProfileProp (from DistributorMerchantOnboarding):', merchantProfileProp);
    console.log('   - merchantProfileProp?.user_id:', merchantProfileProp?.user_id);
    console.log('   - merchantProfileProp?.id:', merchantProfileProp?.id);
    
    const { toast } = useToast();
    const { user } = useAuth(); 
    const { merchantProfile: merchantProfileHook } = useMerchantData();
    console.log('   - merchantProfileHook (from useMerchantData):', merchantProfileHook);
    console.log('   - user?.id:', user?.id);
    
    // Prefer prop-provided merchantProfile (for distributor flow) over hook (for regular users)
    const merchantProfile = merchantProfileProp || merchantProfileHook;
    console.log('   - Final merchantProfile being used:', merchantProfile);
    console.log('   - Is this a distributor flow?', !!merchantProfileProp);
    const [formData, setFormData] = useState<FormData>({
        fullName: data?.fullName || '',
        panNumber: data?.panNumber || '',
        aadhaarNumber: data?.aadhaarNumber || '',
        mobileNumber: data?.mobileNumber || '',
        email: data?.email || '',
        businessName: data?.businessName || '',
        gstNumber: data?.gstNumber || '',
        hasGST: data?.hasGST ?? true
    });

    const [panDocument, setPanDocument] = useState<DocumentState>({
        file: null,
        uploadStatus: 'idle',
        ocrStatus: 'idle',
        ocrProgress: 0
    });

    const [aadhaarDocument, setAadhaarDocument] = useState<DocumentState>({
        file: null,
        uploadStatus: 'idle',
        ocrStatus: 'idle',
        ocrProgress: 0
    });

    const [businessProof, setBusinessProof] = useState<File | null>(null);
    const [bankStatement, setBankStatement] = useState<File | null>(null);
    const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set());
    React.useEffect(() => {
        if (data?.documents) {
            // Sync PAN document
            if (data.documents.panCard) {
                setPanDocument({
                    file: data.documents.panCard.file,
                    uploadStatus: 'success',
                    ocrStatus: 'success',
                    ocrProgress: 100,
                    uploadPath: data.documents.panCard.path
                });
            }

            // Sync Aadhaar document
            if (data.documents.aadhaarCard) {
                setAadhaarDocument({
                    file: data.documents.aadhaarCard.file,
                    uploadStatus: 'success',
                    ocrStatus: 'success',
                    ocrProgress: 100,
                    uploadPath: data.documents.aadhaarCard.path
                });
            }

            // Sync Business Proof
            if (data.documents.businessProof) {
                setBusinessProof(data.documents.businessProof.file);
            }

            // Sync Bank Statement
            if (data.documents.bankStatement) {
                setBankStatement(data.documents.bankStatement.file);
            }
        }
    }, [data?.documents]);

    const uploadDocument = async (file: File, documentType: string): Promise<string> => {
    console.log('Uploading document through backend API', { file: file.name, documentType });
    
    // ? CRITICAL FIX FOR DISTRIBUTOR FLOW:
    // For distributor flow: Use the DISTRIBUTOR's (current logged-in) user_id as the storage path
    // For merchant self-onboarding: Use the merchant's user_id (same as auth user)
    // This bypasses RLS issues - the file path owner matches the authenticated user
    // The backend already tracks merchant_id in the database separately
    
    const isDistributorFlow = !!(data as any)?.isDistributorFlow || !!merchantProfileProp;
    const uploadUserId = isDistributorFlow ? user?.id : (merchantProfile?.user_id as string || user?.id);
    
    console.log('?? Determining upload user ID...');
    console.log('   - isDistributorFlow:', isDistributorFlow);
    console.log('   - merchantProfileProp:', !!merchantProfileProp);
    console.log('   - user?.id (authenticated user):', user?.id);
    console.log('   - merchantProfile?.user_id:', merchantProfile?.user_id);
    console.log('   - Final uploadUserId:', uploadUserId);
    console.log('   - Why this uploadUserId?', isDistributorFlow ? 'DISTRIBUTOR (current user)' : 'MERCHANT');
    
    if (!uploadUserId) {
        const errMsg = 'User not authenticated - no uploadUserId available';
        console.error('? ' + errMsg);
        throw new Error(errMsg);
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${documentType}_${Date.now()}.${fileExt}`;
    
    // ? CRITICAL: Path uses authenticated user's ID (distributor or merchant)
    // Keep a stable owner-prefixed path for existing document records.
    const filePath = `${uploadUserId}/${documentType}_${Date.now()}.${file.name.split('.').pop()}`;
    console.log('?? Upload path:', filePath);
    console.log('   - Path owner matches authenticated user?', uploadUserId === user?.id);

    try {
        console.log('   - Authenticated user:', user?.id);
        console.log('   - Upload path user_id:', uploadUserId);
        console.log('   - Are they the same?', user?.id === uploadUserId);
        console.log('   - This is distributor flow:', user?.id !== merchantProfile?.user_id);
        
        const uploadResult = await api.uploadFile(file, filePath);
        const savedPath = uploadResult?.url || uploadResult?.filePath || uploadResult?.path || filePath;

        console.log('Document upload successful:', savedPath);
        return savedPath;
    } catch (err) {
        console.error('? Upload failed with error:', err);
        if (err instanceof Error) {
            console.error('   Error message:', err.message);
            console.error('   Error name:', err.name);
        }
        throw err;
    }
};

    const applyOCRResults = useCallback((result: ExtractedData, docType: 'pan' | 'aadhaar') => {
        const updates: Partial<FormData> = {};
        const newAutoFilled = new Set(autoFilledFields);

        if (docType === 'pan' && result.panNumber) {
            updates.panNumber = result.panNumber;
            newAutoFilled.add('panNumber');
        }

        if (docType === 'aadhaar' && result.aadhaarNumber) {
            updates.aadhaarNumber = result.aadhaarNumber;
            newAutoFilled.add('aadhaarNumber');
        }

        if (result.extractedName && !formData.fullName) {
            updates.fullName = result.extractedName;
            newAutoFilled.add('fullName');
        }

        if (Object.keys(updates).length > 0) {
            setFormData(prev => {
                const newData = { ...prev, ...updates };
                onDataChange?.(newData);
                return newData;
            });
            setAutoFilledFields(newAutoFilled);
        }
    }, [formData.fullName, onDataChange, autoFilledFields]);

    const handlePanUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        console.log('?? handlePanUpload called');
        const file = event.target.files?.[0];
        console.log('?? Selected file:', file?.name, file?.type, file?.size);
        if (!file) {
            console.error('? No file selected');
            return;
        }

        console.log('?? Starting PAN upload process...');
        console.log('?? merchantProfile:', merchantProfile);
        
        setPanDocument({
            file,
            uploadStatus: 'uploading',
            ocrStatus: 'processing',
            ocrProgress: 0
        });

        const uploadPromise = uploadDocument(file, 'pan-cards');
        const ocrPromise = ocrService.processDocument(file, (progress) => {
            setPanDocument(prev => ({ ...prev, ocrProgress: progress }));
        });

        try {
            console.log('? Waiting for upload and OCR to complete...');
            const results = await Promise.allSettled([uploadPromise, ocrPromise]);

            const uploadResult = results[0];
            const ocrResult = results[1];

            console.log('? Upload Promise Result:', uploadResult);
            console.log('? OCR Promise Result:', ocrResult);

            const finalState: DocumentState = {
                file,
                uploadStatus: uploadResult.status === 'fulfilled' ? 'success' : 'failed',
                ocrStatus: ocrResult.status === 'fulfilled' ? 'success' : 'failed',
                ocrProgress: 100
            };

            if (uploadResult.status === 'fulfilled') {
                finalState.uploadPath = uploadResult.value;
                console.log('?? PAN Upload successful, path:', uploadResult.value);

                onDataChange?.({
                    documents: {
                        panCard: { file, path: uploadResult.value }
                    }
                });
                console.log('? PAN card uploaded to:', uploadResult.value);
                
                // Reset file input for next upload
                event.target.value = '';
            } else {
                finalState.uploadError = 'Upload failed';
                console.error('? Upload failed:', uploadResult.reason);
            }

            if (ocrResult.status === 'fulfilled') {
                applyOCRResults(ocrResult.value, 'pan');

                if (uploadResult.status === 'fulfilled') {
                    toast({
                        title: "PAN Card Processed Successfully",
                        description: `File uploaded and data extracted (${ocrResult.value.confidence}% confidence)`,
                    });
                } else {
                    toast({
                        title: "OCR Completed",
                        description: "Data extracted but upload failed. Please try uploading again.",
                        variant: "destructive"
                    });
                }
            } else {
                finalState.ocrError = ocrResult.reason instanceof Error ? ocrResult.reason.message : 'OCR failed';
                console.error('OCR failed:', ocrResult.reason);

                if (uploadResult.status === 'fulfilled') {
                    toast({
                        title: "File Uploaded Successfully",
                        description: "PAN card uploaded but OCR failed. Please enter details manually.",
                        variant: "default"
                    });
                } else {
                    toast({
                        title: "Processing Failed",
                        description: "Both upload and OCR failed. Please try again.",
                        variant: "destructive"
                    });
                }
            }

            setPanDocument(finalState);

        } catch (error) {
            console.error('Unexpected error:', error);
            setPanDocument({
                file,
                uploadStatus: 'failed',
                ocrStatus: 'failed',
                ocrProgress: 0,
                uploadError: 'Unexpected error occurred'
            });
            toast({
                variant: "destructive",
                title: "Processing Failed",
                description: "An unexpected error occurred. Please try again.",
            });
        }
    }, [applyOCRResults, toast, merchantProfile, onDataChange]);

    const handleAadhaarUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        console.log('?? handleAadhaarUpload called');
        const file = event.target.files?.[0];
        console.log('?? Selected file:', file?.name, file?.type, file?.size);
        if (!file) {
            console.error('? No file selected');
            return;
        }

        console.log('?? Starting Aadhaar upload process...');
        console.log('?? merchantProfile:', merchantProfile);

        setAadhaarDocument({
            file,
            uploadStatus: 'uploading',
            ocrStatus: 'processing',
            ocrProgress: 0
        });

        const uploadPromise = uploadDocument(file, 'aadhaar-cards');
        const ocrPromise = ocrService.processDocument(file, (progress) => {
            setAadhaarDocument(prev => ({ ...prev, ocrProgress: progress }));
        });

        try {
            console.log('? Waiting for upload and OCR to complete...');
            const results = await Promise.allSettled([uploadPromise, ocrPromise]);

            const uploadResult = results[0];
            const ocrResult = results[1];

            console.log('? Upload Promise Result:', uploadResult);
            console.log('? OCR Promise Result:', ocrResult);

            const finalState: DocumentState = {
                file,
                uploadStatus: uploadResult.status === 'fulfilled' ? 'success' : 'failed',
                ocrStatus: ocrResult.status === 'fulfilled' ? 'success' : 'failed',
                ocrProgress: 100
            };

            if (uploadResult.status === 'fulfilled') {
                finalState.uploadPath = uploadResult.value;
                console.log('?? Aadhaar Upload successful, path:', uploadResult.value);

                console.log('Aadhaar card uploaded to:', uploadResult.value);
                onDataChange?.({
                    documents: {
                        aadhaarCard: { file, path: uploadResult.value }
                    }
                });
                
                // Reset file input for next upload
                event.target.value = '';
            } else {
                finalState.uploadError = 'Upload failed';
                console.error('? Upload failed:', uploadResult.reason);
            }

            if (ocrResult.status === 'fulfilled') {
                applyOCRResults(ocrResult.value, 'aadhaar');

                if (uploadResult.status === 'fulfilled') {
                    toast({
                        title: "Aadhaar Card Processed Successfully",
                        description: `File uploaded and data extracted (${ocrResult.value.confidence}% confidence)`,
                    });
                } else {
                    toast({
                        title: "OCR Completed",
                        description: "Data extracted but upload failed. Please try uploading again.",
                        variant: "destructive"
                    });
                }
            } else {
                finalState.ocrError = ocrResult.reason instanceof Error ? ocrResult.reason.message : 'OCR failed';
                console.error('OCR failed:', ocrResult.reason);

                if (uploadResult.status === 'fulfilled') {
                    toast({
                        title: "File Uploaded Successfully",
                        description: "Aadhaar card uploaded but OCR failed. Please enter details manually.",
                        variant: "default"
                    });
                } else {
                    toast({
                        title: "Processing Failed",
                        description: "Both upload and OCR failed. Please try again.",
                        variant: "destructive"
                    });
                }
            }

            setAadhaarDocument(finalState);

        } catch (error) {
            console.error('Unexpected error:', error);
            setAadhaarDocument({
                file,
                uploadStatus: 'failed',
                ocrStatus: 'failed',
                ocrProgress: 0,
                uploadError: 'Unexpected error occurred'
            });
            toast({
                variant: "destructive",
                title: "Processing Failed",
                description: "An unexpected error occurred. Please try again.",
            });
        }
    }, [applyOCRResults, toast, merchantProfile, onDataChange]);

    const handleDocUpload = useCallback((docType: 'business' | 'bank') => async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const folder = docType === 'business' ? 'business-proofs' : 'bank-statements';
            const uploadPath = await uploadDocument(file, folder);
            console.log(`${docType} document uploaded to:`, uploadPath);

            if (docType === 'business') {
                setBusinessProof(file);
                onDataChange?.({
                    documents: {
                        businessProof: { file, path: uploadPath }
                    }
                });
            } else {
                setBankStatement(file);
                onDataChange?.({
                    documents: {
                        bankStatement: { file, path: uploadPath }
                    }
                });
            }

            toast({
                title: "Document Uploaded",
                description: `${docType === 'business' ? 'Business proof' : 'Bank statement'} uploaded successfully`,
            });

        } catch (error) {
            console.error('Upload error:', error);
            toast({
                variant: "destructive",
                title: "Upload Failed",
                description: "Failed to upload document",
            });
        }
    }, [toast, merchantProfile, onDataChange]);

    const handleInputChange = useCallback((field: keyof FormData) => (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;

        setFormData(prev => {
            const newData = { ...prev, [field]: value };
            onDataChange?.(newData);
            return newData;
        });

        setAutoFilledFields(prev => {
            const updated = new Set(prev);
            updated.delete(field);
            return updated;
        });
    }, [onDataChange]);

    const handleGSTToggle = useCallback((checked: boolean) => {
        const newData = { ...formData, hasGST: checked, gstNumber: checked ? formData.gstNumber : '' };
        setFormData(newData);
        onDataChange?.(newData);
    }, [formData, onDataChange]);

    const DocumentUploadCard = ({
        title,
        icon: Icon,
        file,
        uploadStatus,
        ocrStatus,
        ocrProgress = 0,
        onUpload,
        description,
        uploadError,
        ocrError
    }: DocumentUploadCardProps) => {
        const fileInputRef = React.useRef<HTMLInputElement>(null);
        const isProcessing = uploadStatus === 'uploading' || ocrStatus === 'processing';

        const handleAreaClick = () => {
            console.log('?? handleAreaClick called, isProcessing:', isProcessing);
            if (isProcessing) {
                console.log('?? Processing in progress, skipping');
                return;
            }
            console.log('?? Clicking file input ref...');
            if (fileInputRef.current) {
                fileInputRef.current.click();
            } else {
                console.error('? fileInputRef.current is null');
            }
        };

        const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            console.log('?? handleFileChange triggered');
            const selectedFile = e.target.files?.[0];
            console.log('Selected file:', selectedFile?.name, selectedFile?.type, selectedFile?.size);
            onUpload(e);
        };

        const getStatusIcon = () => {
            if (uploadStatus === 'failed' || ocrError) {
                return <AlertTriangle className="h-4 w-4 text-red-500 ml-auto" />;
            }
            if (isProcessing) {
                return <RefreshCw className="h-4 w-4 animate-spin text-blue-500 ml-auto" />;
            }
            if (uploadStatus === 'success') {
                return <CheckCircle className="h-4 w-4 text-green-500 ml-auto" />;
            }
            return null;
        };

        const getStatusColor = () => {
            if (uploadStatus === 'failed' || ocrError) return 'border-red-300';
            if (isProcessing) return 'border-blue-300';
            if (uploadStatus === 'success') return 'border-green-300';
            return 'border-gray-300';
        };

        const getBackgroundColor = () => {
            if (uploadStatus === 'failed' || ocrError) return 'bg-red-50';
            if (isProcessing) return 'bg-blue-50';
            if (uploadStatus === 'success') return 'bg-green-50';
            return 'hover:bg-gray-50';
        };

        return (
            <Card className={`relative ${getStatusColor()}`}>
                <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Icon className="h-5 w-5 text-primary" />
                        {title}
                        {getStatusIcon()}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,.pdf"
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                        disabled={isProcessing}
                    />

                    <div
                        onClick={handleAreaClick}
                        className={`
                            flex flex-col items-center justify-center w-full h-32 
                            border-2 border-dashed rounded-lg transition-colors
                            ${isProcessing ? 'cursor-not-allowed' : 'cursor-pointer'}
                            ${getStatusColor()} ${getBackgroundColor()}
                        `}
                    >
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            {isProcessing ? (
                                <RefreshCw className="h-8 w-8 text-blue-500 animate-spin mb-2" />
                            ) : uploadStatus === 'success' ? (
                                <CheckCircle className="h-8 w-8 text-green-500 mb-2" />
                            ) : (uploadStatus === 'failed' || ocrError) ? (
                                <AlertTriangle className="h-8 w-8 text-red-500 mb-2" />
                            ) : (
                                <Upload className="h-8 w-8 text-gray-400 mb-2" />
                            )}

                            <p className="mb-2 text-sm text-gray-500">
                                {isProcessing ? (
                                    <span className="font-semibold">Processing... {Math.round(ocrProgress)}%</span>
                                ) : uploadStatus === 'success' && !ocrError ? (
                                    <span className="font-semibold text-green-600">? {file?.name}</span>
                                ) : uploadStatus === 'success' && ocrError ? (
                                    <span className="font-semibold text-orange-600">? Uploaded (OCR failed)</span>
                                ) : (uploadStatus === 'failed') ? (
                                    <span className="font-semibold text-red-600">Upload failed</span>
                                ) : (
                                    <span className="font-semibold">{description}</span>
                                )}
                            </p>
                        </div>
                    </div>

                    {(ocrStatus === 'processing' || uploadStatus === 'uploading') && (
                        <div className="mt-3">
                            <Progress value={ocrProgress} className="w-full h-2" />
                            <div className="flex justify-between text-xs text-gray-500 mt-1">
                                <span>Upload: {uploadStatus === 'success' ? '?' : uploadStatus}</span>
                                <span>OCR: {ocrProgress}%</span>
                            </div>
                        </div>
                    )}

                    {(uploadError || ocrError) && (
                        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                            {uploadError && <div>Upload: {uploadError}</div>}
                            {ocrError && <div>OCR: {ocrError}</div>}
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-8">
            <div className="text-center">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Merchant Registration</h1>
                <p className="text-gray-600">Upload your documents for automatic data extraction</p>
            </div>

            <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Settings className="h-5 w-5 text-blue-600" />
                            <div>
                                <h4 className="font-semibold text-blue-900">Business Registration Type</h4>
                                <p className="text-sm text-blue-700">Choose your business registration status</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Label className={`text-sm ${!formData.hasGST ? 'font-semibold' : ''}`}>
                                Without GST
                            </Label>
                            <Switch
                                checked={formData.hasGST}
                                onCheckedChange={handleGSTToggle}
                            />
                            <Label className={`text-sm ${formData.hasGST ? 'font-semibold' : ''}`}>
                                With GST
                            </Label>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                    <Camera className="h-5 w-5 text-primary" />
                    Upload Identity Documents
                </h2>
                <div className="grid md:grid-cols-2 gap-6">
                    <DocumentUploadCard
                        title="PAN Card"
                        icon={CreditCard}
                        file={panDocument.file}
                        uploadStatus={panDocument.uploadStatus}
                        ocrStatus={panDocument.ocrStatus}
                        ocrProgress={panDocument.ocrProgress}
                        onUpload={handlePanUpload}
                        description="Upload PAN Card for auto-fill"
                        uploadError={panDocument.uploadError}
                        ocrError={panDocument.ocrError}
                    />

                    <DocumentUploadCard
                        title="Aadhaar Card"
                        icon={CreditCard}
                        file={aadhaarDocument.file}
                        uploadStatus={aadhaarDocument.uploadStatus}
                        ocrStatus={aadhaarDocument.ocrStatus}
                        ocrProgress={aadhaarDocument.ocrProgress}
                        onUpload={handleAadhaarUpload}
                        description="Upload Aadhaar Card for auto-fill"
                        uploadError={aadhaarDocument.uploadError}
                        ocrError={aadhaarDocument.ocrError}
                    />
                </div>
            </div>

            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    Personal & Business Information
                </h2>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <AutoFillInput
                        label="Full Name"
                        value={formData.fullName}
                        onChange={handleInputChange('fullName')}
                        placeholder="Enter your full name"
                        required={true}
                        isAutoFilled={autoFilledFields.has('fullName')}
                    />

                    <AutoFillInput
                        label="PAN Number"
                        value={formData.panNumber}
                        onChange={handleInputChange('panNumber')}
                        placeholder="ABCDE1234F"
                        maxLength={10}
                        required={true}
                        isAutoFilled={autoFilledFields.has('panNumber')}
                    />

                    <AutoFillInput
                        label="Aadhaar Number"
                        value={formData.aadhaarNumber}
                        onChange={handleInputChange('aadhaarNumber')}
                        placeholder="1234 5678 9012"
                        maxLength={14}
                        required={true}
                        isAutoFilled={autoFilledFields.has('aadhaarNumber')}
                    />

                    <AutoFillInput
                        label="Mobile Number"
                        value={formData.mobileNumber}
                        onChange={handleInputChange('mobileNumber')}
                        placeholder="+91 9876543210"
                        maxLength={10}
                        required={true}
                        isAutoFilled={autoFilledFields.has('mobileNumber')}
                    />

                    <AutoFillInput
                        label="Email Address"
                        value={formData.email}
                        onChange={handleInputChange('email')}
                        type="email"
                        placeholder="merchant@example.com"
                        required={true}
                        isAutoFilled={autoFilledFields.has('email')}
                    />

                    <AutoFillInput
                        label="Business Name"
                        value={formData.businessName}
                        onChange={handleInputChange('businessName')}
                        placeholder="Enter business name"
                        required={true}
                        isAutoFilled={autoFilledFields.has('businessName')}
                    />

                    {formData.hasGST && (
                        <AutoFillInput
                            label="GST Number"
                            value={formData.gstNumber}
                            onChange={handleInputChange('gstNumber')}
                            placeholder="22AAAAA0000A1Z5"
                            maxLength={15}
                            required={true}
                            isAutoFilled={autoFilledFields.has('gstNumber')}
                        />
                    )}
                </div>
            </div>

            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Supporting Documents
                </h2>
                <div className="grid md:grid-cols-2 gap-6">
                    <DocumentUploadCard
                        title="Business Proof"
                        icon={Building}
                        file={businessProof}
                        uploadStatus={businessProof ? 'success' : 'idle'}
                        ocrStatus="idle"
                        onUpload={handleDocUpload('business')}
                        description="Business registration certificate"
                    />

                    <DocumentUploadCard
                        title="Bank Statement"
                        icon={FileText}
                        file={bankStatement}
                        uploadStatus={bankStatement ? 'success' : 'idle'}
                        ocrStatus="idle"
                        onUpload={handleDocUpload('bank')}
                        description="Recent bank statement"
                    />
                </div>
            </div>

            {(panDocument.ocrStatus === 'processing' || aadhaarDocument.ocrStatus === 'processing') && (
                <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                            <span className="text-blue-800 font-medium">
                                Processing documents with OCR.space API...
                            </span>
                        </div>
                        <p className="text-blue-700 text-sm">
                            Files are uploaded to secure storage while OCR extracts data. Form fields will be auto-filled when complete.
                        </p>
                    </CardContent>
                </Card>
            )}

            {(autoFilledFields.size > 0) && panDocument.ocrStatus !== 'processing' && aadhaarDocument.ocrStatus !== 'processing' && (
                <Card className="bg-green-50 border-green-200">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="text-green-800 font-medium">
                                Success! {autoFilledFields.size} field(s) have been auto-filled from your documents.
                            </span>
                        </div>
                        <p className="text-green-700 text-sm mt-1">
                            Please review the auto-filled information and make any necessary corrections.
                        </p>
                    </CardContent>
                </Card>
            )}

            <Card className="bg-gray-50">
                <CardContent className="p-4">
                    <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Tips for Better OCR Results
                    </h4>
                    <ul className="text-sm text-gray-600 space-y-1">
                        <li>� Clear photos: Ensure good lighting and avoid shadows</li>
                        <li>� Flat documents: Keep documents flat without wrinkles or folds</li>
                        <li>� High resolution: Use high-quality images when possible</li>
                        <li>� Crop properly: Make sure the entire document is visible</li>
                        <li>� File size: Images are automatically resized to under 2MB for processing</li>
                        <li>� Storage: All documents are securely uploaded to Supabase storage immediately</li>
                    </ul>
                </CardContent>
            </Card>

            <div className="flex justify-between pt-6">
                <Button variant="outline" className="px-8" onClick={onPrev}>
                    Back
                </Button>
                <div className="flex gap-2">
                    <ViewTicketButton />
                    <RaiseTicketButton
                        module="merchant_onboarding"
                        referenceId={merchantProfile?.id as string}
                    />
                </div>
                <Button
                    className="px-8"
                    onClick={onNext}
                    disabled={
                        !formData.fullName ||
                        !formData.panNumber ||
                        !formData.aadhaarNumber ||
                        !formData.mobileNumber ||
                        !formData.email ||
                        !formData.businessName ||
                        (formData.hasGST && !formData.gstNumber) ||
                        panDocument.uploadStatus !== 'success' ||
                        aadhaarDocument.uploadStatus !== 'success' ||
                        !businessProof
                    }
                    
                >
                 
                    Continue to KYC
                </Button>
            </div>
            {/* WhatsApp Support (bottom of onboarding step) */}
            <div style={{marginTop: '2rem', textAlign: 'center'}}>
              <WhatsAppSupportButton />
              </div>
        </div>
    );
};

export default MerchantRegistration;



