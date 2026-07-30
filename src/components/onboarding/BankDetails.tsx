import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle, AlertCircle, Loader2, CreditCard, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useBankValidation } from '@/hooks/useBankValidation';
import { useMerchantData } from '@/hooks/useMerchantData';
import { useAuth } from '@/components/auth/AuthProvider'; // ✅ NEW
import { authService } from '@/lib/auth-service';
import { api } from '@/lib/rest-api';
import { OnboardingData } from '@/types/onboarding';
import { RaiseTicketButton } from "@/components/RaiseTicketButton";
import { ViewTicketButton } from "@/components/ViewTicketButton";
import { useNavigate } from "react-router-dom";
import { WhatsAppSupportButton } from './WhatsAppSupportButton';
import { useI18n } from '@/i18n/I18nProvider';
export interface BankDetailsData {
    accountNumber: string;      // Remove '?'
    confirmAccountNumber: string; // Remove '?'
    ifscCode: string;           // Remove '?'
    bankName: string;           // Remove '?'
    accountHolderName: string;
}

interface BankDetailsProps {
    onNext: () => void;
    onPrev: () => void;
    data?: OnboardingData;
    onDataChange?: (data: Partial<OnboardingData>) => void;
    merchantProfile?: Record<string, unknown>; // ✅ NEW: Optional prop for distributor flow
}

