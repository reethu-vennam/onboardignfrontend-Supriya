// src/pages/DistributorMerchantOnboarding.tsx
//
// Distributor-led merchant onboarding flow.
// Mirrors EnhancedMerchantOnboarding step structure but:
//   - Has its own step orchestration (no useOnboardingFlow — local stepIndex)
//   - merchantProfile is built from DistributorMerchantState, not useMerchantData
//   - All Supabase writes target the MERCHANT's profile via service-role backend API
//   - Storage uploads use the DISTRIBUTOR's user_id as path owner (RLS constraint)
//   - Final submission goes to /api/distributor/submit-merchant-onboarding

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authService } from '@/lib/auth-service';
import { api } from '@/lib/rest-api';
import { API_BASE_URL } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, ArrowLeft, Loader2 } from 'lucide-react';

// ── Step components ───────────────────────────────────────────────────────────
import { WelcomeScreen } from '@/components/onboarding/WelcomeScreen';
import { EntityTypeSelection } from '@/components/onboarding/EntityTypeSelection';
import { ProductSelection } from '@/components/onboarding/ProductSelection';
import { BusinessDetails } from '@/components/onboarding/BusinessDetails';
import { PersonKYC } from '@/components/onboarding/PersonKYC';
import { EntityDocuments } from '@/components/onboarding/EntityDocuments';
import { DoingBusinessAddress } from '@/components/onboarding/DoingBusinessAddress';
import { BankDetails } from '@/components/onboarding/BankDetails';
import { KYCVerification } from '@/components/onboarding/KYCVerification';
import { ReviewSubmit } from '@/components/onboarding/ReviewSubmit';

// ── Shared types ──────────────────────────────────────────────────────────────
import {
    OnboardingData,
    INITIAL_ONBOARDING_DATA,
    DistributorMerchantState,
    EntityType,
    getEntityDocRequirements,
} from '@/types/onboarding';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BaseStepProps {
    data?: OnboardingData | Record<string, unknown>;
    onDataChange?: (newData: Partial<OnboardingData> | Record<string, unknown>) => void;
    onNext?: (() => void) | ((data?: unknown) => void);
    onPrevious?: () => void;
    onPrev?: () => void;
    onGoToStep?: (stepId: string) => void;
    onSubmit?: () => Promise<void>;
    currentStep?: string;
    merchantProfile?: Record<string, unknown>;
    isSubmitting?: boolean;
}

interface StepInfo {
    id: string;
    title: string;
    description: string;
    component: React.ComponentType<BaseStepProps>;
}

// ─── Step registry ────────────────────────────────────────────────────────────
// Mirrors EnhancedMerchantOnboarding ONBOARDING_STEPS exactly.
// doing-business is included — skip logic handled in handleNext/handlePrev.

