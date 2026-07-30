// src/pages/EnhancedMerchantOnboarding.tsx
//
// Main orchestrator for merchant self-onboarding flow.
// Updated to support entity-type-aware multi-step flow with:
//   - EntityTypeSelection (step 2)
//   - BusinessDetails (step 4, replaces MerchantRegistration)
//   - PersonKYC (step 5)
//   - EntityDocuments (step 6)
//   - DoingBusinessAddress (step 7, conditional)
//
// Step restoration on refresh uses merchant_profiles + merchant_persons + merchant_documents
// to restore the merchant to the correct step.

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2, LogOut } from 'lucide-react';
import { useOnboardingFlow } from '@/hooks/useOnboardingFlow';
import { useMerchantData } from '@/hooks/useMerchantData';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/auth/AuthProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { useNavigate, useLocation } from 'react-router-dom';
import { authService } from '@/lib/auth-service';
import { api } from '@/lib/rest-api';

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
import { OnboardingDashboard } from '@/components/onboarding/OnboardingDashboard';
import { MandatePopup } from '@/components/onboarding/MandatePopup';
import { MandateFlowModal } from '@/components/onboarding/MandateFlowModal';
import { LanguageSelector } from '@/components/LanguageSelector';
import { OnboardingChatbot } from '@/components/OnboardingChatbot';

import {
    OnboardingData,
    INITIAL_ONBOARDING_DATA,
    EntityType,
    isEntityTypeComplete,
    isBusinessDetailsComplete,
    isPersonKYCComplete,
    isEntityDocumentsComplete,
    isDoingBusinessComplete,
    isBankDetailsComplete,
    isKYCComplete,
    getEntityDocRequirements,
} from '@/types/onboarding';

interface MerchantProfileShape {
    id?: string;
    full_name?: string;
    mobile_number?: string;
    email?: string;
    pan_number?: string;
    aadhaar_number?: string;
    business_name?: string;
    gst_number?: string;
    entity_type?: string;
    onboarding_status?: string;
    user_id?: string;
    selected_products?: unknown;
    registration_details?: unknown;
    upi_vpa?: string | null;
    upi_qr_string?: string | null;
    upi_mandate_status?: string | null;
    agreement_signed?: boolean | null;
    pg_agreement_signed?: boolean | null;
}

interface BaseStepProps {
    data?: OnboardingData | Record<string, unknown>;
    onDataChange?: (newData: Partial<OnboardingData> | Record<string, unknown>) => void;
    onNext?: (() => void) | ((data?: unknown) => void);
    onPrevious?: () => void;
    onPrev?: () => void;
    onGoToStep?: (stepId: string) => void;
    onSubmit?: () => Promise<void>;
    currentStep?: string;
    merchantProfile?: MerchantProfileShape;
    isSubmitting?: boolean;
}

interface StepInfo {
    id: string;
    title: string;
    description: string;
    component: React.ComponentType<BaseStepProps>;
}

const ONBOARDING_STEPS: StepInfo[] = [
    { id: 'welcome', title: 'Welcome', description: 'Introduction to SabbPe', component: WelcomeScreen as unknown as React.ComponentType<BaseStepProps> },
    { id: 'entity-type', title: 'Entity Type', description: 'Business Structure', component: EntityTypeSelection as unknown as React.ComponentType<BaseStepProps> },
    { id: 'products', title: 'Products', description: 'Choose Your Products', component: ProductSelection as unknown as React.ComponentType<BaseStepProps> },
    { id: 'business-details', title: 'Business Details', description: 'Business Information', component: BusinessDetails as unknown as React.ComponentType<BaseStepProps> },
    { id: 'person-kyc', title: 'Person KYC', description: 'Identity Verification', component: PersonKYC as unknown as React.ComponentType<BaseStepProps> },
    { id: 'entity-documents', title: 'Documents', description: 'Business Documents', component: EntityDocuments as unknown as React.ComponentType<BaseStepProps> },
    { id: 'doing-business', title: 'Address Proof', description: 'Operating Address', component: DoingBusinessAddress as unknown as React.ComponentType<BaseStepProps> },
    { id: 'bank-details', title: 'Bank Details', description: 'Payment Settlement Setup', component: BankDetails as unknown as React.ComponentType<BaseStepProps> },
    { id: 'kyc', title: 'KYC', description: 'Video & Location Verification', component: KYCVerification as unknown as React.ComponentType<BaseStepProps> },
    { id: 'review', title: 'Review & Submit', description: 'Final Review', component: ReviewSubmit as unknown as React.ComponentType<BaseStepProps> },
];

