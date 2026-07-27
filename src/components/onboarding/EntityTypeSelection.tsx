// src/components/onboarding/EntityTypeSelection.tsx
//
// Step 2 of merchant onboarding — select entity type.
// Saves entity_type to merchant_profiles immediately on Continue
// so step restoration works correctly on page refresh.

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useMerchantData } from '@/hooks/useMerchantData';
import { authService } from '@/lib/auth-service';
import { api } from '@/lib/rest-api';
import { useAuth } from '@/components/auth/AuthProvider';
import { useI18n } from '@/i18n/I18nProvider';
import {
    EntityType,
    OnboardingData,
    getEntityDocRequirements,
    MIN_PERSONS,
    PRIMARY_PERSON_ROLE,
    REQUIRES_AADHAAR,
    AUTHORITY_LETTER_APPLICABLE,
} from '@/types/onboarding';
import {
    Building2,
    User,
    Users,
    Landmark,
    Building,
    Scale,
    Heart,
    BookOpen,
    Shield,
    Home,
    CheckCircle2,
    ChevronRight,
    Info,
} from 'lucide-react';

// ─── Entity definitions ───────────────────────────────────────────────────────

interface EntityOption {
    type: EntityType;
    label: string;
    description: string;
    examples: string;
    icon: React.ComponentType<{ className?: string }>;
    personLabel: string;
    minPersons: number;
    requiresAadhaar: boolean;
    authorityLetterApplicable: boolean;
    riskLevel: 'low' | 'medium' | 'high';
}