const STEPS: StepInfo[] = [
    { id: 'welcome',          title: 'Welcome',          description: 'Introduction',              component: WelcomeScreen       as unknown as React.ComponentType<BaseStepProps> },
    { id: 'entity-type',      title: 'Entity Type',      description: 'Business Structure',        component: EntityTypeSelection  as unknown as React.ComponentType<BaseStepProps> },
    { id: 'products',         title: 'Products',         description: 'Choose Products',           component: ProductSelection     as unknown as React.ComponentType<BaseStepProps> },
    { id: 'business-details', title: 'Business Details', description: 'Business Information',      component: BusinessDetails      as unknown as React.ComponentType<BaseStepProps> },
    { id: 'person-kyc',       title: 'Person KYC',       description: 'Identity Verification',     component: PersonKYC            as unknown as React.ComponentType<BaseStepProps> },
    { id: 'entity-documents', title: 'Documents',        description: 'Business Documents',        component: EntityDocuments      as unknown as React.ComponentType<BaseStepProps> },
    { id: 'doing-business',   title: 'Address Proof',    description: 'Operating Address',         component: DoingBusinessAddress as unknown as React.ComponentType<BaseStepProps> },
    { id: 'bank-details',     title: 'Bank Details',     description: 'Settlement Setup',          component: BankDetails          as unknown as React.ComponentType<BaseStepProps> },
    { id: 'kyc',              title: 'KYC',              description: 'Video & Location',          component: KYCVerification      as unknown as React.ComponentType<BaseStepProps> },
    { id: 'review',           title: 'Review & Submit',  description: 'Final Review',              component: ReviewSubmit         as unknown as React.ComponentType<BaseStepProps> },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function DistributorMerchantOnboarding() {
    const location = useLocation();
    const navigate = useNavigate();
    const { toast } = useToast();

    // ── Read merchant context from URL params or navigation state ─────────────
    const queryParams = new URLSearchParams(location.search);

    const [merchantState, setMerchantState] = useState<DistributorMerchantState>({
        merchantUserId:    queryParams.get('merchantUserId')    || (location.state as DistributorMerchantState)?.merchantUserId    || '',
        merchantProfileId: queryParams.get('merchantProfileId') || (location.state as DistributorMerchantState)?.merchantProfileId || '',
        merchantEmail:     queryParams.get('merchantEmail')     || (location.state as DistributorMerchantState)?.merchantEmail     || '',
        merchantPassword:  queryParams.get('merchantPassword')  || (location.state as DistributorMerchantState)?.merchantPassword  || '',
        distributorId:     queryParams.get('distributorId')     || (location.state as DistributorMerchantState)?.distributorId     || '',
        commission:        parseFloat(queryParams.get('commission') || '') || (location.state as DistributorMerchantState)?.commission || undefined,
    });

    // Settlement config from navigation state (passed from DistributorDashboard)
    const navState = location.state as Record<string, any> | null;
    const settlementConfig = {
        rolling_reserve_enabled:    navState?.rolling_reserve_enabled    ?? false,
        rolling_reserve_percentage: navState?.rolling_reserve_percentage ?? null,
        rolling_reserve_fixed_inr:  navState?.rolling_reserve_fixed_inr  ?? null,
        settlement_cycle_days:      navState?.settlement_cycle_days      ?? 1,
    };

    const [merchantCreationAttempted, setMerchantCreationAttempted] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [isEmployee, setIsEmployee] = useState(false);

    // ── Onboarding data ───────────────────────────────────────────────────────
    const [onboardingData, setOnboardingData] = useState<OnboardingData>({
        ...INITIAL_ONBOARDING_DATA,
        fullName:     navState?.merchantName     || queryParams.get('merchantName')  || '',
        mobileNumber: navState?.mobileNumber     || queryParams.get('mobileNumber')  || '',
        email:        merchantState.merchantEmail || '',
        panNumber:    navState?.panNumber        || queryParams.get('panNumber')      || '',
        businessName: navState?.businessName     || queryParams.get('businessName')  || '',
        gstNumber:    navState?.gstNumber        || queryParams.get('gstNumber')      || '',
        hasGST:       false,
        commission:   parseFloat(queryParams.get('commission') || '') || (location.state as DistributorMerchantState)?.commission || undefined,
    });

    // ── Detect employee role ──────────────────────────────────────────────────
    useEffect(() => {
        const checkRole = async () => {
            const user = authService.getUser();
            if (!user) return;
            const roleData = { role: (authService.getUser()?.roles || []).includes('employee') ? 'employee' : (authService.getUser()?.roles || []).includes('admin') ? 'admin' : 'distributor' };
            setIsEmployee(roleData?.role === 'employee');
        };
        checkRole();
    }, []);

    // ── Steps (dynamic — skip KYC for employee) ──────────────────────────────
    const steps = useMemo(() => {
        const allSteps = STEPS;
        return isEmployee ? allSteps.filter(s => s.id !== 'kyc') : allSteps;
    }, [isEmployee]);

    const currentStepId = steps[stepIndex]?.id ?? 'welcome';
    const progress = (stepIndex / (steps.length - 1)) * 100;

    // ── Guard: redirect if no merchant email ──────────────────────────────────
    useEffect(() => {
        if (!merchantState.merchantEmail) {
            toast({
                title: 'Error',
                description: 'No merchant email found. Please provide merchant details.',
                variant: 'destructive',
            });
            const basePath = location.pathname.startsWith('/employee') ? '/employee' : '/distributor';
            navigate(basePath);
        }
    }, [merchantState.merchantEmail, location.pathname, navigate, toast]);

    // ── Create merchant account early on page load ────────────────────────────
    useEffect(() => {
        const createMerchantIfNeeded = async () => {
            if (merchantCreationAttempted) return;
            if (merchantState.merchantUserId || merchantState.merchantProfileId) return;
            if (!merchantState.merchantEmail || !merchantState.merchantPassword || !merchantState.distributorId) return;

            setMerchantCreationAttempted(true);
            try {
                const token = authService.getToken();
                if (!token) throw new Error('No authorization token');

                const res = await fetch(`${API_BASE_URL}/api/distributor/create-merchant`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        email: merchantState.merchantEmail,
                        password: merchantState.merchantPassword,
                        fullName: onboardingData.fullName || 'Pending',
                        mobileNumber: onboardingData.mobileNumber || 'Pending',
                        distributorId: merchantState.distributorId,
                        businessName: onboardingData.businessName || null,
                        entityType: navState?.entityType || onboardingData.entityType || null,
                        panNumber: onboardingData.panNumber || null,
                        gstNumber: onboardingData.gstNumber || null,
                        commission: onboardingData.commission ?? null,
                        // Settlement & Reserve Terms
                        rolling_reserve_enabled:    settlementConfig.rolling_reserve_enabled,
                        rolling_reserve_percentage: settlementConfig.rolling_reserve_percentage,
                        rolling_reserve_fixed_inr:  settlementConfig.rolling_reserve_fixed_inr,
                        settlement_cycle_days:      settlementConfig.settlement_cycle_days,
                    }),
                });

                if (!res.ok) {
                    const err = await res.json().catch(() => ({ error: { message: 'Unknown error' } }));
                    throw new Error(err?.error?.message || `HTTP ${res.status}`);
                }

                const result = await res.json();
                const { merchantUserId, merchantProfileId } = result.data || {};

                if (!merchantUserId || !merchantProfileId) {
                    throw new Error('Invalid response: missing merchant IDs');
                }

                setMerchantState(prev => ({ ...prev, merchantUserId, merchantProfileId }));
                toast({ title: 'Merchant Account Created', description: 'Ready for document uploads' });

            } catch (err) {
                console.error('Early merchant creation failed:', err instanceof Error ? err.message : err);
            }
        };

        createMerchantIfNeeded();
    }, [
        merchantState.merchantEmail, merchantState.merchantPassword,
        merchantState.distributorId, merchantCreationAttempted,
        onboardingData.fullName, onboardingData.mobileNumber,
        onboardingData.businessName, onboardingData.panNumber,
        onboardingData.gstNumber, toast,
    ]);

    // Pre-fill email from merchantState
    useEffect(() => {
        if (merchantState.merchantEmail) {
            setOnboardingData(prev => ({ ...prev, email: merchantState.merchantEmail }));
        }
    }, [merchantState.merchantEmail]);

    // ── Data change ───────────────────────────────────────────────────────────
    const handleDataChange = useCallback((newData: Partial<OnboardingData>) => {
        setOnboardingData(prev => ({
            ...prev,
            ...newData,
            documents: {
                ...(prev.documents || {}),
                ...(newData.documents || {}),
            },
            persons: newData.persons ?? prev.persons,
            entityDocuments: newData.entityDocuments ?? prev.entityDocuments,
        }));
    }, []);

    // ── Skip logic for doing-business step ───────────────────────────────────
    const shouldSkip = useCallback((stepId: string, data: OnboardingData): boolean => {
        if (stepId === 'doing-business') return !data.operatingAddressDifferent;
        return false;
    }, []);

    const getNextIndex = useCallback((from: number, data: OnboardingData): number => {
        let next = from + 1;
        while (next < steps.length && shouldSkip(steps[next].id, data)) next++;
        return Math.min(next, steps.length - 1);
    }, [shouldSkip, steps.length]);

    const getPrevIndex = useCallback((from: number, data: OnboardingData): number => {
        let prev = from - 1;
        while (prev >= 0 && shouldSkip(steps[prev].id, data)) prev--;
        return Math.max(prev, 0);
    }, [shouldSkip, steps.length]);

    // ── Save entity_type when leaving entity-type step ────────────────────────
    const saveEntityType = useCallback(async (entityType: string) => {
        if (!merchantState.merchantUserId) return;
        try {
            await api.post('/merchant/profile', { entityType });
        } catch (err) {
            console.error('Failed to save entity type:', err);
        }
    }, [merchantState.merchantUserId]);

    // ── Save business details when leaving business-details step ──────────────
    const saveBusinessDetails = useCallback(async () => {
        if (!merchantState.merchantUserId) return;
        const addr = onboardingData.registeredAddress || onboardingData.operatingAddress;
        try {
            const payload: any = {
                fullName: onboardingData.fullName,
                mobileNumber: onboardingData.mobileNumber,
                email: onboardingData.email,
                businessName: onboardingData.businessName,
                gstNumber: onboardingData.gstNumber || null,
                entityType: onboardingData.entityType || null,
            };
            if (addr && (addr.addressLine1 || addr.city || addr.state)) {
                payload.businessAddressLine1 = addr.addressLine1 || null;
                payload.businessAddressLine2 = (addr as any).addressLine2 || null;
                payload.businessCity = addr.city || null;
                payload.businessState = addr.state || null;
                payload.businessPostalCode = addr.pincode || null;
                payload.businessCountry = addr.country || 'India';
            }
            await api.post('/merchant/profile', payload);
        } catch (err) {
            console.error('Failed to save business details:', err);
        }
    }, [merchantState.merchantUserId, onboardingData]);

    // ── Next step ─────────────────────────────────────────────────────────────
    const handleNext = useCallback(async () => {
        // Per-step save hooks
        if (currentStepId === 'entity-type' && onboardingData.entityType) {
            await saveEntityType(onboardingData.entityType);
        }
        if (currentStepId === 'business-details') {
            await saveBusinessDetails();
        }

        setStepIndex(prev => getNextIndex(prev, onboardingData));
    }, [currentStepId, onboardingData, saveEntityType, saveBusinessDetails, getNextIndex]);

    // ── Prev step ─────────────────────────────────────────────────────────────
    const handlePrev = useCallback(() => {
        setStepIndex(prev => getPrevIndex(prev, onboardingData));
    }, [onboardingData, getPrevIndex]);

    const handleGoToStep = useCallback((stepId: string) => {
        const idx = steps.findIndex(s => s.id === stepId);
        if (idx >= 0) setStepIndex(idx);
    }, [steps]);

    // ── Final submit ──────────────────────────────────────────────────────────
    const handleFinalSubmit = useCallback(async () => {
        if (!merchantState.merchantEmail) return;
        setIsSubmitting(true);

        try {
            // If merchant not yet created, create now
            let { merchantUserId, merchantProfileId } = merchantState;

            if (!merchantUserId || !merchantProfileId) {
                const token = authService.getToken() || '';

                const createRes = await fetch(`${API_BASE_URL}/api/distributor/create-merchant`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        email: merchantState.merchantEmail,
                        password: merchantState.merchantPassword,
                        fullName: onboardingData.fullName,
                        mobileNumber: onboardingData.mobileNumber,
                        distributorId: merchantState.distributorId,
                        businessName: onboardingData.businessName || null,
                        entityType: onboardingData.entityType || null,
                        panNumber: onboardingData.panNumber || null,
                        gstNumber: onboardingData.gstNumber || null,
                        commission: onboardingData.commission ?? null,
                        rolling_reserve_enabled:    settlementConfig.rolling_reserve_enabled,
                        rolling_reserve_percentage: settlementConfig.rolling_reserve_percentage,
                        rolling_reserve_fixed_inr:  settlementConfig.rolling_reserve_fixed_inr,
                        settlement_cycle_days:      settlementConfig.settlement_cycle_days,
                    }),
                });

                if (!createRes.ok) {
                    const err = await createRes.json();
                    throw new Error(err?.error?.message || 'Failed to create merchant account');
                }

                const createResult = await createRes.json();
                merchantUserId = createResult.data.merchantUserId;
                merchantProfileId = createResult.data.merchantProfileId;
            }

            // Validate required fields
            const errors: string[] = [];
            if (!onboardingData.fullName)                               errors.push('Full name');
            if (!onboardingData.mobileNumber)                           errors.push('Mobile number');
            if (!onboardingData.businessName)                           errors.push('Business name');
            if (!onboardingData.bankDetails.accountNumber?.trim())      errors.push('Bank account number');
            if (!onboardingData.bankDetails.ifscCode?.trim())           errors.push('IFSC code');
            if (!onboardingData.bankDetails.bankName?.trim())           errors.push('Bank name');
            if (!onboardingData.bankDetails.accountHolderName?.trim())  errors.push('Account holder name');
            if (!isEmployee && !onboardingData.kycData.isVideoCompleted) errors.push('Video KYC');
            if (!isEmployee && !onboardingData.kycData.locationVerified) errors.push('Location verification');

            if (errors.length > 0) {
                toast({
                    title: 'Missing Required Fields',
                    description: errors.join(', '),
                    variant: 'destructive',
                });
                return;
            }

            // Get auth token
            const token = authService.getToken() || '';

            // Submit to backend — backend uses service role to bypass RLS
            const res = await fetch(`${API_BASE_URL}/api/distributor/submit-merchant-onboarding`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    merchantProfileId,
                    fullName:       onboardingData.fullName,
                    mobileNumber:   onboardingData.mobileNumber,
                    email:          onboardingData.email,
                    businessName:   onboardingData.businessName,
                    panNumber:      onboardingData.panNumber,
                    aadhaarNumber:  onboardingData.aadhaarNumber,
                    gstNumber:      onboardingData.gstNumber,
                    entityType:     onboardingData.entityType || null,
                    bankDetails:    onboardingData.bankDetails,
                    kycData:        onboardingData.kycData,
                    documents:      onboardingData.documents,
                    // New structured data
                    persons:        onboardingData.persons,
                    entityDocuments: onboardingData.entityDocuments,
                    operatingAddressDifferent: onboardingData.operatingAddressDifferent,
                    registeredAddress:  onboardingData.registeredAddress,
                    operatingAddress:   onboardingData.operatingAddress,
                    doingBusinessDocPath: onboardingData.doingBusinessDocPath || null,
                    selectedProducts:   onboardingData.selectedProducts,
                    settlementType:     onboardingData.settlementType,
                }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ message: 'Unknown error' }));
                throw new Error(errData.message || `HTTP ${res.status}`);
            }

            setSubmitted(true);

        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Submission failed. Please try again.';
            console.error('Distributor submit error:', msg);
            toast({ title: 'Submission Failed', description: msg, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    }, [merchantState, onboardingData, toast]);

    // ── stepProps ─────────────────────────────────────────────────────────────
    // merchantProfile is built from merchantState — NOT from useMerchantData hook
    // because the distributor is logged in, not the merchant.
    const stepProps: BaseStepProps = {
        data: { ...onboardingData, isDistributorFlow: true },
        onDataChange: handleDataChange,
        onNext: handleNext,
        onPrevious: handlePrev,
        onPrev: handlePrev,
        onGoToStep: handleGoToStep,
        onSubmit: handleFinalSubmit,
        currentStep: currentStepId,
        isSubmitting,
        merchantProfile: {
            id:             merchantState.merchantProfileId,
            user_id:        merchantState.merchantUserId,
            full_name:      onboardingData.fullName,
            mobile_number:  onboardingData.mobileNumber,
            email:          onboardingData.email,
            pan_number:     onboardingData.panNumber,
            aadhaar_number: onboardingData.aadhaarNumber,
            business_name:  onboardingData.businessName,
            gst_number:     onboardingData.gstNumber,
            entity_type:    onboardingData.entityType || null,
        },
    };

    // ── Success screen ────────────────────────────────────────────────────────
    if (submitted) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-6">
                <Card className="w-full max-w-lg">
                    <CardContent className="pt-8 pb-8 text-center space-y-6">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                            <CheckCircle className="w-12 h-12 text-green-600" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-green-800">Application Submitted!</h2>
                            <p className="text-gray-600 mt-2">
                                Merchant onboarding has been completed and submitted for review.
                            </p>
                        </div>

                        {/* Credentials for distributor to hand to merchant */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left space-y-2">
                            <p className="font-semibold text-blue-900 text-sm">Merchant Login Credentials</p>
                            <p className="text-sm text-blue-800">
                                <span className="font-medium">Email: </span>
                                {merchantState.merchantEmail}
                            </p>
                            <p className="text-sm text-blue-800">
                                <span className="font-medium">Password: </span>
                                <span className="font-mono bg-blue-100 px-2 py-0.5 rounded">
                                    ••••••••
                                </span>
                            </p>
                            <p className="text-xs text-blue-600 mt-2">
                                Share these credentials with the merchant so they can log in and view their dashboard.
                            </p>
                        </div>

                        <Button className="w-full" onClick={() => navigate(location.pathname.startsWith('/employee') ? '/employee' : '/distributor')}>
                            Back to Dashboard
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!merchantState.merchantEmail) return null;

    const CurrentStepComponent = steps[stepIndex].component;

    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-background">

            {/* Header */}
            <div className="border-b bg-white shadow-sm">
                <div className="flex items-center gap-4 px-6 py-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(location.pathname.startsWith('/employee') ? '/employee' : '/distributor')}
                        className="flex items-center gap-2"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Dashboard
                    </Button>
                    <div className="flex-1">
                        <h1 className="text-lg font-semibold">
                            Merchant Onboarding — {merchantState.merchantEmail}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Completing onboarding on behalf of merchant
                        </p>
                    </div>
                    {/* Merchant account creation status */}
                    <div className={`text-xs px-2 py-1 rounded-full ${
                        merchantState.merchantProfileId
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'
                    }`}>
                        {merchantState.merchantProfileId ? 'Account ready' : 'Creating account…'}
                    </div>
                </div>
            </div>

            {/* Progress */}
            <div className="px-6 py-4 bg-white border-b">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">
                        Step {stepIndex + 1} of {steps.length}: {steps[stepIndex].title}
                    </span>
                    <span className="text-sm text-muted-foreground">
                        {steps[stepIndex].description}
                    </span>
                </div>
                <Progress value={progress} className="h-2" />

                {/* Step indicators */}
                <div className="flex justify-between mt-3 overflow-x-auto pb-1">
                    {steps.map((step, idx) => (
                        <div
                            key={step.id}
                            className={`flex flex-col items-center text-xs gap-1 min-w-[32px] ${
                                idx < stepIndex  ? 'text-green-600' :
                                idx === stepIndex ? 'text-primary font-semibold' :
                                                   'text-muted-foreground'
                            }`}
                        >
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                                idx < stepIndex  ? 'bg-green-100 text-green-700' :
                                idx === stepIndex ? 'bg-primary text-white' :
                                                   'bg-gray-100 text-gray-500'
                            }`}>
                                {idx < stepIndex ? <CheckCircle className="w-3.5 h-3.5" /> : idx + 1}
                            </div>
                            <span className="hidden md:block text-center leading-tight">
                                {step.title}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Step content */}
            <div className="max-w-4xl mx-auto p-6">
                {isSubmitting ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Loader2 className="w-12 h-12 animate-spin text-primary" />
                        <p className="text-lg font-medium">Submitting application…</p>
                    </div>
                ) : (
                    <CurrentStepComponent {...stepProps} />
                )}
            </div>

            {/* Dev debug */}
            {process.env.NODE_ENV === 'development' && (
                <div className="fixed bottom-4 right-4 bg-black/80 text-white p-3 rounded-lg text-xs space-y-1 max-w-xs">
                    <div className="font-bold">Distributor Debug</div>
                    <div>Step: {currentStepId} ({stepIndex + 1}/{steps.length})</div>
                    <div>Entity: {onboardingData.entityType || '—'}</div>
                    <div>Persons: {onboardingData.persons.length}</div>
                    <div>OpAddr diff: {String(onboardingData.operatingAddressDifferent)}</div>
                    <div>Merchant ID: {merchantState.merchantProfileId ? '✓' : '⏳'}</div>
                </div>
            )}
        </div>
    );
}