const SuccessPopup: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onGoToDashboard: () => void;
}> = ({ isOpen, onClose, onGoToDashboard }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl">
                <div className="text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-10 h-10 text-green-600" />
                    </div>
                    <h3 className="text-xl font-bold text-green-800 mb-2">
                        Application Submitted Successfully!
                    </h3>
                    <p className="text-gray-600 mb-6">
                        Your merchant onboarding application has been submitted for review.
                        You'll receive email updates on the approval status.
                    </p>
                    <div className="space-y-3 mb-6">
                        <div className="text-sm text-gray-600 text-left">
                            <p className="font-medium mb-2">What happens next:</p>
                            <ul className="space-y-1">
                                <li>• Validation within 5–10 minutes</li>
                                <li>• Document review 24–48 hours</li>
                                <li>• Email confirmation sent</li>
                                <li>• Account activation once approved</li>
                            </ul>
                        </div>
                    </div>
                    <button
                        onClick={() => { onClose(); onGoToDashboard(); }}
                        className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Continue to Mandate Setup
                    </button>
                </div>
            </div>
        </div>
    );
};

function mapChatbotData(step: string, data: Record<string, any>): Partial<OnboardingData> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
        const strVal = String(value);

        switch (key) {
            case 'hasGST':
            case 'operatingAddressDifferent':
                result[key] = strVal === 'true';
                break;
            case 'accountHolderName':
            case 'accountNumber':
            case 'confirmAccountNumber':
            case 'ifscCode':
            case 'bankName':
            case 'branchName':
                if (!result.bankDetails) {
                    const existing = {} as any;
                    result.bankDetails = existing;
                }
                result.bankDetails[key] = strVal;
                break;
            case 'addressLine1':
            case 'city':
            case 'state':
            case 'pincode':
            case 'country':
                if (!result.registeredAddress) {
                    result.registeredAddress = {
                        addressLine1: '',
                        city: '',
                        state: '',
                        pincode: '',
                        country: 'India',
                    };
                }
                result.registeredAddress[key] = strVal;
                break;
            default:
                result[key] = strVal;
        }
    }

    return result as Partial<OnboardingData>;
}

