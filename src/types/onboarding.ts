// src/types/onboarding.ts
// Single source of truth for onboarding data structures.
// Imported by EnhancedMerchantOnboarding and DistributorMerchantOnboarding.

// â”€â”€â”€ Entity Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Person KYC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Entity-level documents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Address â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface Address {
    addressLine1: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
}

// â”€â”€â”€ Core OnboardingData â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface OnboardingData {
    // â”€â”€ Step 1: Welcome â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // nothing persisted

    // â”€â”€ Step 2: Entity Type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    entityType: EntityType | '';

    // â”€â”€ Step 3: Products â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    selectedProducts?: string[];
    settlementType?: 'same_day' | 'next_day';

    // â”€â”€ Step 4: Business Details â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Step 5: Person KYC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Step 6: Entity Documents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    entityDocuments: EntityDocData[];

    // â”€â”€ Step 7: Doing Business Address â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    doingBusinessDocPath?: string;
    doingBusinessDocName?: string;
    doingBusinessDocSize?: number;
    doingBusinessDocId?: string;

    // â”€â”€ Step 8: Bank Details â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    bankDetails: {
        accountNumber: string;
        ifscCode: string;
        bankName: string;
        branchName?: string;
        accountHolderName: string;
        confirmAccountNumber?: string;
    };

    // â”€â”€ Step 9: KYC Verification (Video + Location) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    kycData: {
        isVideoCompleted: boolean;
        selfieUrl?: string;
        locationVerified?: boolean;
        latitude?: number;
        longitude?: number;
    };

    // â”€â”€ Step 10: Review & Submit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    agreementAccepted: boolean;

    // u{2500}u{2500} Commission (set by distributor) u{2500}u{2500}
    commission?: number;

    // â”€â”€ Legacy doc map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Default initial state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    bankDetails: {
        accountNumber: '',
        ifscCode: '',
        bankName: '',
        branchName: '',
        accountHolderName: '',
        confirmAccountNumber: '',
    },
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

// â”€â”€â”€ Entity rules â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Entity document requirements â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Step completion helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    return Boolean(
        data.bankDetails.accountNumber?.trim() &&
        data.bankDetails.ifscCode?.trim() &&
        data.bankDetails.bankName?.trim() &&
        data.bankDetails.accountHolderName?.trim()
    );
}

export function isKYCComplete(data: OnboardingData): boolean {
    return Boolean(
        data.kycData.isVideoCompleted &&
        data.kycData.locationVerified
    );
}

// â”€â”€â”€ Distributor merchant state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface DistributorMerchantState {
    merchantUserId: string;
    merchantProfileId: string;
    merchantEmail: string;
    merchantPassword: string;
    distributorId: string;
    commission?: number;
}