const ENTITY_OPTIONS: EntityOption[] = [
    {
        type: 'proprietorship',
        label: 'Proprietorship',
        description: 'Single owner business, not separately registered',
        examples: 'Shops, freelancers, sole traders',
        icon: User,
        personLabel: 'Proprietor',
        minPersons: MIN_PERSONS.proprietorship,
        requiresAadhaar: REQUIRES_AADHAAR.proprietorship,
        authorityLetterApplicable: AUTHORITY_LETTER_APPLICABLE.proprietorship,
        riskLevel: 'low',
    },
    {
        type: 'individual',
        label: 'Individual / Non-Registered',
        description: 'No business registration or current account',
        examples: 'Unregistered vendors, individuals',
        icon: User,
        personLabel: 'Authorized Person',
        minPersons: MIN_PERSONS.individual,
        requiresAadhaar: REQUIRES_AADHAAR.individual,
        authorityLetterApplicable: AUTHORITY_LETTER_APPLICABLE.individual,
        riskLevel: 'low',
    },
    {
        type: 'partnership',
        label: 'Partnership Firm',
        description: 'Two or more partners with a partnership deed',
        examples: 'Law firms, CA firms, trading firms',
        icon: Users,
        personLabel: 'Partners',
        minPersons: MIN_PERSONS.partnership,
        requiresAadhaar: REQUIRES_AADHAAR.partnership,
        authorityLetterApplicable: AUTHORITY_LETTER_APPLICABLE.partnership,
        riskLevel: 'medium',
    },
    {
        type: 'llp',
        label: 'LLP',
        description: 'Limited Liability Partnership registered with MCA',
        examples: 'Professional LLPs, startup LLPs',
        icon: Scale,
        personLabel: 'Designated Partners',
        minPersons: MIN_PERSONS.llp,
        requiresAadhaar: REQUIRES_AADHAAR.llp,
        authorityLetterApplicable: AUTHORITY_LETTER_APPLICABLE.llp,
        riskLevel: 'medium',
    },
    {
        type: 'pvt_ltd',
        label: 'Private Limited',
        description: 'Company incorporated under Companies Act',
        examples: 'Startups, SMEs, tech companies',
        icon: Building2,
        personLabel: 'Directors',
        minPersons: MIN_PERSONS.pvt_ltd,
        requiresAadhaar: REQUIRES_AADHAAR.pvt_ltd,
        authorityLetterApplicable: AUTHORITY_LETTER_APPLICABLE.pvt_ltd,
        riskLevel: 'medium',
    },
    {
        type: 'public_ltd',
        label: 'Public Limited',
        description: 'Publicly listed or unlisted public company',
        examples: 'Large corporates, listed companies',
        icon: Building,
        personLabel: 'Directors',
        minPersons: MIN_PERSONS.public_ltd,
        requiresAadhaar: REQUIRES_AADHAAR.public_ltd,
        authorityLetterApplicable: AUTHORITY_LETTER_APPLICABLE.public_ltd,
        riskLevel: 'high',
    },
    {
        type: 'trust',
        label: 'Trust / Society',
        description: 'Registered trust or society with trust deed',
        examples: 'NGOs, charitable trusts, societies',
        icon: Heart,
        personLabel: 'Trustee',
        minPersons: MIN_PERSONS.trust,
        requiresAadhaar: REQUIRES_AADHAAR.trust,
        authorityLetterApplicable: AUTHORITY_LETTER_APPLICABLE.trust,
        riskLevel: 'medium',
    },
    {
        type: 'huf',
        label: 'HUF',
        description: 'Hindu Undivided Family with HUF PAN and deed',
        examples: 'Family businesses under HUF structure',
        icon: Home,
        personLabel: 'Karta',
        minPersons: MIN_PERSONS.huf,
        requiresAadhaar: REQUIRES_AADHAAR.huf,
        authorityLetterApplicable: AUTHORITY_LETTER_APPLICABLE.huf,
        riskLevel: 'medium',
    },
    {
        type: 'education',
        label: 'Education Institution',
        description: 'Schools, colleges, coaching institutes',
        examples: 'Universities, schools, EdTech',
        icon: BookOpen,
        personLabel: 'Signatory Authority',
        minPersons: MIN_PERSONS.education,
        requiresAadhaar: REQUIRES_AADHAAR.education,
        authorityLetterApplicable: AUTHORITY_LETTER_APPLICABLE.education,
        riskLevel: 'low',
    },
    {
        type: 'government_psu',
        label: 'Government / PSU',
        description: 'Government bodies, PSUs, municipal corporations',
        examples: 'Govt departments, PSUs, municipalities',
        icon: Shield,
        personLabel: 'Signatory Authority',
        minPersons: MIN_PERSONS.government_psu,
        requiresAadhaar: REQUIRES_AADHAAR.government_psu,
        authorityLetterApplicable: AUTHORITY_LETTER_APPLICABLE.government_psu,
        riskLevel: 'low',
    },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface EntityTypeSelectionProps {
    data?: Partial<OnboardingData>;
    onDataChange?: (data: Partial<OnboardingData>) => void;
    onNext?: () => void;
    onPrev?: () => void;
    merchantProfile?: Record<string, unknown>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const EntityTypeSelection: React.FC<EntityTypeSelectionProps> = ({
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

    const [selected, setSelected] = useState<EntityType | ''>(
        (data?.entityType as EntityType) || ''
    );
    const [saving, setSaving] = useState(false);
    const [hoveredType, setHoveredType] = useState<EntityType | null>(null);

    // Restore selection from data prop on mount
    useEffect(() => {
        if (data?.entityType) {
            setSelected(data.entityType as EntityType);
        }
    }, [data?.entityType]);

    const selectedOption = ENTITY_OPTIONS.find(o => o.type === selected) ?? null;

    const getOptionKey = (type: EntityType) => {
        const optionKeys: Record<EntityType, string> = {
            proprietorship: 'proprietorship',
            individual: 'individual',
            partnership: 'partnership',
            llp: 'llp',
            pvt_ltd: 'pvtLtd',
            public_ltd: 'publicLtd',
            trust: 'trust',
            society: 'trust',
            huf: 'huf',
            government_psu: 'governmentPsu',
            education: 'education',
        };
        return optionKeys[type];
    };

    const getOptionText = (option: EntityOption) => {
        const key = getOptionKey(option.type);
        return {
            label: t(`entity.options.${key}.label`),
            description: t(`entity.options.${key}.description`),
            examples: t(`entity.options.${key}.examples`),
            personLabel: t(`entity.options.${key}.personLabel`),
        };
    };

    const handleSelect = (type: EntityType) => {
        setSelected(type);
    };

    const handleContinue = async () => {
        if (!selected) {
            toast({
                variant: 'destructive',
                title: t('entity.selectErrorTitle'),
                description: t('entity.selectErrorDescription'),
            });
            return;
        }

        setSaving(true);

        try {
            // Save entity_type to DB immediately so refresh restores to correct step
            const merchantId = merchantProfile?.id as string | undefined;
            const userId = merchantProfile?.user_id as string | undefined || user?.id;

            try {
                const status = (merchantProfile as any)?.onboarding_status || (merchantProfile as any)?.onboardingStatus;
                const isEditable = !status || status === 'draft' || status === 'rejected';
                if (isEditable) {
                    await api.post('/merchant/profile', { entityType: selected });
                }
            } catch (err: any) {
                console.error('Failed to save entity_type:', err);
                toast({
                    variant: 'destructive',
                    title: t('entity.saveFailedTitle'),
                    description: t('entity.saveFailedDescription'),
                });
                return;
            }

            // Update parent onboarding data — also pre-populate entityDocuments
            // so EntityDocuments step has the right doc list ready
            const entityDocs = getEntityDocRequirements(selected as EntityType);

            onDataChange?.({
                entityType: selected,
                entityDocuments: entityDocs,
                // Reset persons when entity type changes to avoid stale data
                persons: [],
                authorizedSignatoryIsDifferent: false,
            });

            onNext?.();
        } catch (err) {
            console.error('Unexpected error saving entity type:', err);
            toast({
                variant: 'destructive',
                title: t('entity.unexpectedTitle'),
                description: t('entity.unexpectedDescription'),
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-12">

            {/* Header */}
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-foreground">
                    {t('entity.heading')}
                </h2>
                <p className="text-muted-foreground text-base max-w-xl mx-auto">
                    {t('entity.description')}
                </p>
            </div>

            {/* Entity grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {ENTITY_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const isSelected = selected === option.type;
                    const isHovered = hoveredType === option.type;
                    const optionText = getOptionText(option);

                    return (
                        <button
                            key={option.type}
                            onClick={() => handleSelect(option.type)}
                            onMouseEnter={() => setHoveredType(option.type)}
                            onMouseLeave={() => setHoveredType(null)}
                            className={`
                                relative text-left p-4 rounded-xl border-2 transition-all duration-150
                                focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
                                ${isSelected
                                    ? 'border-primary bg-primary/5 shadow-sm'
                                    : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40'
                                }
                            `}
                        >
                            {/* Selected checkmark */}
                            {isSelected && (
                                <CheckCircle2 className="absolute top-3 right-3 h-5 w-5 text-primary" />
                            )}

                            <div className="flex items-start gap-3">
                                <div className={`
                                    flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center
                                    ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
                                `}>
                                    <Icon className="h-5 w-5" />
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-sm text-foreground leading-tight">
                                        {optionText.label}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
                                        {optionText.description}
                                    </div>
                                    <div className="text-xs text-muted-foreground/70 mt-1 italic">
                                        {t('entity.examplesPrefix')} {optionText.examples}
                                    </div>
                                </div>
                            </div>

                            {/* Person requirement badge */}
                            {option.minPersons > 0 && (
                                <div className="mt-3 flex items-center gap-1.5">
                                    <Users className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground">
                                        {t('entity.minPersons', {
                                            count: option.minPersons,
                                            label: optionText.personLabel,
                                        })}
                                    </span>
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Selected entity — document preview panel */}
            {selectedOption && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-4">
                    <div className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="font-semibold text-sm text-foreground">
                            {t('entity.needFor', {
                                entity: getOptionText(selectedOption).label,
                            })}
                        </span>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4 text-sm">
                        {/* Person KYC */}
                        <div className="space-y-2">
                            <p className="font-medium text-foreground text-xs uppercase tracking-wide">
                                {t('entity.personKyc')}
                            </p>
                            <ul className="space-y-1.5">
                                <li className="flex items-start gap-2 text-muted-foreground">
                                    <ChevronRight className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-primary" />
                                    {t('entity.panCard', {
                                        label: getOptionText(selectedOption).personLabel,
                                    })}
                                </li>
                                <li className="flex items-start gap-2 text-muted-foreground">
                                    <ChevronRight className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-primary" />
                                    {t('entity.addressProof', {
                                        aadhaar: selectedOption.requiresAadhaar ? ' / Aadhaar' : '',
                                    })}
                                </li>
                                {selectedOption.requiresAadhaar && (
                                    <li className="flex items-start gap-2 text-muted-foreground">
                                        <ChevronRight className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-primary" />
                                        {t('entity.aadhaarCard')}
                                    </li>
                                )}
                                {selectedOption.minPersons > 1 && (
                                    <li className="flex items-start gap-2 text-muted-foreground">
                                        <ChevronRight className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-primary" />
                                        {t('entity.minimumPersons', {
                                            count: selectedOption.minPersons,
                                            label: getOptionText(selectedOption).personLabel,
                                        })}
                                    </li>
                                )}
                                {selectedOption.authorityLetterApplicable && (
                                    <li className="flex items-start gap-2 text-muted-foreground">
                                        <ChevronRight className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-primary" />
                                        {t('entity.authorityLetter')}
                                        <span className="text-xs">{t('entity.ifSignatoryDiffers')}</span>
                                    </li>
                                )}
                            </ul>
                        </div>

                        {/* Business docs */}
                        <div className="space-y-2">
                            <p className="font-medium text-foreground text-xs uppercase tracking-wide">
                                {t('entity.businessDocs')}
                            </p>
                            <ul className="space-y-1.5">
                                {getEntityDocRequirements(selectedOption.type).map(doc => (
                                    <li key={doc.docType} className="flex items-start gap-2 text-muted-foreground">
                                        <ChevronRight className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-primary" />
                                        {doc.label}
                                        {!doc.isMandatory && (
                                            <span className="text-xs text-muted-foreground/60 ml-1">
                                                ({t('common.optional')})
                                            </span>
                                        )}
                                    </li>
                                ))}
                                <li className="flex items-start gap-2 text-muted-foreground">
                                    <ChevronRight className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-primary" />
                                    {t('entity.cancelledCheque')}
                                </li>
                            </ul>
                        </div>
                    </div>

                    <p className="text-xs text-muted-foreground border-t border-primary/10 pt-3">
                        {t('entity.readyNote')}
                    </p>
                </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between items-center pt-2">
                <Button
                    variant="outline"
                    onClick={onPrev}
                    disabled={saving}
                >
                    {t('common.back')}
                </Button>

                <Button
                    onClick={handleContinue}
                    disabled={!selected || saving}
                    className="min-w-[140px]"
                >
                    {saving ? t('common.saving') : t('common.continue')}
                    {!saving && <ChevronRight className="h-4 w-4 ml-1" />}
                </Button>
            </div>
        </div>
    );
};

export default EntityTypeSelection;

