import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle, AlertCircle, Loader2, CreditCard, FileText, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useBankValidation } from '@/hooks/useBankValidation';
import { useMerchantData } from '@/hooks/useMerchantData';
import { useAuth } from '@/components/auth/AuthProvider';
import { authService } from '@/lib/auth-service';
import { api } from '@/lib/rest-api';
import { OnboardingData, BankAccountData } from '@/types/onboarding';
import { RaiseTicketButton } from "@/components/RaiseTicketButton";
import { ViewTicketButton } from "@/components/ViewTicketButton";
import { useNavigate } from "react-router-dom";
import { WhatsAppSupportButton } from './WhatsAppSupportButton';
import { useI18n } from '@/i18n/I18nProvider';

const EMPTY_ACCOUNT: BankAccountData = {
    accountNumber: '',
    confirmAccountNumber: '',
    ifscCode: '',
    bankName: '',
    branchName: '',
    accountHolderName: '',
};

const normalizeBankAccounts = (bankAccounts?: BankAccountData[]): BankAccountData[] => {
    if (!bankAccounts || bankAccounts.length === 0) {
        return [{ ...EMPTY_ACCOUNT }];
    }

    return bankAccounts.map(account => ({ ...EMPTY_ACCOUNT, ...account }));
};

const ACCOUNT_REGEX = /^[0-9]{9,18}$/;

interface AccountValidation {
    isValid: boolean;
    accountName?: string;
    accountStatus?: string;
    requestId?: string;
    trackingRefNo?: string;
    responseId?: string;
    statusCode?: string;
    status?: string;
    message?: string;
    error?: string;
}

interface BankDetailsProps {
    onNext: () => void;
    onPrev: () => void;
    data?: OnboardingData;
    onDataChange?: (data: Partial<OnboardingData>) => void;
    merchantProfile?: Record<string, unknown>;
    refetchMerchant?: () => void;
}