export const BankDetails: React.FC<BankDetailsProps> = ({
    onNext,
    onPrev,
    data,
    onDataChange,
    merchantProfile: merchantProfileProp // ✅ NEW: Accept prop from parent
}) => {
    const { toast } = useToast();
    const { t } = useI18n();
    const { user } = useAuth(); // ✅ NEW: Get authenticated user
    const { saveBankDetails, merchantProfile: merchantProfileHook } = useMerchantData();
    const navigate = useNavigate();
    
    // ✅ NEW: Prefer prop (distributor flow) over hook (regular flow)
    const merchantProfile = merchantProfileProp || merchantProfileHook;
    
    const {
        validateIfscCode,
        validateAccountNumber,
        getIFSCValidationStatus,
        getIFSCMessage,
        getIFSCMessageColor,
        isValidatingIfsc,
        ifscValidation
    } = useBankValidation();

    // Form state - initialize from parent data
    const [formData, setFormData] = useState<BankDetailsData>({
        ifscCode: data?.bankDetails?.ifscCode || '',
        accountNumber: data?.bankDetails?.accountNumber || '',
        confirmAccountNumber: data?.bankDetails?.confirmAccountNumber || '',
        accountHolderName: data?.bankDetails?.accountHolderName || '',
        bankName: data?.bankDetails?.bankName || ''
    });

    const [cancelledCheque, setCancelledCheque] = useState<File | null>(
        data?.documents?.cancelledCheque?.file || null
    );
    const [errors, setErrors] = useState<Partial<Record<keyof BankDetailsData | 'cancelledCheque', string>>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidatingAccount, setIsValidatingAccount] = useState(false);
  const [accountValidation, setAccountValidation] = useState<{
    isValid: boolean;
    accountName?: string;
    error?: string;
  }>({ isValid: false });

    // Sync form fields when chatbot fills data
    useEffect(() => {
        if (!data?.bankDetails) return;
        setFormData(prev => ({
            ...prev,
            ifscCode: data.bankDetails?.ifscCode || prev.ifscCode,
            accountNumber: data.bankDetails?.accountNumber || prev.accountNumber,
            confirmAccountNumber: data.bankDetails?.confirmAccountNumber || prev.confirmAccountNumber,
            accountHolderName: data.bankDetails?.accountHolderName || prev.accountHolderName,
            bankName: data.bankDetails?.bankName || prev.bankName,
        }));
    }, [data?.bankDetails]);
     const clearError = (field: keyof BankDetailsData | 'cancelledCheque') => {
        setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[field];
            return newErrors;
        });
    };

    

    // Handle input changes and update parent immediately
    const handleInputChange = (field: keyof BankDetailsData) => (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        const value = e.target.value;
        let processedValue = value;

        // Special handling for IFSC code
        if (field === 'ifscCode') {
            processedValue = value.trim().toUpperCase();
        }

        const newFormData: BankDetailsData = { ...formData, [field]: processedValue };
        setFormData(newFormData);
        clearError(field);

        if (field === 'accountNumber' || field === 'ifscCode') {
            setAccountValidation({ isValid: false });
        }

        // ✅ UPDATE PARENT IMMEDIATELY
        if (onDataChange) {
            onDataChange({
                bankDetails: newFormData
            });
        }
    };

    // Auto-validate Account Number via Backend API (Secure - No sensitive data in frontend)
    useEffect(() => {
        const accountNumber = formData.accountNumber.trim();
        const ifscCode = formData.ifscCode.trim();

        if (
  accountNumber.length < 9 ||
  !ifscCode ||
  ifscCode.length !== 11 ||
  !formData.accountHolderName.trim()
) {
            setAccountValidation({ isValid: false });
            return;
        }

        const timeoutId = setTimeout(async () => {
            setIsValidatingAccount(true);
            try {
                // Call secure backend API for validation
                const token = authService.getToken();
                if (!token) {
                    throw new Error('Not authenticated');
                }

                const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
                const response = await fetch(`${API_URL}/api/merchant/validate-bank-account`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        custName: formData.accountHolderName,
                        custIfsc: ifscCode,
                        custAcctNo: accountNumber,
                    }),
                });

                let errorMsg = 'Account validation failed';
                if (!response.ok) {
                    try {
                        const errBody = await response.json();
                        errorMsg = errBody?.error?.message || errBody?.message || `HTTP ${response.status}`;
                    } catch {
                        errorMsg = `HTTP ${response.status} ${response.statusText}`;
                    }
                    throw new Error(errorMsg);
                }

                const result = await response.json();

                if (result.success && result.data?.isValid) {
                    setAccountValidation({
                        isValid: true,
                        accountName: result.data.accountName,
                    });
                    clearError('accountNumber');
                } else {
                    setAccountValidation({
                        isValid: false,
                        error: result.data?.error || result.data?.message || 'Account validation failed',
                    });
                }
            } catch (error) {
                const msg = error instanceof Error ? error.message : 'Validation service unavailable';
                setAccountValidation({
                    isValid: false,
                    error: msg,
                });
            } finally {
                setIsValidatingAccount(false);
            }
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [formData.accountNumber, formData.ifscCode, formData.accountHolderName]);

    // Auto-validate IFSC when it's complete
    useEffect(() => {
        const ifscCode = formData.ifscCode.trim();

        if (ifscCode.length === 11) {
            const timeoutId = setTimeout(async () => {
                try {
                    const result = await validateIfscCode(ifscCode);
                    if (!result.isValid && result.error) {
                        setErrors(prev => ({ ...prev, ifscCode: result.error }));
                    } else {
                        clearError('ifscCode');
                        // Update bank name from validation
                        if (result.bankName) {
                            const newFormData: BankDetailsData = { ...formData, bankName: result.bankName };
                            setFormData(newFormData);
                            if (onDataChange) {
                                onDataChange({ bankDetails: newFormData });
                            }
                        }
                    }
                } catch (error) {
                    console.error('IFSC validation failed:', error);
                }
            }, 500);

            return () => clearTimeout(timeoutId);
        }
    }, [formData.ifscCode]);

    // FIXED: Upload file and update parent state
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file
        const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
        const maxSize = 5 * 1024 * 1024; // 5MB

        if (!validTypes.includes(file.type)) {
            toast({
                variant: "destructive",
                title: "Invalid File Type",
                description: "Please upload a JPG, PNG, or PDF file.",
            });
            return;
        }

        if (file.size > maxSize) {
            toast({
                variant: "destructive",
                title: "File Too Large",
                description: "Please upload a file smaller than 5MB.",
            });
            return;
        }

        try {
            const user = authService.getUser();
            if (!user) {
                throw new Error("User not authenticated");
            }

            if (!merchantProfile?.id || merchantProfile.id === '') {
                throw new Error('Merchant account not yet created. Please wait or reload the page.');
            }

            const uploadResult = await api.uploadFile(file);
            if (!uploadResult) throw new Error('Upload failed');

            const publicUrl = uploadResult.url || '';

            await api.post('/merchant/profile', {
                documents: [{
                    fileName: file.name,
                    filePath: publicUrl,
                    fileSize: file.size,
                    mimeType: file.type,
                    documentType: 'cancelled_cheque',
                    docCategory: 'bank',
                }],
            });

            setCancelledCheque(file);
            clearError('cancelledCheque');

            if (onDataChange) {
                onDataChange({
                    documents: {
                        ...data?.documents,
                        cancelledCheque: {
                            file: file,
                            path: publicUrl
                        }
                    }
                });
            }

            toast({
                title: "File Uploaded",
                description: "Cancelled cheque uploaded successfully",
            });

        } catch (error) {
            console.error('Upload error:', error);
            toast({
                variant: "destructive",
                title: "Upload Failed",
                description: error instanceof Error ? error.message : "Failed to upload file",
            });
        }
    };

    // Form validation
    const validateForm = (): boolean => {
        const newErrors: Partial<Record<keyof BankDetailsData | 'cancelledCheque', string>> = {};

        // IFSC validation
        if (!formData.ifscCode.trim()) {
            newErrors.ifscCode = 'IFSC code is required';
        } else if (formData.ifscCode.length !== 11) {
            newErrors.ifscCode = 'IFSC code must be exactly 11 characters';
        } else if (!ifscValidation.isValid) {
            newErrors.ifscCode = ifscValidation.error || 'Invalid IFSC code';
        }

        // Account number validation
        if (!formData.accountNumber.trim()) {
            newErrors.accountNumber = 'Account number is required';
        } else if (!validateAccountNumber(formData.accountNumber)) {
            newErrors.accountNumber = 'Invalid account number (9-18 digits required)';
        }

        // Confirm account number
        if (formData.accountNumber !== formData.confirmAccountNumber) {
            newErrors.confirmAccountNumber = 'Account numbers do not match';
        }

        // Account holder name
        if (!formData.accountHolderName.trim()) {
            newErrors.accountHolderName = 'Account holder name is required';
        }

        // Cancelled cheque - check both local and parent state
        const hasCheque = cancelledCheque || data?.documents?.cancelledCheque?.file;
        if (!hasCheque) {
            newErrors.cancelledCheque = 'Cancelled cheque is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // Handle form submission
    const handleNext = async () => {
        if (!validateForm()) {
            toast({
                variant: "destructive",
                title: "Validation Error",
                description: "Please fix the errors in the form.",
            });
            return;
        }

        if (!merchantProfile) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Merchant profile not found",
            });
            return;
        }

        setIsSubmitting(true);

        try {
            console.log('🏦 handleNext - Saving bank details');
            console.log('   - merchantProfile.id:', merchantProfile.id);
            console.log('   - merchantProfile.userId:', merchantProfile.userId);
            console.log('   - merchantProfileProp exists:', (data as any)?.isDistributorFlow);
            console.log('   - isDistributorFlow:', (data as any)?.isDistributorFlow);

            // ✅ CRITICAL Fix: Use backend endpoint to save (bypasses RLS via service role)
            // In distributor flow, we can't use authenticated client (authenticated as distributor)
            // because RLS policy rejects writes by non-merchant users
            
            const isDistributorFlow = !!(data as any)?.isDistributorFlow;
            
            if (isDistributorFlow) {
                // Call backend endpoint that uses service role to bypass RLS
                console.log('   - Using distributor flow (backend bypass)');
                
                const token = authService.getToken();
                if (!token) {
                    throw new Error('Not authenticated');
                }

                const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
                const backendResponse = await fetch(`${API_URL}/api/distributor/save-bank-details`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        merchantProfileId: merchantProfile.id,
                        accountNumber: formData.accountNumber,
                        ifscCode: formData.ifscCode,
                        bankName: formData.bankName,
                        accountHolderName: formData.accountHolderName,
                    })
                });

                console.log('   - Backend response status:', backendResponse.status);

                if (!backendResponse.ok) {
                    const errorData = await backendResponse.json().catch(() => ({ error: { message: 'Unknown error' } }));
                    console.error('   - Backend error:', errorData);
                    throw new Error(errorData?.error?.message || `Failed to save bank details`);
                }

                const result = await backendResponse.json();
                console.log('   - Backend success:', result);
            } else {
                // Regular merchant flow - use REST API
                console.log('   - Using regular merchant flow (REST API)');
                
                const apiResult = await api.post('/merchant/profile', {
                    bankDetails: {
                        accountNumber: formData.accountNumber,
                        ifscCode: formData.ifscCode,
                        bankName: formData.bankName,
                        accountHolderName: formData.accountHolderName,
                    }
                });

                console.log('   - API save result:', apiResult);
            }

            console.log('✅ Bank details saved successfully');

            // Ensure parent has all the latest data before proceeding
            if (onDataChange) {
                onDataChange({
                    bankDetails: {
                        ...formData,
                        bankName: ifscValidation.bankName || formData.bankName
                    }
                });
            }

            toast({
                title: "Bank Details Saved",
                description: "Your bank information has been successfully recorded.",
            });

            onNext();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to save';
            console.error('❌ handleNext error:', error);
            toast({
                variant: "destructive",
                title: "Save Failed",
                description: message,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Get IFSC field display state
    const ifscStatus = getIFSCValidationStatus(formData.ifscCode);
    const ifscMessage = getIFSCMessage(formData.ifscCode);
    const ifscMessageColor = getIFSCMessageColor(formData.ifscCode);
    const showIFSCError = errors.ifscCode && ifscStatus !== 'validating';

    return (
        <div className="space-y-6">
            <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900">{t('bankDetails.title')}</h2>
                <p className="text-gray-600 mt-2">
                    {t('bankDetails.subtitle')}
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Bank Account Information */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CreditCard className="h-5 w-5" />
                            {t('bankDetails.accountInfo')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* IFSC Code */}
                        <div>
                            <Label htmlFor="ifscCode">{t('bankDetails.ifscCode')} *</Label>
                            <div className="relative">
                                <Input
                                    id="ifscCode"
                                    value={formData.ifscCode}
                                    onChange={handleInputChange('ifscCode')}
                                    placeholder="e.g., SBIN0003301"
                                    className={`${showIFSCError ? 'border-red-500' :
                                        ifscStatus === 'valid' ? 'border-green-500' : ''} uppercase`}
                                    maxLength={11}
                                />
                                {isValidatingIfsc && (
                                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                    </div>
                                )}
                                {ifscStatus === 'valid' && !isValidatingIfsc && (
                                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                    </div>
                                )}
                            </div>

                            {showIFSCError ? (
                                <div className="flex items-center gap-1 mt-1">
                                    <AlertCircle className="h-4 w-4 text-red-500" />
                                    <p className="text-sm text-red-500">{errors.ifscCode}</p>
                                </div>
                            ) : ifscMessage && (
                                <p className={`text-xs mt-1 ${ifscMessageColor}`}>
                                    {ifscMessage}
                                </p>
                            )}
                        </div>

                        {/* Bank Info Display */}
                        {ifscStatus === 'valid' && ifscValidation.bankName && (
                            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                                <div className="flex items-center gap-2 mb-2">
                                    <CheckCircle className="h-5 w-5 text-green-600" />
                                    <span className="font-semibold text-green-800">{t('bankDetails.bankVerified')}</span>
                                </div>
                                <div className="space-y-1 text-sm">
                                    <div>
                                        <span className="text-gray-600">{t('bankDetails.bank')}</span>
                                        <span className="ml-2 font-medium">{ifscValidation.bankName}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">{t('bankDetails.branch')}</span>
                                        <span className="ml-2 font-medium">{ifscValidation.branch}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Account Holder Name */}
                        <div>
                            <Label htmlFor="accountHolderName">{t('bankDetails.accountHolderName')} *</Label>
                            <Input
                                id="accountHolderName"
                                value={formData.accountHolderName}
                                onChange={handleInputChange('accountHolderName')}
                                placeholder={t('bankDetails.placeholderAccountHolder')}
                                className={errors.accountHolderName ? 'border-red-500' : ''}
                            />
                            {errors.accountHolderName && (
                                <div className="flex items-center gap-1 mt-1">
                                    <AlertCircle className="h-4 w-4 text-red-500" />
                                    <p className="text-sm text-red-500">{errors.accountHolderName}</p>
                                </div>
                            )}
                        </div>

                        {/* Account Number */}
                        <div>
                            <Label htmlFor="accountNumber">{t('bankDetails.accountNumber')} *</Label>
                            <div className="relative">
                                <Input
                                    id="accountNumber"
                                    value={formData.accountNumber}
                                    onChange={handleInputChange('accountNumber')}
                                    placeholder={t('bankDetails.placeholderAccountNumber')}
                                    className={errors.accountNumber ? 'border-red-500' : ''}
                                />
                                {isValidatingAccount && (
                                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                    </div>
                                )}
                                {accountValidation.isValid && !isValidatingAccount && (
                                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                    </div>
                                )}
                            </div>
                            {isValidatingAccount && (
                                <p className="text-xs mt-1 text-blue-600 flex items-center gap-1">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    {t('bankDetails.validatingAccount')}
                                </p>
                            )}
                            {accountValidation.isValid && (
                                <p className="text-xs mt-1 text-green-600 flex items-center gap-1">
                                    <CheckCircle className="h-3 w-3" />
                                    {t('bankDetails.accountVerified')}
                                </p>
                            )}
                            {errors.accountNumber && (
                                <div className="flex items-center gap-1 mt-1">
                                    <AlertCircle className="h-4 w-4 text-red-500" />
                                    <p className="text-sm text-red-500">{errors.accountNumber}</p>
                                </div>
                            )}
                        </div>

                        {/* Confirm Account Number */}
                        <div>
                            <Label htmlFor="confirmAccountNumber">{t('bankDetails.confirmAccountNumber')} *</Label>
                            <Input
                                id="confirmAccountNumber"
                                value={formData.confirmAccountNumber}
                                onChange={handleInputChange('confirmAccountNumber')}
                                placeholder={t('bankDetails.placeholderConfirmAccount')}
                                className={errors.confirmAccountNumber ? 'border-red-500' : ''}
                            />
                            {errors.confirmAccountNumber && (
                                <div className="flex items-center gap-1 mt-1">
                                    <AlertCircle className="h-4 w-4 text-red-500" />
                                    <p className="text-sm text-red-500">{errors.confirmAccountNumber}</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Supporting Documents */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5" />
                            {t('bankDetails.supportingDocs')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Cancelled Cheque Upload */}
                        <div>
                            <Label htmlFor="cancelledCheque">{t('bankDetails.uploadCancelledCheque')} *</Label>
                            <div className="mt-2">
                                <input
                                    type="file"
                                    id="cancelledCheque"
                                    accept="image/*,.pdf"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />
                                <label
                                    htmlFor="cancelledCheque"
                                    className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 
                                        ${errors.cancelledCheque ? 'border-red-500' : 'border-gray-300'}`}
                                >
                                    {(cancelledCheque || data?.documents?.cancelledCheque?.file) ? (
                                        <div className="flex items-center gap-2">
                                            <CheckCircle className="h-5 w-5 text-green-600" />
                                            <span className="text-sm font-medium">
                                                {(cancelledCheque || data?.documents?.cancelledCheque?.file)?.name}
                                            </span>
                                        </div>
                                    ) : (
                                        <>
                                            <Upload className="h-8 w-8 text-gray-400" />
                                            <span className="mt-2 text-sm text-gray-600">
                                                {t('upload.clickToUploadCancelled')}
                                            </span>
                                            <span className="text-xs text-gray-400">
                                                {t('upload.formats')}
                                            </span>
                                        </>
                                    )}
                                </label>
                            </div>
                            {errors.cancelledCheque && (
                                <div className="flex items-center gap-1 mt-1">
                                    <AlertCircle className="h-4 w-4 text-red-500" />
                                    <p className="text-sm text-red-500">{errors.cancelledCheque}</p>
                                </div>
                            )}
                        </div>

                        {/* Requirements */}
                        <div className="p-4 bg-blue-50 rounded-lg">
                            <h4 className="font-semibold text-blue-900 mb-2">{t('bankDetails.requirementsTitle')}</h4>
                            <ul className="text-sm text-blue-800 space-y-1">
                                <li>• {t('bankDetails.reqSameAccount')}</li>
                                <li>• {t('bankDetails.reqAccountVisible')}</li>
                                <li>• {t('bankDetails.reqIfscVisible')}</li>
                                <li>• {t('bankDetails.reqCancelledWritten')}</li>
                                <li>• {t('bankDetails.reqClearImage')}</li>
                            </ul>
                        </div>
                    </CardContent>
                </Card>
            </div>
            <div className="flex gap-4 mt-6">
                <ViewTicketButton />
                <RaiseTicketButton
                    module="settlement"
                    referenceId={merchantProfile?.id as string}
                />
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-6">
                <Button
                    variant="outline"
                    onClick={onPrev}
                    disabled={isSubmitting}
                >
                    {t('common.back')}
                </Button>
                <Button
                    onClick={handleNext}
                    disabled={isSubmitting}
                    className="min-w-[120px]"
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            {t('common.saving')}
                        </>
                    ) : (
                        t('bankDetails.nextReview')
                    )}
                </Button>
            </div>
            {/* WhatsApp Support (bottom of onboarding step) */}
            <div style={{marginTop: '2rem', textAlign: 'center'}}>
              <WhatsAppSupportButton />
            </div>
        </div>
    );
};



