// src/types/onboarding.ts
// Single source of truth for onboarding data structures.
// Imported by EnhancedMerchantOnboarding and DistributorMerchantOnboarding.

// ─── Entity Types ─────────────────────────────────────────────────────────────

export type EntityType =
    | 'proprietorship'
    | 'individual'
    | 'partnership'
    | 'llp'
    | 'pvt_ltd'
    | 'public_ltd'
    | 'trust'
    | 'society'
    | 'huf'
    | 'government_psu'
    | 'education';

export type PersonRole =
    | 'proprietor'
    | 'partner'
    | 'director'
    | 'karta'
    | 'trustee'
    | 'authorized_person'
    | 'signatory';

export type AddressProofType =
    | 'voter_id'
    | 'passport'
    | 'driving_license'
    | 'aadhaar';

export type DocCategory =
    | 'person_kyc'
    | 'entity_reg'
    | 'doing_business'
    | 'bank'
    | 'entity_specific';

// ─── Person KYC ───────────────────────────────────────────────────────────────

export interface PersonKYCData {
    // Set after INSERT into merchant_persons " null before save
    id?: string;

    role: PersonRole;
    fullName: string;
    panNumber: string;

    // Only collected for proprietor / individual (primary person)
    aadhaarNumber?: string;

    addressProofType?: AddressProofType;

    isAuthorizedSignatory: boolean;

    // 1-based display order
    sequenceOrder: number;

    // Doc paths " set after Supabase Storage upload
    panDocPath?: string;
    panDocName?: string;
    panDocSize?: number;

    addressProofDocPath?: string;
    addressProofDocName?: string;
    addressProofDocSize?: number;

    // Only populated when role = 'authorized_person' AND is different from persons above
    authorityLetterPath?: string;
    authorityLetterName?: string;
    authorityLetterDocSize?: number;

    // merchant_documents row IDs " set after insert, used for re-submission dedup
    panDocId?: string;
    addressProofDocId?: string;
    authorityLetterDocId?: string;
}

// ─── Entity-level documents ───────────────────────────────────────────────────

export interface EntityDocData {
    // Enum value from document_type
    docType: string;

    docCategory: DocCategory;

    // Human-readable label shown in UI
    label: string;

    isMandatory: boolean;
    requirementGroup?: string;

    // Set after upload
    filePath?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;

    // merchant_documents row ID " for dedup on re-submission
    docId?: string;
}

// ─── Address ──────────────────────────────────────────────────────────────────

export interface Address {
    addressLine1: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
}

export interface BankAccountData {
    id?: string;
    accountNumber: string;
    confirmAccountNumber?: string;
    ifscCode: string;
    bankName: string;
    branchName?: string;
    accountHolderName: string;
    isValid?: boolean;
    validationError?: string;
    isBeingValidated?: boolean;
}

// ─── Core OnboardingData ──────────────────────────────────────────────────────

export interface OnboardingData {
    // ── Step 1: Welcome ─────────────────────────────────────────────────────
    // nothing persisted

    // ── Step 2: Entity Type ─────────────────────────────────────────────────
    entityType: EntityType | '';

    // ── Step 3: Products ────────────────────────────────────────────────────
    selectedProducts?: string[];
    settlementType?: 'same_day' | 'next_day';

    // ── Step 4: Business Details ────────────────────────────────────────────
    fullName: string;               // authorized person / primary contact
    mobileNumber: string;
    email: string;
    businessName: string;
    gstNumber: string;
    hasGST: boolean;
    businessWebsite?: string;
    businessIndustry?: string;

    registeredAddress: Address;
    operatingAddress: Address;

    // True when operating address differs from registered address.
    // Gates the doing-business step.
    operatingAddressDifferent: boolean;

    // ── Step 5: Person KYC ──────────────────────────────────────────────────
    // Primary person PAN/Aadhaar " kept at top level for backward compat
    // with KYCVerification display and saveRegistrationData writes.
    // Also stored in persons[0] for the new structure.
    panNumber: string;
    aadhaarNumber: string;

    // Dynamic list " one entry per person (partner/director/karta etc.)
    persons: PersonKYCData[];

    // True when authorized signatory is a different person from those listed above.
    // When true, an extra authorized_person entry is appended to persons[].
    authorizedSignatoryIsDifferent: boolean;

    // ── Step 6: Entity Documents ────────────────────────────────────────────
    entityDocuments: EntityDocData[];

    // ── Step 7: Doing Business Address ──────────────────────────────────────
    doingBusinessDocPath?: string;
    doingBusinessDocName?: string;
    doingBusinessDocSize?: number;
    doingBusinessDocId?: string;

    // ── Step 8: Bank Details ────────────────────────────────────────────────
    bankAccounts: BankAccountData[];
    cancelledCheque?: { file?: File; path?: string; };

    // ── Step 9: KYC Verification (Video + Location) ─────────────────────────
    kycData: {
        isVideoCompleted: boolean;
        selfieUrl?: string;
        locationVerified?: boolean;
        latitude?: number;
        longitude?: number;
        fullAddress?: string | null;
        area?: string | null;
        city?: string | null;
        state?: string | null;
        pincode?: string | null;
        country?: string | null;
    };

