// src/hooks/useBankValidation.ts
import { useState, useCallback } from 'react';

export interface BankValidationResult {
    isValid: boolean;
    bankName?: string;
    branch?: string;
    ifscDetails?: {
        bank: string;
        branch: string;
        address?: string;
        city?: string;
        district?: string;
        state?: string;
    };
    error?: string;
}

export interface BankValidationState {
    ifscValidation: BankValidationResult;
    accountValidation: BankValidationResult;
    isValidatingIfsc: boolean;
    isValidatingAccount: boolean;
}

export const useBankValidation = () => {
    const [validationState, setValidationState] = useState<BankValidationState>({
        ifscValidation: { isValid: false },
        accountValidation: { isValid: false },
        isValidatingIfsc: false,
        isValidatingAccount: false,
    });

    // Clean IFSC validation regex
    const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

    // Simple format validation
    const validateIFSCFormat = (ifscCode: string): boolean => {
        if (!ifscCode) return false;
        const cleanIFSC = ifscCode.trim().toUpperCase();
        return cleanIFSC.length === 11 && IFSC_REGEX.test(cleanIFSC);
    };

    // Account number validation
    const validateAccountNumber = (accountNumber: string): boolean => {
        if (!accountNumber) return false;
        const cleanAccountNumber = accountNumber.replace(/\s/g, '');
        return cleanAccountNumber.length >= 9 &&
            cleanAccountNumber.length <= 18 &&
            /^\d+$/.test(cleanAccountNumber);
    };

    // Clean IFSC validation with proper state management
    const validateIfscCode = useCallback(async (ifscCode: string): Promise<BankValidationResult> => {
        // Clear any existing validation state
        setValidationState(prev => ({
            ...prev,
            ifscValidation: { isValid: false },
            isValidatingIfsc: false,
        }));

        if (!ifscCode || ifscCode.trim().length === 0) {
            return { isValid: false, error: 'IFSC code is required' };
        }

        const cleanIFSC = ifscCode.trim().toUpperCase();

        // Quick format check
        if (!validateIFSCFormat(cleanIFSC)) {
            const result = {
                isValid: false,
                error: `Invalid IFSC format. Expected: 4 letters + 0 + 6 characters`
            };

            setValidationState(prev => ({
                ...prev,
                ifscValidation: result,
            }));

            return result;
        }

        // Start validation
        setValidationState(prev => ({
            ...prev,
            isValidatingIfsc: true,
        }));

        try {
            // Try RazorPay IFSC API
            const response = await fetch(`https://ifsc.razorpay.com/${cleanIFSC}`);

            if (response.ok) {
                const bankData = await response.json();

                const result: BankValidationResult = {
                    isValid: true,
                    bankName: bankData.BANK,
                    branch: bankData.BRANCH,
                    ifscDetails: {
                        bank: bankData.BANK,
                        branch: bankData.BRANCH,
                        address: bankData.ADDRESS,
                        city: bankData.CITY,
                        district: bankData.DISTRICT,
                        state: bankData.STATE,
                    },
                };

                setValidationState(prev => ({
                    ...prev,
                    ifscValidation: result,
                    isValidatingIfsc: false,
                }));

                return result;

            } else if (response.status === 404) {
                const result = {
                    isValid: false,
                    error: 'IFSC code not found in bank database'
                };

                setValidationState(prev => ({
                    ...prev,
                    ifscValidation: result,
                    isValidatingIfsc: false,
                }));

                return result;

            } else {
                throw new Error('API error');
            }

        } catch (error) {
            console.warn('IFSC API failed, using format validation:', error);

            // Fallback: Accept if format is valid
            const fallbackResult: BankValidationResult = {
                isValid: true,
                bankName: 'Bank details temporarily unavailable',
                branch: 'Please verify with your bank',
            };

            setValidationState(prev => ({
                ...prev,
                ifscValidation: fallbackResult,
                isValidatingIfsc: false,
            }));

            return fallbackResult;
        }
    }, []);

    // Get validation status for a specific IFSC
    const getIFSCValidationStatus = (ifscCode: string): 'empty' | 'typing' | 'invalid' | 'validating' | 'valid' => {
        if (!ifscCode || ifscCode.length === 0) return 'empty';
        if (ifscCode.length < 11) return 'typing';
        if (!validateIFSCFormat(ifscCode)) return 'invalid';
        if (validationState.isValidatingIfsc) return 'validating';
        if (validationState.ifscValidation.isValid) return 'valid';
        return 'invalid';
    };

    // Get appropriate message for IFSC field
    const getIFSCMessage = (ifscCode: string): string => {
        const status = getIFSCValidationStatus(ifscCode);

        switch (status) {
            case 'empty':
                return 'Format: 4 letters + 0 + 6 characters (e.g., SBIN0003301)';
            case 'typing':
                return `${ifscCode.length}/11 characters`;
            case 'validating':
                return 'Verifying bank details...';
            case 'valid':
                return validationState.ifscValidation.bankName
                    ? `✓ ${validationState.ifscValidation.bankName}`
                    : '✓ Valid IFSC format';
            case 'invalid':
                return validationState.ifscValidation.error || 'Invalid IFSC format';
            default:
                return '';
        }
    };

    // Get message color
    const getIFSCMessageColor = (ifscCode: string): string => {
        const status = getIFSCValidationStatus(ifscCode);

        switch (status) {
            case 'empty':
            case 'typing':
                return 'text-gray-500';
            case 'validating':
                return 'text-blue-600';
            case 'valid':
                return 'text-green-600';
            case 'invalid':
                return 'text-red-500';
            default:
                return 'text-gray-500';
        }
    };

    return {
        validateIfscCode,
        validateAccountNumber,
        validateIFSCFormat,
        getIFSCValidationStatus,
        getIFSCMessage,
        getIFSCMessageColor,
        validationState,
        isValidatingIfsc: validationState.isValidatingIfsc,
        isValidatingAccount: validationState.isValidatingAccount,
        ifscValidation: validationState.ifscValidation,
        accountValidation: validationState.accountValidation,
    };
};