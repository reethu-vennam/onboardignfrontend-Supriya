// src/components/onboarding/BusinessDetails.tsx
//
// Step 4 of merchant onboarding " business information and addresses.
// Split from MerchantRegistration.tsx. Handles:
//   - Business name, GST, website, industry
//   - Registered address
//   - Operating address (conditional " only if different)
//   - Sets operatingAddressDifferent flag which gates doing-business step
//
// Saves to merchant_profiles on Continue.

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useMerchantData } from '@/hooks/useMerchantData';
import { useAuth } from '@/components/auth/AuthProvider';
import { authService } from '@/lib/auth-service';
import { api } from '@/lib/rest-api';
import {
    OnboardingData,
    Address,
    EMPTY_ADDRESS,
    EntityType,
} from '@/types/onboarding';
import { useI18n } from '@/i18n/I18nProvider';
import {
    Building2,
    MapPin,
    Globe,
    Briefcase,
    ChevronRight,
    AlertCircle,
    CheckCircle2,
    Copy,
} from 'lucide-react';

// â”€â”€â”€ Indian states list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

// â”€â”€â”€ Industry options by entity type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const INDUSTRY_OPTIONS: Record<string, string[]> = {
    default: [
        'E-Commerce & Retail',
        'Food & Beverages',
        'Travel & Hospitality',
        'Healthcare & Pharma',
        'Education & Training',
        'Financial Services',
        'Technology & Software',
        'Manufacturing',
        'Real Estate',
        'Logistics & Transport',
        'Media & Entertainment',
        'Professional Services',
        'Non-Profit / NGO',
        'Government / PSU',
        'Other',
    ],
};

// â”€â”€â”€ Validation helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PINCODE_REGEX = /^[1-9][0-9]{5}$/;
const WEBSITE_REGEX = /^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w-./?%&=]*)?$/;

function validateGST(gst: string, invalidMsg: string): string | null {
    if (!gst) return null;
    return GST_REGEX.test(gst) ? null : invalidMsg;
}

function validatePincode(pin: string, requiredMsg: string, invalidMsg: string): string | null {
    if (!pin) return requiredMsg;
    return PINCODE_REGEX.test(pin) ? null : invalidMsg;
}

function validateWebsite(url: string, invalidMsg: string): string | null {
    if (!url) return null;
    return WEBSITE_REGEX.test(url) ? null : invalidMsg;
}

// â”€â”€â”€ Address sub-form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface AddressFormProps {
    label: string;
    value: Address;
    onChange: (addr: Address) => void;
    errors: Partial<Record<keyof Address, string>>;
}