    // ── Step 10: Review & Submit ─────────────────────────────────────────────
    agreementAccepted: boolean;

    // u{2500}u{2500} Commission (set by distributor) u{2500}u{2500}
    commission?: number;

    // ── Legacy doc map ───────────────────────────────────────────────────────
    // Kept for backward compat with ReviewSubmit, BankDetails, handleFinalSubmit.
    // New uploads write to persons[].panDocPath etc. AND here for existing code.
    documents: {
        panCard?: { file: File; path: string };
        aadhaarCard?: { file: File; path: string };
        cancelledCheque?: { file: File; path: string };
        businessProof?: { file: File; path: string };
        bankStatement?: { file: File; path: string };
        [key: string]: { file: File; path: string } | undefined;
    };

    // Internal " tracks current step index for local storage
    currentStep: number;
}

// ─── Default initial state ────────────────────────────────────────────────────

export const EMPTY_ADDRESS: Address = {
    addressLine1: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',
};

export const INITIAL_ONBOARDING_DATA: OnboardingData = {
    entityType: '',
    selectedProducts: [],
    settlementType: undefined,
    fullName: '',
    mobileNumber: '',
    email: '',
    businessName: '',
    gstNumber: '',
    hasGST: true,
    businessWebsite: '',
    businessIndustry: '',
    registeredAddress: { ...EMPTY_ADDRESS },
    operatingAddress: { ...EMPTY_ADDRESS },
    operatingAddressDifferent: false,
    panNumber: '',
    aadhaarNumber: '',
    persons: [],
    authorizedSignatoryIsDifferent: false,
    entityDocuments: [],
    doingBusinessDocPath: undefined,
    doingBusinessDocName: undefined,
    doingBusinessDocSize: undefined,
    doingBusinessDocId: undefined,
    bankAccounts: [],
    kycData: {
        isVideoCompleted: false,
        selfieUrl: undefined,
        locationVerified: false,
        latitude: undefined,
        longitude: undefined,
    },
    agreementAccepted: false,
    commission: undefined,
    documents: {},
    currentStep: 0,
};

// ─── Entity rules ─────────────────────────────────────────────────────────────

// Minimum number of persons required per entity type
export const MIN_PERSONS: Record<EntityType, number> = {
    proprietorship:  1,
    individual:      1,
    partnership:     2,
    llp:             2,
    pvt_ltd:         1,
    public_ltd:      1,
    trust:           1,
    society:         1,
    huf:             1,
    government_psu:  0,   // optional
    education:       0,   // optional
};

// Default role for the primary person per entity type
export const PRIMARY_PERSON_ROLE: Record<EntityType, PersonRole> = {
    proprietorship:  'proprietor',
    individual:      'authorized_person',
    partnership:     'partner',
    llp:             'partner',
    pvt_ltd:         'director',
    public_ltd:      'director',
    trust:           'trustee',
    society:         'trustee',
    huf:             'karta',
    government_psu:  'signatory',
    education:       'signatory',
};

// Label shown in UI for the "Add another person" button
export const ADD_PERSON_LABEL: Record<EntityType, string> = {
    proprietorship:  '',              // single person only
    individual:      '',              // single person only
    partnership:     'Add Partner',
    llp:             'Add Partner',
    pvt_ltd:         'Add Director',
    public_ltd:      'Add Director',
    trust:           'Add Trustee',
    society:         'Add Trustee',
    huf:             '',              // single karta only
    government_psu:  '',
    education:       '',
};

// Whether entity type requires Aadhaar for the primary person
export const REQUIRES_AADHAAR: Record<EntityType, boolean> = {
    proprietorship:  true,
    individual:      true,
    partnership:     false,
    llp:             false,
    pvt_ltd:         false,
    public_ltd:      false,
    trust:           false,
    society:         false,
    huf:             false,
    government_psu:  false,
    education:       false,
};

// Whether authority letter / board resolution is applicable
export const AUTHORITY_LETTER_APPLICABLE: Record<EntityType, boolean> = {
    proprietorship:  false,
    individual:      false,
    partnership:     true,
    llp:             true,
    pvt_ltd:         true,
    public_ltd:      true,
    trust:           true,
    society:         true,
    huf:             true,
    government_psu:  false,
    education:       false,
};

// ─── Entity document requirements ────────────────────────────────────────────
// Returns the list of EntityDocData stubs for a given entity type.
// isMandatory drives UI validation. filePath starts empty.