export const BankDetails: React.FC<BankDetailsProps> = ({
    onNext,
    onPrev,
    data,
    onDataChange,
    merchantProfile: merchantProfileProp,
    refetchMerchant,
}) => {
    const { toast } = useToast();
    const { t } = useI18n();
    const { user } = useAuth();
    const { merchantProfile: merchantProfileHook } = useMerchantData();
    const navigate = useNavigate();
    const merchantProfile = merchantProfileProp || merchantProfileHook;

    const {
        validateIfscCode,
        validateAccountNumber: validateAccNum,
        getIFSCValidationStatus,
        getIFSCMessage,
        getIFSCMessageColor,
    } = useBankValidation();

    const [accounts, setAccounts] = useState<BankAccountData[]>(() => normalizeBankAccounts(data?.bankAccounts));

    const [cancelledCheque, setCancelledCheque] = useState<File | null>(
        data?.documents?.cancelledCheque?.file || null
    );
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [ifscValidations, setIfscValidations] = useState<Record<number, { isValid: boolean; bankName?: string; branchName?: string; error?: string }>>({});
    const [accountValidations, setAccountValidations] = useState<Record<number, AccountValidation>>({});
    const [validatingAccounts, setValidatingAccounts] = useState<Record<number, boolean>>({});

    // ── Pre-fill from Quick Scan results ──────────────────────────────────────
    useEffect(() => {
        if (!data?.scanResults?.cheque) return;
        const ch = data.scanResults.cheque;
        setAccounts(prev => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            updated[0] = {
                ...updated[0],
                ifscCode: ch.ifscCode || updated[0].ifscCode,
                accountNumber: ch.number || updated[0].accountNumber,
                bankName: ch.bankName || updated[0].bankName,
                branchName: ch.branchName || updated[0].branchName,
                accountHolderName: ch.accountHolderName || updated[0].accountHolderName,
            };
            onDataChange?.({ bankAccounts: updated });
            return updated;
        });
        setCancelledCheque(new File([], ch.fileName || 'cancelled-cheque.jpg'));
    }, [data?.scanResults]);

    const accountValidationTimeouts = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

    useEffect(() => {
        if (!data?.bankAccounts) return;
        const normalizedAccounts = normalizeBankAccounts(data.bankAccounts);
        if (JSON.stringify(normalizedAccounts) !== JSON.stringify(accounts)) {
            setAccounts(normalizedAccounts);
            if (data.bankAccounts.length === 0) {
                onDataChange?.({ bankAccounts: normalizedAccounts });
            }
        }
    }, [data?.bankAccounts, accounts, onDataChange]);

    const updateAccount = useCallback((index: number, field: keyof BankAccountData, value: string) => {
        setAccounts(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };

            if (field === 'accountNumber' || field === 'ifscCode') {
                setAccountValidations(prev => ({ ...prev, [index]: { isValid: false } }));
            }

            if (onDataChange) {
                onDataChange({ bankAccounts: updated });
            }
            return updated;
        });
        const errKey = `${index}_${field}`;
        setErrors(prev => { const next = { ...prev }; delete next[errKey]; return next; });
    }, [onDataChange]);

    const addAccount = useCallback(() => {
        setAccounts(prev => {
            const updated = [...prev, { ...EMPTY_ACCOUNT }];
            if (onDataChange) onDataChange({ bankAccounts: updated });
            return updated;
        });
    }, [onDataChange]);

    const removeAccount = useCallback((index: number) => {
        setAccounts(prev => {
            const updated = prev.filter((_, i) => i !== index);
            if (onDataChange) onDataChange({ bankAccounts: updated });
            return updated;
        });
        setAccountValidations(prev => {
            const next = { ...prev };
            delete next[index];
            return next;
        });
        setIfscValidations(prev => {
            const next = { ...prev };
            delete next[index];
            return next;
        });
        toast({ title: "Bank Account Removed", description: "The bank account entry has been removed." });
    }, [onDataChange, toast]);

    useEffect(() => {
        const timeouts: ReturnType<typeof setTimeout>[] = [];
        for (const [index, account] of accounts.entries()) {
            const ifsc = account.ifscCode.trim();
            if (ifsc.length === 11) {
                setIfscValidations(prev => ({ ...prev, [index]: { isValid: undefined as any, bankName: undefined, branchName: undefined, error: undefined } }));
                const timeoutId = setTimeout(async () => {
                    try {
                        const result = await validateIfscCode(ifsc);
                        setIfscValidations(prev => ({
                            ...prev,
                            [index]: {
                                isValid: result.isValid,
                                bankName: result.bankName,
                                branchName: result.branch,
                                error: result.error,
                            },
                        }));
                        if (result.isValid && result.bankName) {
                            updateAccount(index, 'bankName', result.bankName);
                            if (result.branch) {
                                updateAccount(index, 'branchName', result.branch);
                            }
                        }
                    } catch { }
                }, 600);
                timeouts.push(timeoutId);
            } else {
                setIfscValidations(prev => ({ ...prev, [index]: { isValid: false } }));
            }
        }
        return () => timeouts.forEach(clearTimeout);
    }, [accounts.map(a => a.ifscCode).join(','), updateAccount]);

    useEffect(() => {
        for (const [index, account] of accounts.entries()) {
            const acctNum = account.accountNumber.trim();
            const ifsc = account.ifscCode.trim();
            const holderName = account.accountHolderName.trim();

            if (acctNum.length < 9 || ifsc.length !== 11 || !holderName) {
                setAccountValidations(prev => ({ ...prev, [index]: { isValid: false } }));
                continue;
            }

            if (accountValidations[accountValidationTimeouts.current[index] as unknown as number] !== undefined) continue;

            if (accountValidationTimeouts.current[index]) {
                clearTimeout(accountValidationTimeouts.current[index]);
            }

            accountValidationTimeouts.current[index] = setTimeout(async () => {
                setValidatingAccounts(prev => ({ ...prev, [index]: true }));
                try {
                    const token = authService.getToken();
                    if (!token) throw new Error('Not authenticated');

                    const API_URL = import.meta.env.VITE_API_URL || '';
                    const response = await fetch(`${API_URL}/api/merchants/validate-bank-account`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            custName: holderName,
                            custIfsc: ifsc,
                            custAcctNo: acctNum,
                        }),
                    });

                    if (!response.ok) {
                        let errorMsg = 'Account validation failed';
                        try {
                            const errBody = await response.json();
                            errorMsg = errBody?.error?.message || errBody?.message || `HTTP ${response.status}`;
                        } catch { }
                        throw new Error(errorMsg);
                    }

                    const result = await response.json();
                    if (result.success && result.data?.isValid) {
                        const validationData = result.data;
                        setAccountValidations(prev => ({
                            ...prev,
                            [index]: {
                                isValid: true,
                                accountName: validationData.accountName,
                                accountStatus: validationData.accountStatus,
                                requestId: validationData.requestId,
                                trackingRefNo: validationData.trackingRefNo,
                                responseId: validationData.responseId,
                                statusCode: validationData.statusCode,
                                status: validationData.status,
                                message: validationData.message,
                            },
                        }));
                        const errKey = `${index}_accountNumber`;
                        setErrors(prev => { const next = { ...prev }; delete next[errKey]; return next; });
                    } else {
                        setAccountValidations(prev => ({
                            ...prev,
                            [index]: { isValid: false, error: result.data?.error || result.data?.message || 'Account validation failed' },
                        }));
                    }
                } catch (error) {
                    const msg = error instanceof Error ? error.message : 'Validation service unavailable';
                    setAccountValidations(prev => ({
                        ...prev,
                        [index]: { isValid: false, error: msg },
                    }));
                } finally {
                    setValidatingAccounts(prev => ({ ...prev, [index]: false }));
                }
            }, 500);
        }

        return () => {
            for (const timeout of Object.values(accountValidationTimeouts.current)) {
                clearTimeout(timeout);
            }
        };
    }, [accounts.map(a => `${a.accountNumber}|${a.ifscCode}|${a.accountHolderName}`).join(',')]);

    const clearError = (key: string) => {
        setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
    };

    const handleUploadCheque = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const result = await api.uploadFile(file, `merchants/${merchantProfile?.id || user?.id}/documents`);
            const publicUrl = result?.url || result?.filePath || result?.path || '';
            setCancelledCheque(file);
            if (onDataChange) {
                onDataChange({ documents: { ...(data?.documents || {}), cancelledCheque: { file, path: publicUrl } } });
            }
            toast({ title: "File Uploaded", description: "Cancelled cheque uploaded successfully" });
        } catch (error) {
            toast({ variant: "destructive", title: "Upload Failed", description: error instanceof Error ? error.message : "Failed to upload file" });
        }
    };

    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!cancelledCheque && !data?.documents?.cancelledCheque?.file) {
            newErrors['cancelledCheque'] = 'Cancelled cheque is required';
        }

        if (accounts.length === 0) {
            newErrors['_noAccounts'] = 'At least one bank account is required';
        }

        for (const [i, a] of accounts.entries()) {
            if (!a.accountHolderName.trim()) newErrors[`${i}_accountHolderName`] = 'Account holder name is required';
            if (!a.ifscCode.trim()) newErrors[`${i}_ifscCode`] = 'IFSC code is required';
            else if (a.ifscCode.length !== 11) newErrors[`${i}_ifscCode`] = 'IFSC code must be exactly 11 characters';
            else if (ifscValidations[i]?.isValid === false) newErrors[`${i}_ifscCode`] = ifscValidations[i].error || 'Invalid IFSC code';
            else if (ifscValidations[i]?.isValid === undefined) newErrors[`${i}_ifscCode`] = 'Validating IFSC code, please wait...';

            if (!a.accountNumber.trim()) newErrors[`${i}_accountNumber`] = 'Account number is required';
            else if (!ACCOUNT_REGEX.test(a.accountNumber)) newErrors[`${i}_accountNumber`] = 'Invalid account number (9-18 digits required)';
            else if (validatingAccounts[i]) newErrors[`${i}_accountNumber`] = 'Validating account number, please wait...';
            else if (accountValidations[i]?.isValid === false && accountValidations[i]?.error) {
                newErrors[`${i}_accountNumber`] = accountValidations[i].error;
            }

            if (a.accountNumber !== a.confirmAccountNumber) newErrors[`${i}_confirmAccountNumber`] = 'Account numbers do not match';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleNext = async () => {
        if (!validateForm()) {
            toast({ variant: "destructive", title: "Validation Error", description: "Please fix the errors in the form." });
            return;
        }

        if (!merchantProfile) {
            toast({ variant: "destructive", title: "Error", description: "Merchant profile not found" });
            return;
        }

        setIsSubmitting(true);

        try {
            const isDistributorFlow = !!(data as any)?.isDistributorFlow;

            if (isDistributorFlow) {
                const token = authService.getToken();
                if (!token) throw new Error('Not authenticated');

                const API_URL = import.meta.env.VITE_API_URL || '';
                for (const a of accounts) {
                    const bkName = ifscValidations[accounts.indexOf(a)]?.bankName || a.bankName;
                    const backendResponse = await fetch(`${API_URL}/api/distributor/save-bank-details`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                            merchantProfileId: merchantProfile.id,
                            accountNumber: a.accountNumber,
                            ifscCode: a.ifscCode,
                            bankName: bkName,
                            accountHolderName: a.accountHolderName,
                        }),
                    });
                    if (!backendResponse.ok) {
                        const errorData = await backendResponse.json().catch(() => ({ error: { message: 'Unknown error' } }));
                        throw new Error(errorData?.error?.message || 'Failed to save bank details');
                    }
                }
            } else {
                const bankDetailsPayload = accounts.map((a, i) => ({
                    accountNumber: a.accountNumber,
                    ifscCode: a.ifscCode,
                    bankName: ifscValidations[i]?.bankName || a.bankName,
                    accountHolderName: a.accountHolderName,
                }));
                await api.post('/merchant/profile', { bankDetails: bankDetailsPayload });
            }

            if (onDataChange) {
                onDataChange({ bankAccounts: accounts });
            }

            refetchMerchant?.();

            toast({ title: "Bank Details Saved", description: "Your bank information has been successfully recorded." });
            onNext();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to save';
            toast({ variant: "destructive", title: "Save Failed", description: message });
        } finally {
            setIsSubmitting(false);
        }
    };

    const getIFSCStatus = (ifsc: string): 'valid' | 'invalid' | 'validating' | '' => {
        if (!ifsc || ifsc.length < 11) return '';
        for (const [i, v] of Object.entries(ifscValidations)) {
            if (accounts[Number(i)]?.ifscCode === ifsc) return v.isValid ? 'valid' : 'invalid';
        }
        return '';
    };

    return (
        <div className="space-y-6">
            <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900">{t('bankDetails.title')}</h2>
                <p className="text-gray-600 mt-2">{t('bankDetails.subtitle')}</p>
            </div>

            {/* Quick Scan complete banner */}
            {data?.scanResults?.cheque && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
                    <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-green-600" />
                    <div>
                        <p className="font-medium">Quick Scan complete</p>
                        <p className="text-xs text-green-700 mt-0.5">
                            Bank details auto-filled from your cancelled cheque. Review and confirm below.
                        </p>
                    </div>
                </div>
            )}

            {accounts.map((account, index) => (
                <Card key={index} className="relative">
                    {accounts.length > 1 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="absolute top-3 right-3 text-red-500 hover:text-red-700"
                            onClick={() => removeAccount(index)}
                        >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Remove
                        </Button>
                    )}
                    {accounts.length > 1 && (
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <CreditCard className="h-5 w-5 text-primary" />
                                {`Bank Account ${index + 1}`}
                            </CardTitle>
                        </CardHeader>
                    )}
                    <CardContent className="space-y-4">
                        {/* IFSC Code */}
                        <div>
                            <Label>
                                {t('bankDetails.ifscCode')} <span className="text-destructive">*</span>
                            </Label>
                            <div className="relative">
                                <Input
                                    value={account.ifscCode}
                                    onChange={e => updateAccount(index, 'ifscCode', e.target.value.toUpperCase())}
                                    placeholder="SBIN0003301"
                                    maxLength={11}
                                    className={`${errors[`${index}_ifscCode`] ? 'border-destructive' : ''} pr-10`}
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    {getIFSCStatus(account.ifscCode) === 'valid' && <CheckCircle className="h-5 w-5 text-green-500" />}
                                    {getIFSCStatus(account.ifscCode) === 'invalid' && <AlertCircle className="h-5 w-5 text-red-500" />}
                                </div>
                            </div>
                            {errors[`${index}_ifscCode`] && <p className="text-xs text-destructive mt-1">{errors[`${index}_ifscCode`]}</p>}
                            {account.ifscCode.length === 11 && ifscValidations[index]?.isValid && (
                                <div className="mt-1 p-2 bg-green-50 border border-green-200 rounded-md">
                                    <div className="flex items-center gap-1.5">
                                        <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                                        <span className="text-xs text-green-700 font-medium">Bank Verified</span>
                                    </div>
                                    <p className="text-xs text-green-600 mt-0.5">
                                        Bank: {ifscValidations[index].bankName}
                                        {ifscValidations[index].branchName && ` | Branch: ${ifscValidations[index].branchName}`}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Account Holder Name */}
                        <div>
                            <Label>
                                {t('bankDetails.accountHolderName')} <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                value={account.accountHolderName}
                                onChange={e => updateAccount(index, 'accountHolderName', e.target.value)}
                                placeholder="Enter account holder name"
                                className={errors[`${index}_accountHolderName`] ? 'border-destructive' : ''}
                            />
                            {errors[`${index}_accountHolderName`] && <p className="text-xs text-destructive mt-1">{errors[`${index}_accountHolderName`]}</p>}
                        </div>

                        {/* Account Number */}
                        <div>
                            <Label>
                                {t('bankDetails.accountNumber')} <span className="text-destructive">*</span>
                            </Label>
                            <div className="relative">
                                <Input
                                    value={account.accountNumber}
                                    onChange={e => updateAccount(index, 'accountNumber', e.target.value)}
                                    placeholder="Enter account number"
                                    maxLength={18}
                                    className={`${errors[`${index}_accountNumber`] ? 'border-destructive' : ''} pr-10`}
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    {validatingAccounts[index] && <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />}
                                    {accountValidations[index]?.isValid && <CheckCircle className="h-5 w-5 text-green-500" />}
                                    {!validatingAccounts[index] && accountValidations[index]?.isValid === false && accountValidations[index]?.error && (
                                        <AlertCircle className="h-5 w-5 text-red-500" />
                                    )}
                                </div>
                            </div>
                            {errors[`${index}_accountNumber`] && <p className="text-xs text-destructive mt-1">{errors[`${index}_accountNumber`]}</p>}
                            {accountValidations[index]?.isValid && (
                                <div className="mt-1 p-2 bg-green-50 border border-green-200 rounded-md">
                                    <div className="flex items-center gap-1.5">
                                        <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                                        <span className="text-xs text-green-700 font-medium">Account Verified</span>
                                    </div>
                                    <div className="text-xs text-green-600 mt-0.5 space-y-0.5">
                                        {accountValidations[index].accountStatus && <p>Status: {accountValidations[index].accountStatus}</p>}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Confirm Account Number */}
                        <div>
                            <Label>
                                {t('bankDetails.confirmAccount')} <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                value={account.confirmAccountNumber || ''}
                                onChange={e => updateAccount(index, 'confirmAccountNumber', e.target.value)}
                                placeholder="Re-enter account number"
                                maxLength={18}
                                className={errors[`${index}_confirmAccountNumber`] ? 'border-destructive' : ''}
                            />
                            {errors[`${index}_confirmAccountNumber`] && <p className="text-xs text-destructive mt-1">{errors[`${index}_confirmAccountNumber`]}</p>}
                            {account.accountNumber && account.confirmAccountNumber && account.accountNumber === account.confirmAccountNumber && (
                                <div className="flex items-center gap-1 mt-1">
                                    <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                                    <span className="text-xs text-green-600">Account numbers match</span>
                                </div>
                            )}
                        </div>

                        {/* Bank Name (auto-filled from IFSC) */}
                        {ifscValidations[index]?.isValid && ifscValidations[index]?.bankName && (
                            <div>
                                <Label>{t('bankDetails.bankName')}</Label>
                                <div className="p-3 bg-muted/40 border border-border rounded-md">
                                    <span className="text-sm font-medium text-foreground">{ifscValidations[index].bankName}</span>
                                    {ifscValidations[index].branchName && (
                                        <span className="text-xs text-muted-foreground ml-2">| {ifscValidations[index].branchName}</span>
                                    )}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ))}

            {/* Add Account Button */}
            <Button
                type="button"
                variant="outline"
                onClick={addAccount}
                className="w-full border-dashed border-2 hover:border-primary hover:text-primary"
            >
                <Plus className="h-4 w-4 mr-2" />
                {t('bankDetails.addAccount') || 'Add Another Bank Account'}
            </Button>

            {/* Cancelled Cheque Upload */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        {t('bankDetails.cancelledCheque')}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                        {cancelledCheque ? (
                            <div className="space-y-2">
                                <CheckCircle className="h-8 w-8 text-green-500 mx-auto" />
                                <p className="text-sm text-green-600">{cancelledCheque.name}</p>
                                <Button variant="outline" size="sm" onClick={() => setCancelledCheque(null)}>
                                    Change File
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Upload className="h-8 w-8 text-gray-400 mx-auto" />
                                <p className="text-sm text-gray-500">{t('bankDetails.uploadChequePrompt') || 'Upload cancelled cheque (PDF/Image)'}</p>
                                <Label className="cursor-pointer inline-block">
                                    <span className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90">
                                        {t('common.upload')}
                                    </span>
                                    <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleUploadCheque} />
                                </Label>
                            </div>
                        )}
                    </div>
                    {errors['cancelledCheque'] && <p className="text-xs text-destructive mt-1">{errors['cancelledCheque']}</p>}
                </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex flex-wrap justify-between gap-4 pt-4">
                <div className="flex flex-wrap gap-2">
                    <RaiseTicketButton
                        module="onboarding-bank"
                        referenceId={merchantProfile?.id as string || user?.id || ''}
                    />
                    <ViewTicketButton />
                    <WhatsAppSupportButton
                        message={t('support.bankHelp') || 'Hi, I need help with adding my bank account during onboarding.'}
                    />
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" onClick={onPrev} disabled={isSubmitting}>
                        {t('common.back')}
                    </Button>
                    <Button onClick={handleNext} disabled={isSubmitting}>
                        {isSubmitting ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                {t('common.saving')}
                            </>
                        ) : (
                            t('common.continue')
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default BankDetails;