const AddressForm: React.FC<AddressFormProps> = ({ label, value, onChange, errors }) => {
    const { t } = useI18n();
    const set = (field: keyof Address) => (
        e: React.ChangeEvent<HTMLInputElement>
    ) => onChange({ ...value, [field]: e.target.value });

    const setSelect = (field: keyof Address) => (val: string) =>
        onChange({ ...value, [field]: val });

    return (
        <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                {label}
            </h3>

            <div className="grid gap-4">
                <div>
                    <Label>
                        {t('businessDetails.addressLine1')} <span className="text-destructive">*</span>
                    </Label>
                    <Input
                        value={value.addressLine1}
                        onChange={set('addressLine1')}
                        placeholder={t('businessDetails.placeholderAddress')}
                        className={errors.addressLine1 ? 'border-destructive' : ''}
                    />
                    {errors.addressLine1 && (
                        <p className="text-xs text-destructive mt-1">{errors.addressLine1}</p>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label>
                            {t('businessDetails.city')} <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            value={value.city}
                            onChange={set('city')}
                            placeholder={t('businessDetails.city')}
                            className={errors.city ? 'border-destructive' : ''}
                        />
                        {errors.city && (
                            <p className="text-xs text-destructive mt-1">{errors.city}</p>
                        )}
                    </div>

                    <div>
                        <Label>
                            {t('businessDetails.pincode')} <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            value={value.pincode}
                            onChange={set('pincode')}
                            placeholder="560001"
                            maxLength={6}
                            className={errors.pincode ? 'border-destructive' : ''}
                        />
                        {errors.pincode && (
                            <p className="text-xs text-destructive mt-1">{errors.pincode}</p>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label>
                            {t('businessDetails.state')} <span className="text-destructive">*</span>
                        </Label>
                        <Select value={value.state} onValueChange={setSelect('state')}>
                            <SelectTrigger className={errors.state ? 'border-destructive' : ''}>
                                <SelectValue placeholder={t('businessDetails.selectState')} />
                            </SelectTrigger>
                            <SelectContent>
                                {INDIAN_STATES.map(s => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {errors.state && (
                            <p className="text-xs text-destructive mt-1">{errors.state}</p>
                        )}
                    </div>

                    <div>
                        <Label>{t('businessDetails.country')}</Label>
                        <Input value="India" disabled className="bg-muted" />
                    </div>
                </div>
            </div>
        </div>
    );
};

// â”€â”€â”€ Props â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface BusinessDetailsProps {
    data?: Partial<OnboardingData>;
    onDataChange?: (data: Partial<OnboardingData>) => void;
    onNext?: (data?: Partial<OnboardingData>) => void;
    onPrev?: () => void;
    merchantProfile?: Record<string, unknown>;
}

// â”€â”€â”€ Field error map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface FieldErrors {
    businessName?: string;
    gstNumber?: string;
    businessWebsite?: string;
    businessIndustry?: string;
    mobileNumber?: string;
    email?: string;
    registeredAddress?: Partial<Record<keyof Address, string>>;
    operatingAddress?: Partial<Record<keyof Address, string>>;
}

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const BusinessDetails: React.FC<BusinessDetailsProps> = ({
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
    const isEducation = entityType === 'education';
    const isGovt = entityType === 'government_psu';
    const isProprietorship = entityType === 'proprietorship';
    // Education and Govt: GST/PAN mandatory via entity docs, not here
    const gstMandatory = !isEducation && !isGovt && entityType !== 'individual' && !isProprietorship;

    // â”€â”€ Form state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const [businessName, setBusinessName] = useState(
    data?.businessName || (merchantProfile?.business_name as string) || ''
);
const [gstNumber, setGstNumber] = useState(
    data?.gstNumber || (merchantProfile?.gst_number as string) || ''
);
const [mobileNumber, setMobileNumber] = useState(
    data?.mobileNumber || (merchantProfile?.mobile_number as string) || ''
);
    const [email, setEmail] = useState(
    data?.email || (merchantProfile?.email as string) || ''
);
    const [hasGST, setHasGST] = useState(data?.hasGST ?? true);
    const shouldCollectGST = !isEducation && !isGovt && hasGST;
    const [businessWebsite, setBusinessWebsite] = useState(data?.businessWebsite || '');
    const [businessIndustry, setBusinessIndustry] = useState(data?.businessIndustry || '');

    const [registeredAddress, setRegisteredAddress] = useState<Address>(
        data?.registeredAddress || { ...EMPTY_ADDRESS }
    );
    const [operatingAddressDifferent, setOperatingAddressDifferent] = useState(
        data?.operatingAddressDifferent ?? false
    );
    const [operatingAddress, setOperatingAddress] = useState<Address>(
        data?.operatingAddress || { ...EMPTY_ADDRESS }
    );

    const [errors, setErrors] = useState<FieldErrors>({});
    const [saving, setSaving] = useState(false);

    // Pre-fill from merchantProfile on mount
    useEffect(() => {
        if (merchantProfile) {
            if (!businessName && merchantProfile.business_name)
                setBusinessName(merchantProfile.business_name as string);
            if (!gstNumber && merchantProfile.gst_number)
                setGstNumber(merchantProfile.gst_number as string);
            if (!mobileNumber && merchantProfile.mobile_number)
                setMobileNumber(merchantProfile.mobile_number as string);
            if (!email && merchantProfile.email)
                setEmail(merchantProfile.email as string);
            // Restore address from registration_details if saved
const regDetails = (merchantProfile as any).registration_details as Record<string, unknown> | null;
            if (regDetails && regDetails.registeredAddress) {
                setRegisteredAddress(regDetails.registeredAddress as Address);
            }
            if (regDetails && regDetails.operatingAddress) {
                setOperatingAddress(regDetails.operatingAddress as Address);
            }
            if (regDetails && regDetails.operatingAddressDifferent !== undefined) {
                setOperatingAddressDifferent(regDetails.operatingAddressDifferent as boolean);
            }
        }
    }, []);

    // Sync form fields when chatbot fills data
    useEffect(() => {
        if (!data) return;
        const d = data as Partial<OnboardingData>;
        if (d.businessName) setBusinessName(d.businessName);
        if (d.gstNumber) setGstNumber(d.gstNumber);
        if (d.hasGST !== undefined) setHasGST(d.hasGST);
        if (d.registeredAddress) {
            setRegisteredAddress(d.registeredAddress);
        }
    }, [data?.businessName, data?.gstNumber, data?.hasGST, data?.registeredAddress]);

    // Copy registered address to operating address
    const handleCopyAddress = useCallback(() => {
        setOperatingAddress({ ...registeredAddress });
        toast({ title: t('businessDetails.addressCopied'), description: t('businessDetails.addressCopiedDesc') });
    }, [registeredAddress, toast, t]);

    // â”€â”€ Validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const validate = useCallback((): boolean => {
        const errs: FieldErrors = {};

        if (!businessName.trim()) errs.businessName = t('businessDetails.errBusinessName');
        if (!mobileNumber.trim() || mobileNumber.replace(/\D/g, '').length < 10)
            errs.mobileNumber = t('businessDetails.errMobile');
        if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            errs.email = t('businessDetails.errEmail');

        const gstErr = shouldCollectGST ? validateGST(gstNumber, t('businessDetails.errGstFormat')) : null;
        if (shouldCollectGST && !gstNumber.trim()) {
            errs.gstNumber = t('businessDetails.errGstRequired');
        } else if (gstErr) {
            errs.gstNumber = gstErr;
        }

        const websiteErr = validateWebsite(businessWebsite, t('businessDetails.errWebsiteInvalid'));
        if (websiteErr) errs.businessWebsite = websiteErr;

        const regErrs: Partial<Record<keyof Address, string>> = {};
        const required = t('businessDetails.required');
        if (!registeredAddress.addressLine1.trim()) regErrs.addressLine1 = required;
        if (!registeredAddress.city.trim()) regErrs.city = required;
        if (!registeredAddress.state) regErrs.state = required;
        const pinErr = validatePincode(
            registeredAddress.pincode,
            t('businessDetails.errPincodeRequired'),
            t('businessDetails.errPincodeInvalid'),
        );
        if (pinErr) regErrs.pincode = pinErr;
        if (Object.keys(regErrs).length > 0) errs.registeredAddress = regErrs;

        if (operatingAddressDifferent) {
            const opErrs: Partial<Record<keyof Address, string>> = {};
            if (!operatingAddress.addressLine1.trim()) opErrs.addressLine1 = required;
            if (!operatingAddress.city.trim()) opErrs.city = required;
            if (!operatingAddress.state) opErrs.state = required;
            const opPinErr = validatePincode(
                operatingAddress.pincode,
                t('businessDetails.errPincodeRequired'),
                t('businessDetails.errPincodeInvalid'),
            );
            if (opPinErr) opErrs.pincode = opPinErr;
            if (Object.keys(opErrs).length > 0) errs.operatingAddress = opErrs;
        }

        setErrors(errs);
        return Object.keys(errs).length === 0;
    }, [
        businessName, mobileNumber, email, gstNumber, hasGST,
        businessWebsite, registeredAddress, operatingAddressDifferent, operatingAddress,
        shouldCollectGST, t,
    ]);

    // â”€â”€ Save and continue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const handleContinue = useCallback(async () => {
        if (!validate()) {
            toast({
                variant: 'destructive',
                title: t('businessDetails.fixErrorsTitle'),
                description: t('businessDetails.fixErrorsDesc'),
            });
            return;
        }

        setSaving(true);

        try {
            const merchantId = merchantProfile?.id as string | undefined;
            const userId = merchantProfile?.user_id as string | undefined || user?.id;

            // Build registration_details JSONB " store address data here
            // since merchant_profiles has no dedicated address columns
            const registrationDetails = {
                registeredAddress,
                operatingAddress: operatingAddressDifferent ? operatingAddress : registeredAddress,
                operatingAddressDifferent,
                businessWebsite,
                businessIndustry,
            };

            const updatePayload = {
                businessName: businessName.trim(),
                gstNumber: shouldCollectGST ? gstNumber.trim().toUpperCase() : null,
                mobileNumber: mobileNumber.trim(),
                email: email.trim().toLowerCase(),
                businessAddressLine1: registeredAddress.addressLine1 || null,
                businessCity: registeredAddress.city || null,
                businessState: registeredAddress.state || null,
                businessPostalCode: registeredAddress.pincode || null,
                businessCountry: registeredAddress.country || 'India',
            };

            let saveError = null;

            try {
                await api.post('/merchant/profile', updatePayload);
            } catch (e: any) {
                console.error('Failed to save business details:', e);
                toast({ variant: 'destructive', title: t('businessDetails.saveFailedTitle'), description: t('businessDetails.saveFailedDesc') });
                return;
            }

            if (saveError) {
                console.error('Failed to save business details:', saveError);
                toast({
                    variant: 'destructive',
                    title: t('businessDetails.saveFailedTitle'),
                    description: t('businessDetails.saveFailedDesc'),
                });
                return;
            }

            // Update parent state
            const nextBusinessDetails: Partial<OnboardingData> = {
                businessName: businessName.trim(),
                gstNumber: shouldCollectGST ? gstNumber.trim().toUpperCase() : '',
                hasGST,
                businessWebsite,
                businessIndustry,
                mobileNumber: mobileNumber.trim(),
                email: email.trim().toLowerCase(),
                registeredAddress,
                operatingAddress: operatingAddressDifferent ? operatingAddress : registeredAddress,
                operatingAddressDifferent,
            };

            onDataChange?.(nextBusinessDetails);

            onNext?.(nextBusinessDetails);
        } catch (err) {
            console.error('Unexpected error saving business details:', err);
            toast({
                variant: 'destructive',
                title: t('businessDetails.unexpectedTitle'),
                description: t('businessDetails.unexpectedDesc'),
            });
        } finally {
            setSaving(false);
        }
    }, [
        validate, merchantProfile, user?.id, businessName, gstNumber, hasGST,
        businessWebsite, businessIndustry, mobileNumber, email,
        registeredAddress, operatingAddress, operatingAddressDifferent,
        shouldCollectGST, onDataChange, onNext, toast, t,
    ]);

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    return (
        <div className="max-w-3xl mx-auto space-y-8 pb-12">

            {/* Header */}
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-foreground">{t('businessDetails.title')}</h2>
                <p className="text-muted-foreground text-base">
                    {t('businessDetails.subtitle')}
                </p>
            </div>

            {/* Entity type badge */}
            {entityType && (
                <div className="flex justify-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
                        <CheckCircle2 className="h-4 w-4" />
                        {entityType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </div>
                </div>
            )}

            {/* â”€â”€ Business Information â”€â”€ */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Building2 className="h-5 w-5 text-primary" />
                        {t('businessDetails.businessInfo')}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">

                    {/* Business name */}
                    <div>
                        <Label>
                            {t('businessDetails.businessName')} <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            value={businessName}
                            onChange={e => setBusinessName(e.target.value)}
                            placeholder={t('businessDetails.placeholderBusinessName')}
                            className={errors.businessName ? 'border-destructive mt-1' : 'mt-1'}
                        />
                        {errors.businessName && (
                            <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" /> {errors.businessName}
                            </p>
                        )}
                    </div>

                    {/* Contact */}
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <Label>
                                {t('businessDetails.mobileNumber')} <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                value={mobileNumber}
                                onChange={e => setMobileNumber(e.target.value.replace(/\D/g, ''))}
                                placeholder="9876543210"
                                maxLength={10}
                                className={errors.mobileNumber ? 'border-destructive mt-1' : 'mt-1'}
                            />
                            {errors.mobileNumber && (
                                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" /> {errors.mobileNumber}
                                </p>
                            )}
                        </div>

                        <div>
                            <Label>
                                {t('businessDetails.emailAddress')} <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="contact@business.com"
                                className={errors.email ? 'border-destructive mt-1' : 'mt-1'}
                            />
                            {errors.email && (
                                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" /> {errors.email}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* GST toggle */}
                    {!isEducation && !isGovt && (
                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border">
                            <div>
                                <p className="text-sm font-medium text-foreground">{t('businessDetails.gstRegistered')}</p>
                                <p className="text-xs text-muted-foreground">
                                    {gstMandatory
                                        ? t('businessDetails.gstMandatory')
                                        : isProprietorship
                                            ? t('businessDetails.gstProprietorship')
                                            : t('businessDetails.gstOptional')}
                                </p>
                            </div>
                            <Switch
                                checked={hasGST}
                                onCheckedChange={v => {
                                    if (gstMandatory && !v) return; // can't toggle off if mandatory
                                    setHasGST(v);
                                    if (!v) setGstNumber('');
                                }}
                                disabled={gstMandatory}
                            />
                        </div>
                    )}

                    {/* GST number */}
                    {hasGST && !isEducation && !isGovt && (
                        <div>
                            <Label>
                                {t('businessDetails.gstNumber')} <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                value={gstNumber}
                                onChange={e => setGstNumber(e.target.value.toUpperCase())}
                                placeholder="29ABBCA6434H1ZN"
                                maxLength={15}
                                className={errors.gstNumber ? 'border-destructive mt-1' : 'mt-1'}
                            />
                            {errors.gstNumber && (
                                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" /> {errors.gstNumber}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Optional fields */}
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <Label className="flex items-center gap-1">
                                <Globe className="h-3.5 w-3.5" />
                                {t('businessDetails.businessWebsite')}
                            </Label>
                            <Input
                                value={businessWebsite}
                                onChange={e => setBusinessWebsite(e.target.value)}
                                placeholder={t('businessDetails.placeholderWebsite')}
                                className={errors.businessWebsite ? 'border-destructive mt-1' : 'mt-1'}
                            />
                            {errors.businessWebsite && (
                                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" /> {errors.businessWebsite}
                                </p>
                            )}
                        </div>

                        <div>
                            <Label className="flex items-center gap-1">
                                <Briefcase className="h-3.5 w-3.5" />
                                {t('businessDetails.businessIndustry')}
                            </Label>
                            <Select value={businessIndustry} onValueChange={setBusinessIndustry}>
                                <SelectTrigger className="mt-1">
                                    <SelectValue placeholder={t('businessDetails.selectIndustry')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {INDUSTRY_OPTIONS.default.map(ind => (
                                        <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* â”€â”€ Registered Address â”€â”€ */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <MapPin className="h-5 w-5 text-primary" />
                        {t('businessDetails.registeredAddress')}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <AddressForm
                        label={t('businessDetails.registeredAddress')}
                        value={registeredAddress}
                        onChange={setRegisteredAddress}
                        errors={errors.registeredAddress || {}}
                    />
                </CardContent>
            </Card>

            {/* â”€â”€ Operating Address toggle â”€â”€ */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <MapPin className="h-5 w-5 text-primary" />
                        {t('businessDetails.operatingAddress')}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border">
                        <div>
                            <p className="text-sm font-medium text-foreground">
                                {t('businessDetails.operatingDifferent')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {t('businessDetails.operatingDifferentHint')}
                            </p>
                        </div>
                        <Switch
                            checked={operatingAddressDifferent}
                            onCheckedChange={v => {
                                setOperatingAddressDifferent(v);
                                if (!v) setOperatingAddress({ ...EMPTY_ADDRESS });
                            }}
                        />
                    </div>

                    {operatingAddressDifferent ? (
                        <div className="space-y-4">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCopyAddress}
                                className="flex items-center gap-2 text-xs"
                            >
                                <Copy className="h-3.5 w-3.5" />
                                {t('businessDetails.copyFromRegistered')}
                            </Button>
                            <AddressForm
                                label={t('businessDetails.operatingAddress')}
                                value={operatingAddress}
                                onChange={setOperatingAddress}
                                errors={errors.operatingAddress || {}}
                            />
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted/30 rounded-lg">
                            <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                            {t('businessDetails.operatingSame')}
                        </div>
                    )}
                </CardContent>
            </Card>

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

export default BusinessDetails;