const EnhancedOnboardingFlow: React.FC = () => {
    const { toast } = useToast();
    const { user } = useAuth();
    const { language } = useI18n();
    const navigate = useNavigate();
    const location = useLocation();

    const [showSuccessPopup, setShowSuccessPopup] = useState(false);
    const [showMandatePopup, setShowMandatePopup] = useState(false);
    const [showMandateFlow, setShowMandateFlow] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const stepRestoredRef = React.useRef(false);

    const [onboardingData, setOnboardingData] = useState<OnboardingData>(() => ({
        ...INITIAL_ONBOARDING_DATA,
        fullName: authService.getUser()?.fullName || '',
        email: authService.getUser()?.email || '',
        mobileNumber: authService.getUser()?.mobileNumber || '',
    }));

    useEffect(() => {
        if (user?.fullName || user?.email) {
            setOnboardingData(prev => ({
                ...prev,
                fullName: prev.fullName || user?.fullName || '',
                email: prev.email || user?.email || '',
                mobileNumber: prev.mobileNumber || authService.getUser()?.mobileNumber || '',
            }));
        }
    }, [user?.fullName, user?.email]);

    const {
        currentStep,
        currentStepIndex,
        totalSteps,
        progress,
        nextStep,
        prevStep,
        goToStep,
    } = useOnboardingFlow({
        operatingAddressDifferent: onboardingData.operatingAddressDifferent,
        entityType: onboardingData.entityType,
    });

    const {
        merchantProfile,
        bankDetails,
        documents,
        kycData,
        loading: profileLoading,
        refetch,
    } = useMerchantData();

    type OnboardingStep =
        | 'welcome' | 'entity-type' | 'products' | 'business-details'
        | 'person-kyc' | 'entity-documents' | 'doing-business'
        | 'bank-details' | 'kyc' | 'review' | 'dashboard';

    const [, setSavedProgress] = useLocalStorage('onboarding-progress', {
        currentStep,
        completedAt: null as string | null,
        lastUpdated: new Date().toISOString(),
    });

    const handleSignOut = async () => {
        try {
            authService.logout();
            toast({ title: 'Signed Out', description: 'You have been signed out.' });
            navigate('/auth');
        } catch {
            toast({ variant: 'destructive', title: 'Sign Out Failed' });
        }
    };

    const handleDataChange = React.useCallback((newData: Partial<OnboardingData>) => {
        setOnboardingData(prev => {
            const hasChanges = Object.keys(newData).some(
                key => prev[key as keyof OnboardingData] !== newData[key as keyof OnboardingData]
            );
            if (!hasChanges) return prev;
            return {
                ...prev,
                ...newData,
                documents: {
                    ...(prev.documents || {}),
                    ...(newData.documents || {}),
                },
                persons: newData.persons ?? prev.persons,
                entityDocuments: newData.entityDocuments ?? prev.entityDocuments,
            };
        });
    }, []);
    const saveBusinessDetails = React.useCallback(async (dataToSave?: Partial<OnboardingData>): Promise<boolean> => {
        if (!user?.id) return false;
        try {
            const mergedData = { ...onboardingData, ...dataToSave };
            const addr = mergedData.registeredAddress || mergedData.operatingAddress;
            const payload: any = {
                fullName: mergedData.fullName,
                mobileNumber: mergedData.mobileNumber,
                email: mergedData.email,
                businessName: mergedData.businessName,
                gstNumber: mergedData.gstNumber || null,
                entityType: mergedData.entityType || null,
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
            return true;
        } catch (err) {
            console.error('saveBusinessDetails error:', err);
            toast({ variant: 'destructive', title: 'Save Failed', description: 'Could not save your details. Please try again.' });
            return false;
        }
    }, [user?.id, onboardingData, toast]);

    const handleNextStep = React.useCallback(async (stepData?: unknown) => {
        const partialStepData = (stepData && typeof stepData === 'object')
            ? stepData as Partial<OnboardingData>
            : undefined;
        const merged = { ...onboardingData, ...partialStepData };

        const isEditable = !merchantProfile?.onboarding_status
            || merchantProfile.onboarding_status === 'draft'
            || merchantProfile.onboarding_status === 'rejected';

        try {
            if (isEditable) {
                const payload: any = {};

                if (currentStep === 'welcome') {
                    payload.fullName = merged.fullName || user?.fullName || '';
                    payload.mobileNumber = merged.mobileNumber || '';
                    payload.email = merged.email || user?.email || '';
                }

                if (currentStep === 'entity-type') {
                    payload.entityType = merged.entityType;
                }

                if (currentStep === 'products') {
                    // Products are saved by ProductSelection component via its own API call
                }

                if (currentStep === 'business-details') {
                    payload.fullName = merged.fullName;
                    payload.mobileNumber = merged.mobileNumber;
                    payload.email = merged.email;
                    payload.businessName = merged.businessName;
                    payload.gstNumber = merged.gstNumber || null;
                    payload.entityType = merged.entityType || null;
                    payload.panNumber = merged.panNumber || null;
                    payload.aadhaarNumber = merged.aadhaarNumber || null;
                    const addr = merged.registeredAddress || merged.operatingAddress;
                    if (addr) {
                        payload.businessAddressLine1 = addr.addressLine1;
                        payload.businessAddressLine2 = (addr as any).addressLine2 || null;
                        payload.businessCity = addr.city;
                        payload.businessState = addr.state;
                        payload.businessPostalCode = addr.pincode;
                        payload.businessCountry = addr.country || 'India';
                    }
                }

                if (currentStep === 'person-kyc' || currentStep === 'entity-documents') {
                    payload.panNumber = merged.panNumber || null;
                    payload.aadhaarNumber = merged.aadhaarNumber || null;
                    payload.persons = (merged.persons || []).map((p: any) => ({
                        role: p.role,
                        fullName: p.fullName,
                        panNumber: p.panNumber || null,
                        addressProofType: p.addressProofType || null,
                        isAuthorizedSignatory: p.isAuthorizedSignatory,
                        sequenceOrder: p.sequenceOrder,
                    }));
                }

                if (currentStep === 'kyc') {
                    payload.kyc = {
                        isVideoCompleted: merged.kycData?.isVideoCompleted || false,
                        locationVerified: merged.kycData?.locationVerified || false,
                        selfieUrl: merged.kycData?.selfieUrl || null,
                        latitude: merged.kycData?.latitude || null,
                        longitude: merged.kycData?.longitude || null,
                        fullAddress: merged.kycData?.fullAddress || null,
                        area: merged.kycData?.area || null,
                        city: merged.kycData?.city || null,
                        state: merged.kycData?.state || null,
                        pincode: merged.kycData?.pincode || null,
                        country: merged.kycData?.country || null,
                    };
                }

                if (currentStep === 'doing-business' || currentStep === 'bank-details') {
                    const addr = merged.registeredAddress || merged.operatingAddress;
                    if (addr) {
                        payload.businessAddressLine1 = addr.addressLine1;
                        payload.businessAddressLine2 = (addr as any).addressLine2 || null;
                        payload.businessCity = addr.city;
                        payload.businessState = addr.state;
                        payload.businessPostalCode = addr.pincode;
                        payload.businessCountry = addr.country || 'India';
                    }
                    if (merged.bankDetails) {
                        payload.bankDetails = {
                            accountNumber: merged.bankDetails.accountNumber,
                            ifscCode: merged.bankDetails.ifscCode,
                            bankName: merged.bankDetails.bankName,
                            accountHolderName: merged.bankDetails.accountHolderName,
                        };
                    }
                }

                if (Object.keys(payload).length > 0) {
                    console.log(`[handleNextStep] ${currentStep} payload:`, JSON.stringify(payload, null, 2));
                    await api.post('/merchant/profile', payload);
                }
            }
        } catch (err) {
            console.error(`Error saving step ${currentStep}:`, err);
        }

        nextStep();
    }, [currentStep, nextStep, user, onboardingData, merchantProfile]);

    const handleGoToStep = React.useCallback((stepId: string) => {
        const exists = ONBOARDING_STEPS.find(s => s.id === stepId);
        if (exists) goToStep(stepId as OnboardingStep);
        else console.warn(`Step "${stepId}" not found`);
    }, [goToStep]);

    const handleFinalSubmit = React.useCallback(async () => {
        setIsSubmitting(true);
        try {
            if (!user?.id) throw new Error('User not authenticated');

            const existingProfile = await api.get('/merchant/profile').catch(() => null);

            const src = onboardingData.registeredAddress
                || onboardingData.operatingAddress;

            const hasLocalAddr = src && (src.addressLine1 || src.city || src.state || src.pincode);
            const hasDbAddr = existingProfile?.businessAddressLine1 || existingProfile?.business_address_line1
                || existingProfile?.businessCity || existingProfile?.business_city
                || existingProfile?.businessState || existingProfile?.business_state
                || existingProfile?.businessPostalCode || existingProfile?.business_postal_code;

            if (!hasLocalAddr && !hasDbAddr) {
                toast({
                    variant: 'destructive',
                    title: 'Business Address Required',
                    description: 'Please fill in your business address before submitting.',
                });
                goToStep('business-details' as OnboardingStep);
                setIsSubmitting(false);
                return;
            }

            const profilePayload: any = {
                fullName: onboardingData.fullName || existingProfile?.fullName || existingProfile?.full_name,
                mobileNumber: onboardingData.mobileNumber || existingProfile?.mobileNumber || existingProfile?.mobile_number,
                email: onboardingData.email || existingProfile?.email,
                businessName: onboardingData.businessName || existingProfile?.businessName || existingProfile?.business_name,
                panNumber: onboardingData.panNumber || existingProfile?.panNumber || existingProfile?.pan_number || null,
                aadhaarNumber: onboardingData.aadhaarNumber || existingProfile?.aadhaarNumber || existingProfile?.aadhaar_number || null,
                gstNumber: onboardingData.gstNumber || existingProfile?.gstNumber || existingProfile?.gst_number || null,
                entityType: onboardingData.entityType || existingProfile?.entityType || existingProfile?.entity_type || null,
                bankDetails: onboardingData.bankDetails ? {
                    accountNumber: onboardingData.bankDetails.accountNumber,
                    ifscCode: onboardingData.bankDetails.ifscCode,
                    bankName: onboardingData.bankDetails.bankName,
                    accountHolderName: onboardingData.bankDetails.accountHolderName,
                } : undefined,
                persons: onboardingData.persons?.length ? onboardingData.persons.map(p => ({
                    role: p.role,
                    fullName: p.fullName,
                    panNumber: p.panNumber || null,
                    addressProofType: p.addressProofType || null,
                    isAuthorizedSignatory: p.isAuthorizedSignatory,
                    sequenceOrder: p.sequenceOrder,
                })) : existingProfile?.persons?.map((p: any) => ({
                    role: p.role,
                    fullName: p.fullName,
                    panNumber: p.panNumber || null,
                    addressProofType: p.addressProofType || null,
                    isAuthorizedSignatory: p.isAuthorizedSignatory,
                    sequenceOrder: p.sequenceOrder,
                })),
            };

            if (hasLocalAddr) {
                profilePayload.businessAddressLine1 = src.addressLine1 || (src as any).line1;
                profilePayload.businessAddressLine2 = (src as any).addressLine2 || (src as any).line2 || null;
                profilePayload.businessCity = src.city;
                profilePayload.businessState = src.state;
                profilePayload.businessPostalCode = src.pincode || (src as any).postalCode;
                profilePayload.businessCountry = src.country || 'India';
            } else if (existingProfile) {
                profilePayload.businessAddressLine1 = existingProfile.businessAddressLine1 || existingProfile.business_address_line1;
                profilePayload.businessAddressLine2 = existingProfile.businessAddressLine2 || existingProfile.business_address_line2;
                profilePayload.businessCity = existingProfile.businessCity || existingProfile.business_city;
                profilePayload.businessState = existingProfile.businessState || existingProfile.business_state;
                profilePayload.businessPostalCode = existingProfile.businessPostalCode || existingProfile.business_postal_code;
                profilePayload.businessCountry = existingProfile.businessCountry || existingProfile.business_country;
            }

            await api.post('/merchant/profile', profilePayload);

            await api.post('/merchant/submit');

            setShowSuccessPopup(true);
            toast({ title: 'Application Submitted!', description: 'Your application is under review.' });

        } catch (err) {
            console.error('handleFinalSubmit error:', err);
            toast({
                variant: 'destructive',
                title: 'Submission Failed',
                description: err instanceof Error ? err.message : 'Please try again.',
            });
        } finally {
            setIsSubmitting(false);
        }
    }, [onboardingData, user?.id, toast, goToStep]);

        const isStepCompleted = React.useCallback((stepId: string): boolean => {
        const dbDocuments = documents || [];

        const hasPersonDocs = dbDocuments.some(
            d => d.documentType === 'pan_card' || d.documentType === 'aadhaar_card'
        );

        const hasEntityDocs = dbDocuments.some(
            d => [
                'gst_certificate',
                'shop_act_certificate',
                'partnership_deed',
                'llp_agreement',
                'moa',
                'aoa',
                'certificate_of_incorporation',
                'trust_deed',
                'huf_deed',
                'undertaking',
                'affiliation_letter',
                'work_order',
            ].includes(d.documentType)
        );

        const hasBankDetails = Boolean(
            isBankDetailsComplete(onboardingData) ||
            (
                bankDetails?.accountNumber &&
                bankDetails?.ifscCode &&
                bankDetails?.bankName &&
                bankDetails?.accountHolderName
            )
        );

        const hasKYC = Boolean(
            isKYCComplete(onboardingData) ||
            (
                kycData?.videoKycCompleted &&
                kycData?.locationCaptured
            )
        );

        switch (stepId) {
            case 'welcome':
                return true;
            case 'entity-type':
                return isEntityTypeComplete(onboardingData);
            case 'products':
                return Boolean(onboardingData.selectedProducts?.length);
            case 'business-details':
                return isBusinessDetailsComplete(onboardingData);
            case 'person-kyc':
                return isPersonKYCComplete(onboardingData) || hasPersonDocs;
            case 'entity-documents':
                return isEntityDocumentsComplete(onboardingData) || hasEntityDocs;
            case 'doing-business':
                return isDoingBusinessComplete(onboardingData);
            case 'bank-details':
                return hasBankDetails;
            case 'kyc':
                return hasKYC;
            case 'review':
                return onboardingData.agreementAccepted;
            default:
                return false;
        }
    }, [onboardingData, documents, bankDetails, kycData]);

    const stepProps: BaseStepProps = React.useMemo(() => ({
        data: { ...onboardingData, isDistributorFlow: false },
        onDataChange: handleDataChange,
        onNext: handleNextStep,
        onPrevious: prevStep,
        onPrev: prevStep,
        onGoToStep: handleGoToStep,
        onSubmit: handleFinalSubmit,
        currentStep,
        merchantProfile: merchantProfile as MerchantProfileShape,
        isSubmitting,
    }), [
        onboardingData, handleDataChange, handleNextStep, prevStep,
        handleGoToStep, handleFinalSubmit, currentStep, merchantProfile, isSubmitting,
    ]);

    useEffect(() => {
        if (!merchantProfile) return;
        setOnboardingData(prev => {
            const mp: any = merchantProfile;
            const addrLine1 = mp.businessAddressLine1 || mp.business_address_line1;
            const addrLine2 = mp.businessAddressLine2 || mp.business_address_line2;
            const city = mp.businessCity || mp.business_city;
            const state = mp.businessState || mp.business_state;
            const postalCode = mp.businessPostalCode || mp.business_postal_code;
            const country = mp.businessCountry || mp.business_country || 'India';
            const hasAddress = addrLine1 || city || state || postalCode;

            const persons = (mp.persons || []).map((p: any) => ({
                role: p.role,
                fullName: p.fullName || p.full_name,
                panNumber: p.panNumber || p.pan_number || '',
                addressProofType: p.addressProofType || p.address_proof_type || '',
                isAuthorizedSignatory: p.isAuthorizedSignatory ?? p.is_authorized_signatory ?? false,
                sequenceOrder: p.sequenceOrder ?? p.sequence_order ?? 0,
            }));

            const kycArr = mp.kyc || [];
            const kyc = kycArr.length > 0 ? kycArr[0] : null;

            const bankDto = mp.bankDetails || mp.bank_details || null;

            return {
                ...prev,
                fullName: mp.fullName || mp.full_name || prev.fullName,
                mobileNumber: mp.mobileNumber || mp.mobile_number || prev.mobileNumber,
                email: mp.email || prev.email,
                panNumber: mp.panNumber || mp.pan_number || prev.panNumber,
                aadhaarNumber: mp.aadhaarNumber || mp.aadhaar_number || prev.aadhaarNumber,
                businessName: mp.businessName || mp.business_name || prev.businessName,
                gstNumber: mp.gstNumber || mp.gst_number || prev.gstNumber,
                entityType: (mp.entityType || mp.entity_type || prev.entityType) as EntityType || '',

                registeredAddress: hasAddress ? {
                    addressLine1: addrLine1 || '',
                    city: city || '',
                    state: state || '',
                    pincode: postalCode || '',
                    country: country,
                } : prev.registeredAddress,
                operatingAddress: hasAddress ? {
                    addressLine1: addrLine1 || '',
                    city: city || '',
                    state: state || '',
                    pincode: postalCode || '',
                    country: country,
                } : prev.operatingAddress,

                persons: persons.length > 0 ? persons : prev.persons,

                kycData: kyc ? {
                    isVideoCompleted: kyc.videoKycCompleted ?? kyc.video_kyc_completed ?? false,
                    locationVerified: kyc.locationCaptured ?? kyc.location_captured ?? false,
                    fullAddress: kyc.fullAddress || kyc.full_address || '',
                    city: kyc.city || '',
                    state: kyc.state || '',
                    pincode: kyc.pincode || '',
                } : prev.kycData,

                bankDetails: bankDto ? {
                    accountNumber: bankDto.accountNumber || bankDto.account_number || prev.bankDetails?.accountNumber || '',
                    ifscCode: bankDto.ifscCode || bankDto.ifsc_code || prev.bankDetails?.ifscCode || '',
                    bankName: bankDto.bankName || bankDto.bank_name || prev.bankDetails?.bankName || '',
                    accountHolderName: bankDto.accountHolderName || bankDto.account_holder_name || prev.bankDetails?.accountHolderName || '',
                } : prev.bankDetails,

                selectedProducts: (() => {
                    try {
                        const raw = mp.selectedProducts || mp.selected_products;
                        const parsed = typeof raw === 'string'
                            ? JSON.parse(raw)
                            : (Array.isArray(raw) ? raw : []);
                        const codes = parsed
                            .map((p: any) => p.product_code || p.productCode || p)
                            .filter(Boolean);
                        return codes.length > 0 ? codes : prev.selectedProducts;
                    } catch { return prev.selectedProducts; }
                })(),

                entityDocuments: (
                    (mp.entityType || mp.entity_type) &&
                    prev.entityDocuments.length === 0
                )
                    ? getEntityDocRequirements((mp.entityType || mp.entity_type) as EntityType)
                    : prev.entityDocuments,
            };
        });
    }, [merchantProfile]);

    useEffect(() => {
        if (!documents?.length) return;
        const keyMap: Record<string, string> = {
            pan_card: 'panCard',
            aadhaar_card: 'aadhaarCard',
            business_proof: 'businessProof',
            bank_statement: 'bankStatement',
            cancelled_cheque: 'cancelledCheque',
        };
        const docMap: Record<string, { file: File; path: string }> = {};
        documents.forEach(doc => {
            const key = keyMap[doc.documentType];
            if (key) {
                docMap[key] = {
                    file: new File([], doc.fileName, { type: doc.mimeType || 'application/octet-stream' }),
                    path: doc.filePath,
                };
            }
        });
        if (Object.keys(docMap).length > 0) {
            setOnboardingData(prev => ({
                ...prev,
                documents: { ...prev.documents, ...docMap },
            }));
        }
    }, [documents]);

    useEffect(() => {
        setSavedProgress({
            currentStep,
            completedAt: currentStep === 'dashboard' ? new Date().toISOString() : null,
            lastUpdated: new Date().toISOString(),
        });
    }, [currentStep, setSavedProgress]);
    useEffect(() => {
        setSavedProgress({
            currentStep,
            completedAt: currentStep === 'dashboard' ? new Date().toISOString() : null,
            lastUpdated: new Date().toISOString(),
        });
    }, [currentStep, setSavedProgress]);

    useEffect(() => {
        if (!merchantProfile || stepRestoredRef.current || profileLoading) return;

        const status = merchantProfile.onboardingStatus || merchantProfile.onboarding_status;
        const requestedStep = new URLSearchParams(location.search).get('step');

        const isMandateComplete = Boolean(
            (merchantProfile.upiMandateStatus || merchantProfile.upi_mandate_status) === 'active' ||
            ((merchantProfile.upiVpa || merchantProfile.upi_vpa) && (merchantProfile.upiQrString || merchantProfile.upi_qr_string)) ||
            merchantProfile.agreementSigned || merchantProfile.agreement_signed ||
            merchantProfile.pgAgreementSigned || merchantProfile.pg_agreement_signed
        );

        // Explicit dashboard navigation should win over auto-resume logic.
        if (requestedStep === 'dashboard') {
            goToStep('dashboard');
            stepRestoredRef.current = true;
            return;
        }

        // Submitted/pending/in_progress status → dashboard or mandate flow
        if (['submitted', 'pending', 'in_progress'].includes(status || '') && !isMandateComplete) {
            goToStep('review');
            setShowMandateFlow(true);
            stepRestoredRef.current = true;
            return;
        }

        // Terminal statuses → dashboard
        if (['approved', 'verified', 'validating',
             'pending_bank_approval', 'cpv_pending', 'cpv_verified',
             'agreement_pending', 'agreement_signed', 'pending', 'in_progress'].includes(status || '')) {
            goToStep('dashboard');
            stepRestoredRef.current = true;
            return;
        }

        // Submitted/pending/in_progress with mandate completed → dashboard
        if (['submitted', 'pending', 'in_progress'].includes(status || '') && isMandateComplete) {
            goToStep('dashboard');
            stepRestoredRef.current = true;
            return;
        }

        // Rejection → review
        if (['validation_failed', 'rejected', 'bank_rejected'].includes(status || '')) {
            goToStep('review');
            stepRestoredRef.current = true;
            return;
        }


        const hasEntityType = Boolean(merchantProfile.entityType || merchantProfile.entity_type);

        let dbProducts: unknown[] = [];
        try {
            const raw = merchantProfile.selectedProducts || merchantProfile.selected_products;
            dbProducts = typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []);
        } catch { dbProducts = []; }
        const hasProducts = dbProducts.length > 0;

        const hasBusinessDetails = Boolean(merchantProfile.businessName || merchantProfile.business_name);

        const hasPersonDocs = (documents || []).some(
            d => d.documentType === 'pan_card' || d.documentType === 'aadhaar_card'
        );

        const hasEntityDocs = (documents || []).some(
            d => ['gst_certificate', 'partnership_deed', 'llp_agreement', 'moa',
                  'aoa', 'certificate_of_incorporation', 'trust_deed', 'huf_deed',
                  'undertaking', 'affiliation_letter'].includes(d.documentType)
        );

        const hasDoingBusiness = (documents || []).some(
            d => d.documentType === 'utility_bill' || d.documentType === 'rent_agreement'
        );

        const hasBankDetails = Boolean(bankDetails?.accountNumber);
        const hasKYC = merchantProfile.cpv_status === 'cpv_verified'
            || (merchantProfile as any).cpvSubmitted === true
            || (merchantProfile as any).verification_submitted === true
            || Boolean(kycData?.videoKycCompleted && kycData?.locationCaptured);

        if (!hasEntityType) { goToStep('entity-type'); }
        else if (!hasProducts) { goToStep('products'); }
        else if (!hasBusinessDetails) { goToStep('business-details'); }
        else if (!hasPersonDocs) { goToStep('person-kyc'); }
        else if (!hasEntityDocs) { goToStep('entity-documents'); }
        else if (!hasDoingBusiness && onboardingData.operatingAddressDifferent) { goToStep('doing-business'); }
        else if (!hasBankDetails) { goToStep('bank-details'); }
        else if (!hasKYC) { goToStep('kyc'); }
        else { goToStep('review'); }

        stepRestoredRef.current = true;
    }, [merchantProfile, bankDetails, documents, kycData, profileLoading, goToStep, onboardingData.operatingAddressDifferent, location.search]);

    useEffect(() => {
        if (!user?.id || !merchantProfile?.id) return;
        const interval = setInterval(async () => {
            try {
                const profile = await api.get('/merchant/profile');
                if (profile?.onboardingStatus && profile.onboardingStatus !== merchantProfile.onboardingStatus) {
                    toast({
                        title: 'Status Updated',
                        description: `Application status: ${profile.onboardingStatus?.replace(/_/g, ' ')}`,
                    });
                }
            } catch {}
        }, 30000);
        return () => clearInterval(interval);
    }, [user?.id, merchantProfile?.id, merchantProfile?.onboardingStatus, toast]);

    if (profileLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5">
                <Card className="p-8">
                    <CardContent className="flex items-center space-x-4">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <div>
                            <h3 className="font-semibold text-foreground">Loading…</h3>
                            <p className="text-sm text-muted-foreground">Fetching your onboarding progress</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (currentStep === 'dashboard') {
        return <OnboardingDashboard />;
    }

    const currentStepInfo = ONBOARDING_STEPS.find(s => s.id === currentStep);
    const CurrentStepComponent = currentStepInfo?.component || WelcomeScreen;

    return (
        <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5">
            {currentStep !== 'welcome' && (
                <div className="sticky top-0 z-50 bg-card/95 backdrop-blur border-b">
                    <div className="container max-w-6xl mx-auto px-4 py-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <img
                                    src="/sabbpe-logo.png"
                                    alt="SabbPe"
                                    className="h-8 w-auto"
                                />
                                <div>
                                    <h1 className="text-base font-bold text-primary">SabbPe</h1>
                                    <p className="text-xs text-muted-foreground">
                                        Step {currentStepIndex + 1} of {totalSteps}: {currentStepInfo?.title}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <LanguageSelector compact />
                                <div className="text-right hidden md:block">
                                    <div className="text-sm font-medium">{Math.round(progress)}% Complete</div>
                                    <div className="text-xs text-muted-foreground">{currentStepInfo?.description}</div>
                                </div>
                                <Button variant="outline" size="sm" onClick={handleSignOut} className="flex items-center gap-2">
                                    <LogOut className="h-4 w-4" />
                                    <span className="hidden sm:inline">Sign Out</span>
                                </Button>
                            </div>
                        </div>

                        <Progress value={progress} className="h-1.5 mb-3" />

                        <div className="flex justify-between items-center overflow-x-auto pb-1">
                            {ONBOARDING_STEPS.map((step, index) => {
                                const isActive = step.id === currentStep;
                                const isCompleted = isStepCompleted(step.id);
                                const isPast = index < currentStepIndex;

                                return (
                                    <div key={step.id} className="flex flex-col items-center min-w-[40px]">
                                        <button
                                            onClick={() => handleGoToStep(step.id)}
                                            disabled={!isPast && !isActive}
                                            className={`
                                                w-8 h-8 rounded-full flex items-center justify-center
                                                text-xs font-semibold transition-all duration-200
                                                ${isActive
                                                    ? 'bg-primary text-primary-foreground ring-4 ring-primary/20 scale-110'
                                                    : isCompleted
                                                        ? 'bg-green-500 text-white hover:bg-green-600'
                                                        : isPast
                                                            ? 'bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30'
                                                            : 'bg-muted text-muted-foreground cursor-not-allowed'
                                                }
                                            `}
                                        >
                                            {isCompleted && !isActive
                                                ? <CheckCircle className="w-4 h-4" />
                                                : index + 1
                                            }
                                        </button>
                                        <span className={`text-xs mt-1 hidden lg:block text-center ${isActive ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                                            {step.title}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            <div className="container max-w-6xl mx-auto px-4 py-8">
                <CurrentStepComponent {...stepProps} />
            </div>

            <SuccessPopup
                isOpen={showSuccessPopup}
                onClose={() => setShowSuccessPopup(false)}
                onGoToDashboard={() => {
                    setShowSuccessPopup(false);
                    setShowMandatePopup(true);
                }}
            />

            <MandatePopup
                isOpen={showMandatePopup}
                onEnableMandate={() => {
                    setShowMandatePopup(false);
                    setShowMandateFlow(true);
                }}
            />

            <MandateFlowModal
                isOpen={showMandateFlow}
                onClose={() => setShowMandateFlow(false)}
                onComplete={() => {
                    setShowMandateFlow(false);
                    goToStep('dashboard');
                }}
                merchantProfile={merchantProfile}
                user={user}
                refetchMerchant={refetch}
            />

            <OnboardingChatbot
                currentStep={currentStep}
                onDataChange={(data) => {
                    const mapped = mapChatbotData(currentStep, data);
                    handleDataChange(mapped);
                }}
                language={language}
            />

            {import.meta.env.DEV && (
                <div className="fixed bottom-4 right-4 bg-black/80 text-white p-3 rounded-lg text-xs max-w-xs space-y-1">
                    <div className="font-bold">Debug</div>
                    <div>Step: {currentStep}</div>
                    <div>Entity: {onboardingData.entityType || '"”'}</div>
                    <div>Persons: {onboardingData.persons.length}</div>
                    <div>Progress: {Math.round(progress)}%</div>
                    <div>Status: {merchantProfile?.onboarding_status || '"”'}</div>
                    <div>OpAddr diff: {String(onboardingData.operatingAddressDifferent)}</div>
                </div>
            )}
        </div>
    );
};

export default EnhancedOnboardingFlow;