export function getEntityDocRequirements(entityType: EntityType): EntityDocData[] {
    const base = (
        docType: string,
        label: string,
        isMandatory: boolean,
        docCategory: DocCategory = 'entity_reg'
    ): EntityDocData => ({
        docType,
        label,
        isMandatory,
        docCategory,
    });

    switch (entityType) {
        case 'proprietorship':
            return [
                {
                    ...base('gst_certificate', 'GST Certificate', false),
                    requirementGroup: 'proprietorship_registration_proof',
                },
                {
                    ...base('shop_act_certificate', 'Shop Act / Municipal License', false),
                    requirementGroup: 'proprietorship_registration_proof',
                },
                base('bank_statement',        'Bank Statement (last 3 months)',            false, 'bank'),
            ];

        case 'individual':
            return [
                base('undertaking',           'Individual Undertaking Letter',            true,  'entity_specific'),
                base('bank_statement',        'Bank Statement (last 3 months)',            false, 'bank'),
            ];

        case 'partnership':
            return [
                base('partnership_deed',      'Partnership Deed',                         true),
                base('gst_certificate',       'GST Certificate',                          true),
                base('bank_statement',        'Bank Statement (last 3 months)',            false, 'bank'),
            ];

        case 'llp':
            return [
                base('llp_agreement',         'LLP Agreement',                            true),
                base('gst_certificate',       'GST Certificate',                          true),
                base('certificate_of_incorporation', 'Certificate of Incorporation',      true),
                base('bank_statement',        'Bank Statement (last 3 months)',            false, 'bank'),
            ];

        case 'pvt_ltd':
        case 'public_ltd':
            return [
                base('moa',                   'Memorandum of Association (MOA)',           true),
                base('aoa',                   'Articles of Association (AOA)',             true),
                base('certificate_of_incorporation', 'Certificate of Incorporation',      true),
                base('gst_certificate',       'GST Certificate',                          true),
                base('bank_statement',        'Bank Statement (last 3 months)',            false, 'bank'),
            ];

        case 'trust':
        case 'society':
            return [
                base('trust_deed',            'Trust Deed / Society Registration',        true),
                base('gst_certificate',       'GST Certificate (if applicable)',           false),
                base('bank_statement',        'Bank Statement (last 3 months)',            false, 'bank'),
            ];

        case 'huf':
            return [
                base('huf_deed',              'HUF Deed',                                 true),
                base('gst_certificate',       'GST Certificate (if applicable)',           false),
                base('bank_statement',        'Bank Statement (last 3 months)',            false, 'bank'),
            ];

        case 'education':
            return [
                base('gst_certificate',       'GST Certificate / PAN Card',               true),
                base('affiliation_letter',    'Affiliation Letter / Certificate',          true,  'entity_specific'),
                base('bank_statement',        'Bank Statement (last 3 months)',            false, 'bank'),
            ];

        case 'government_psu':
            return [
                base('gst_certificate',       'GST Certificate / PAN Card',               true),
                base('work_order',            'Work Order',                               false, 'entity_specific'),
                base('bank_statement',        'Bank Statement (last 3 months)',            false, 'bank'),
            ];

        default:
            return [];
    }
}

// ─── Step completion helpers ──────────────────────────────────────────────────

export function isEntityTypeComplete(data: OnboardingData): boolean {
    return Boolean(data.entityType);
}

export function isBusinessDetailsComplete(data: OnboardingData): boolean {
    return Boolean(
        data.businessName &&
        data.mobileNumber &&
        data.email &&
        data.registeredAddress.addressLine1 &&
        data.registeredAddress.city &&
        data.registeredAddress.state &&
        data.registeredAddress.pincode
    );
}

export function isPersonKYCComplete(data: OnboardingData): boolean {
    if (!data.entityType) return false;
    const min = MIN_PERSONS[data.entityType as EntityType] ?? 1;
    if (data.persons.length < min) return false;
    return data.persons.every(p =>
        p.fullName &&
        p.panNumber &&
        p.panDocPath &&
        p.addressProofDocPath
    );
}

export function isEntityDocumentsComplete(data: OnboardingData): boolean {
    if (!data.entityType) return false;
    const required = data.entityDocuments.filter(d => d.isMandatory);
    const requiredComplete = required.every(d => Boolean(d.filePath));

    const requirementGroups = data.entityDocuments.reduce<Record<string, EntityDocData[]>>((acc, doc) => {
        if (!doc.requirementGroup) return acc;
        if (!acc[doc.requirementGroup]) acc[doc.requirementGroup] = [];
        acc[doc.requirementGroup].push(doc);
        return acc;
    }, {});

    const groupComplete = Object.values(requirementGroups).every(group =>
        group.some(doc => Boolean(doc.filePath))
    );

    return requiredComplete && groupComplete;
}

export function isDoingBusinessComplete(data: OnboardingData): boolean {
    if (!data.operatingAddressDifferent) return true;
    return Boolean(data.doingBusinessDocPath);
}

export function isBankDetailsComplete(data: OnboardingData): boolean {
    if (!data.bankAccounts || data.bankAccounts.length === 0) return false;
    return data.bankAccounts.some(
        acct => acct.accountNumber?.trim() &&
                acct.ifscCode?.trim() &&
                acct.bankName?.trim() &&
                acct.accountHolderName?.trim()
    );
}

export function isKYCComplete(data: OnboardingData): boolean {
    return Boolean(
        data.kycData.isVideoCompleted &&
        data.kycData.locationVerified
    );
}

// ─── Distributor merchant state ───────────────────────────────────────────────

export interface DistributorMerchantState {
    merchantUserId: string;
    merchantProfileId: string;
    merchantEmail: string;
    merchantPassword: string;
    distributorId: string;
    commission?: number;
}
