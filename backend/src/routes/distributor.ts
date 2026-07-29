// backend/routes/distributor.ts
//
// Changes from previous version:
//
// 1. create-merchant:
//    - allowedEntityTypes expanded to match DB constraint (11 values)
//    - mapping table updated for all new entity types
//    - entityType defaults to null (not 'proprietorship') when not provided
//
// 2. submit-merchant-onboarding:
//    - SubmitOnboardingBody interface extended with new fields
//    - Profile update now includes entity_type + registration_details
//    - Step 3 (documents) now uses doc_category and person_id = null for legacy docs
//    - New Step 3b: save merchant_persons rows
//    - New Step 3c: update person_id on merchant_documents for each person's docs
//    - New Step 3d: doing_business doc record
//    - Status set to 'submitted' (not 'pending') at end
//    - verification_submitted = true set at end
//
// All other routes (save-bank-details, transactions, validate-vpa,
// prescreen/*, assign-product) are unchanged.

import { Router, Request, Response, NextFunction } from 'express';
import { getAdminClient, getSupabaseClient } from './supabase';
import { BadRequestError } from '../utils/errors';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { transbankService } from '../services/transbankService';
import { notificationService } from '../services/notifications';
import { getTransactionsByClientIds, getClientIdsByEmails, getAllMerchantClientIds, getAllMerchantsFromMariaDB, syncClientOnboardedBy } from '../services/mariadb';

const router = Router();
const COMPANY_CUTOFF_RATE = 1;

const calculateDistributorGrossRate = (commissionRate: number) =>
    Math.max((Number.isFinite(commissionRate) ? commissionRate : 0) - COMPANY_CUTOFF_RATE, 0);

// ─── Storage helpers ──────────────────────────────────────────────────────────

async function ensureBucketExists(supabaseClient: any, bucket: string): Promise<void> {
    try {
        await supabaseClient.storage.createBucket(bucket, { public: false }).catch(() => {});
    } catch (err) {
        logger.warn(`Failed to ensure bucket ${bucket}: ${err instanceof Error ? err.message : err}`);
    }
}

async function uploadBase64File(
    supabaseClient: any,
    bucket: string,
    folder: string,
    base64: string,
    fileName: string,
    defaultContentType = 'application/octet-stream'
): Promise<string | null> {
    await ensureBucketExists(supabaseClient, bucket);
    const buffer = Buffer.from(base64, 'base64');
    const ext = fileName?.split('.').pop() || '';
    const safeName = fileName ? fileName.replace(/[^a-zA-Z0-9._-]/g, '_') : `file.${ext || 'bin'}`;
    const filePath = `${folder}/${Date.now()}-${safeName}`;

    // Detect content type from extension
    let contentType = defaultContentType;
    if (ext) {
        const lowerExt = ext.toLowerCase();
        if (lowerExt === 'pdf') contentType = 'application/pdf';
        else if (['jpg', 'jpeg'].includes(lowerExt)) contentType = 'image/jpeg';
        else if (lowerExt === 'png') contentType = 'image/png';
        else if (lowerExt === 'gif') contentType = 'image/gif';
        else if (lowerExt === 'webp') contentType = 'image/webp';
    }

    const { error } = await supabaseClient.storage
        .from(bucket)
        .upload(filePath, buffer, { contentType, upsert: true });

    if (error) {
        logger.error(`Failed to upload file to ${bucket}`, error);
        return null;
    }
    return filePath;
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function verifyDistributor(authHeader: string | undefined, res: Response): Promise<{ userId: string; isAdmin: boolean } | null> {
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: { message: 'Distributor authentication required' } });
        return null;
    }
    const jwt = authHeader.replace('Bearer ', '');
    const supabaseClient = getSupabaseClient();
    const { data: { user }, error } = await supabaseClient.auth.getUser(jwt);
    if (error || !user) {
        res.status(401).json({ success: false, error: { message: 'Invalid distributor session' } });
        return null;
    }
    const adminClient = getAdminClient();
    const { data: roleData } = await adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
    const isAdmin = roleData?.role === 'admin';
    const isDistributor = roleData?.role === 'distributor';
    const isEmployee = roleData?.role === 'employee';
    if (!isAdmin && !isDistributor && !isEmployee) {
        res.status(403).json({ success: false, error: { message: 'Only distributors, employees, or admins can perform this action' } });
        return null;
    }
    return { userId: user.id, isAdmin };
}

// ─── Entity type normalisation ────────────────────────────────────────────────
// Must exactly match the DB check constraint on merchant_profiles.entity_type

const ALLOWED_ENTITY_TYPES = [
    'proprietorship',
    'individual',
    'partnership',
    'llp',
    'pvt_ltd',
    'public_ltd',
    'trust',
    'society',
    'huf',
    'government_psu',
    'education',
] as const;

type AllowedEntityType = typeof ALLOWED_ENTITY_TYPES[number];

const ENTITY_TYPE_MAPPING: Record<string, AllowedEntityType> = {
    // proprietorship variants
    sole_proprietor:      'proprietorship',
    sole_proprietorship:  'proprietorship',
    proprietor:           'proprietorship',
    sole:                 'proprietorship',

    // individual
    non_registered:       'individual',
    unregistered:         'individual',

    // partnership
    partnership_firm:     'partnership',

    // llp variants
    limited_liability_partnership: 'llp',
    llp_firm:             'llp',

    // private limited variants
    private_limited:      'pvt_ltd',
    pvt_limited:          'pvt_ltd',
    pvt_ltd_llp:          'pvt_ltd',   // legacy DB value mapped to new value
    private:              'pvt_ltd',

    // public limited
    public_limited:       'public_ltd',
    public:               'public_ltd',

    // trust/society
    foundation:           'trust',
    ngo:                  'trust',
    charitable_trust:     'trust',

    // huf
    hindu_undivided_family: 'huf',

    // government/psu
    government:           'government_psu',
    psu:                  'government_psu',
    govt:                 'government_psu',

    // education
    school:               'education',
    college:              'education',
    university:           'education',
    institute:            'education',
};

function normaliseEntityType(raw: string | undefined | null): AllowedEntityType | null {
    if (!raw) return null;
    const munged = raw.trim().toLowerCase().replace(/[\s\-]+/g, '_');
    // Direct match
    if (ALLOWED_ENTITY_TYPES.includes(munged as AllowedEntityType)) return munged as AllowedEntityType;
    // Mapping
    return ENTITY_TYPE_MAPPING[munged] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/distributor/create-merchant
// ─────────────────────────────────────────────────────────────────────────────

interface CreateMerchantBody {
    email: string;
    password: string;
    fullName: string;
    mobileNumber: string;
    distributorId: string;
    businessName?: string;
    entityType?: string;
    panNumber?: string;
    gstNumber?: string;
    commission?: number;
    // Settlement & Reserve Terms
    rolling_reserve_enabled?: boolean;
    rolling_reserve_percentage?: number | null;
    rolling_reserve_fixed_inr?: number | null;
    settlement_cycle_days?: number;
}

router.post(
    '/create-merchant',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            console.log('🔵 [POST /create-merchant] Request received');

            const {
                email, password, fullName, mobileNumber, distributorId,
                businessName, entityType, panNumber, gstNumber, commission,
                rolling_reserve_enabled, rolling_reserve_percentage, rolling_reserve_fixed_inr,
                settlement_cycle_days,
            } = req.body as CreateMerchantBody;

            if (!email || !password || !fullName || !mobileNumber || !distributorId) {
                throw new BadRequestError(
                    'email, password, fullName, mobileNumber, and distributorId are required',
                    'MISSING_FIELDS'
                );
            }
            if (password.length < 6) {
                throw new BadRequestError('Password must be at least 6 characters', 'WEAK_PASSWORD');
            }

            const commNum = commission != null ? Number(commission) : null;
            if (commNum && commNum <= 1 && !isNaN(commNum)) {
                throw new BadRequestError('Commission must be greater than 1%', 'COMMISSION_TOO_LOW');
            }

            // Validate settlement & reserve terms
            const reserveEnabled = rolling_reserve_enabled ?? false;
            const settlementDays = settlement_cycle_days ?? 1;

            if (!(Number.isInteger(settlementDays) && settlementDays >= 1 && settlementDays <= 7)) {
                throw new BadRequestError('settlement_cycle_days must be an integer between 1 and 7', 'INVALID_SETTLEMENT_CYCLE');
            }

            if (reserveEnabled) {
                const hasPercentage = rolling_reserve_percentage !== null && rolling_reserve_percentage !== undefined && rolling_reserve_percentage > 0;
                const hasFixed = rolling_reserve_fixed_inr !== null && rolling_reserve_fixed_inr !== undefined && rolling_reserve_fixed_inr > 0;
                if (!hasPercentage && !hasFixed) {
                    throw new BadRequestError('When rolling reserve is enabled, provide either rolling_reserve_percentage or rolling_reserve_fixed_inr', 'RESERVE_AMOUNT_REQUIRED');
                }
                if (hasPercentage && hasFixed) {
                    throw new BadRequestError('Provide only one of rolling_reserve_percentage or rolling_reserve_fixed_inr, not both', 'RESERVE_BOTH_NOT_ALLOWED');
                }
                if (hasPercentage && (rolling_reserve_percentage! < 0.01 || rolling_reserve_percentage! > 50)) {
                    throw new BadRequestError('rolling_reserve_percentage must be between 0.01 and 50', 'RESERVE_PERCENTAGE_RANGE');
                }
                if (hasFixed && rolling_reserve_fixed_inr! <= 0) {
                    throw new BadRequestError('rolling_reserve_fixed_inr must be a positive number', 'RESERVE_FIXED_INR_INVALID');
                }
            }

            // Normalise entity type — null is fine (set later in entity-type step)
            const normalizedEntityType = normaliseEntityType(entityType);
            if (entityType && !normalizedEntityType) {
                res.status(400).json({
                    success: false,
                    error: {
                        message: 'Invalid entityType',
                        details: { allowed: ALLOWED_ENTITY_TYPES, received: entityType },
                    },
                });
                return;
            }

            // Verify caller is a distributor
            const caller = await verifyDistributor(req.headers.authorization, res);
            if (!caller) return;

            if (caller.userId !== distributorId) {
                res.status(403).json({ success: false, error: { message: 'distributorId must match your own account' } });
                return;
            }

            const adminClient = getAdminClient();
            logger.info(`Distributor ${distributorId} creating merchant: ${email}`);

            // ── Create auth user ──────────────────────────────────────────────
            let merchantUserId: string;
            let existingUser = false;

            try {
                const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
                    email,
                    password,
                    email_confirm: true,
                    user_metadata: { full_name: fullName, mobile_number: mobileNumber, role: 'merchant' },
                });
                if (authError || !authData.user) throw new Error(authError?.message ?? 'Failed to create auth user');
                merchantUserId = authData.user.id;
            } catch (createError) {
                const msg = createError instanceof Error ? createError.message : String(createError);
                if (msg.includes('already been registered') || msg.includes('already registered')) {
                    // Look up existing user via merchant_profiles first
                    const { data: profileRow } = await getAdminClient()
                        .from('merchant_profiles')
                        .select('user_id')
                        .eq('email', email)
                        .maybeSingle();
                    if (profileRow?.user_id) {
                        merchantUserId = profileRow.user_id;
                        existingUser = true;
                    } else {
                        // No merchant_profiles row — look up from auth.users via listUsers
                        const { data: usersList } = await getAdminClient().auth.admin.listUsers();
                        const found = usersList?.users?.find((u: any) => u.email === email);
                        if (!found) {
                            throw new Error('User exists in auth but could not be located');
                        }
                        merchantUserId = found.id;
                        existingUser = true;
                    }
                } else {
                    throw createError;
                }
            }

            // ── Create user_roles (new users only) ────────────────────────────
            if (!existingUser) {
                const { error: roleError } = await adminClient
                    .from('user_roles')
                    .insert({ user_id: merchantUserId, role: 'merchant' });
                if (roleError) {
                    await adminClient.auth.admin.deleteUser(merchantUserId);
                    throw new Error(`Failed to create user role: ${roleError.message}`);
                }
            }

            // ── Create/find merchant_profiles ─────────────────────────────────
            let profileId: string;

            const { data: existingProfile } = await adminClient
                .from('merchant_profiles')
                .select('id')
                .eq('user_id', merchantUserId)
                .maybeSingle();

            if (existingProfile) {
                profileId = existingProfile.id;
                // Update settlement config on existing profile
                await adminClient
                    .from('merchant_profiles')
                    .update({
                        rolling_reserve_enabled: reserveEnabled,
                        rolling_reserve_percentage: reserveEnabled ? (rolling_reserve_percentage ?? null) : null,
                        rolling_reserve_fixed_inr: reserveEnabled ? (rolling_reserve_fixed_inr ?? null) : null,
                        settlement_cycle_days: settlementDays,
                    })
                    .eq('id', profileId);
            } else {
                const { data: newProfile, error: profileError } = await adminClient
                    .from('merchant_profiles')
                    .insert({
                        user_id: merchantUserId,
                        full_name: fullName,
                        mobile_number: mobileNumber,
                        email,
                        distributor_id: distributorId,
                        business_name: businessName ?? null,
                        // entity_type = null at creation — set properly in entity-type step
                        entity_type: normalizedEntityType ?? null,
                        pan_number: panNumber ?? null,
                        gst_number: gstNumber ?? null,
                        commission: commission ?? null,
                        onboarding_status: 'pending',
                        // Settlement & Reserve Terms
                        rolling_reserve_enabled: reserveEnabled,
                        rolling_reserve_percentage: reserveEnabled ? (rolling_reserve_percentage ?? null) : null,
                        rolling_reserve_fixed_inr: reserveEnabled ? (rolling_reserve_fixed_inr ?? null) : null,
                        settlement_cycle_days: settlementDays,
                        settlement_terms_locked: false,
                    })
                    .select('id')
                    .single();

                if (profileError || !newProfile) {
                    if (!existingUser) await adminClient.auth.admin.deleteUser(merchantUserId);
                    const msg = profileError?.message ?? 'Unknown error';
                    if (msg.includes('violates check constraint')) {
                        res.status(400).json({
                            success: false,
                            error: { message: 'Invalid data for merchant profile', details: msg },
                        });
                        return;
                    }
                    throw new Error(`Failed to create merchant profile: ${msg}`);
                }
                profileId = newProfile.id;
            }

            logger.info(`Merchant ${existingUser ? 'found' : 'created'}: user_id=${merchantUserId}, profile_id=${profileId}`);

            // Send credentials email to merchant (always — distributor chose the password)
            try {
                let creatorName: string | undefined;
                const { data: distProfile } = await adminClient
                    .from('distributor_profiles')
                    .select('company_name')
                    .eq('user_id', distributorId)
                    .maybeSingle();
                if (distProfile?.company_name) {
                    creatorName = distProfile.company_name;
                } else {
                    const { data: empProfile } = await adminClient
                        .from('employee_profiles')
                        .select('full_name')
                        .eq('user_id', distributorId)
                        .maybeSingle();
                    creatorName = empProfile?.full_name || undefined;
                }

                await notificationService.sendMerchantCredentialsEmail({
                    merchantEmail: email,
                    merchantName: fullName,
                    password,
                    commission: commission ?? undefined,
                    distributorName: creatorName,
                });
            } catch (emailErr) {
                // Non-fatal — log and continue
                console.error('⚠️ Failed to send merchant credentials email:', emailErr instanceof Error ? emailErr.message : emailErr);
            }

            res.status(201).json({
                success: true,
                data: {
                    merchantUserId: String(merchantUserId),
                    merchantProfileId: String(profileId),
                    email,
                    existingUser,
                    message: existingUser ? 'Existing merchant account found' : 'Merchant account created successfully',
                },
            });

        } catch (error) {
            console.error('❌ [/create-merchant]:', error instanceof Error ? error.message : error);
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/distributor/save-bank-details (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

interface SaveBankDetailsBody {
    merchantProfileId: string;
    accountNumber: string;
    ifscCode: string;
    bankName: string;
    accountHolderName: string;
}

router.post(
    '/save-bank-details',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { merchantProfileId, accountNumber, ifscCode, bankName, accountHolderName } = req.body as SaveBankDetailsBody;
            if (!merchantProfileId || !accountNumber || !ifscCode || !bankName || !accountHolderName) {
                res.status(400).json({ success: false, error: { message: 'All bank detail fields are required' } });
                return;
            }
            const caller = await verifyDistributor(req.headers.authorization, res);
            if (!caller) return;

            const admin = getAdminClient();
            const { data: merchantProfile } = await admin
                .from('merchant_profiles')
                .select('id, distributor_id')
                .eq('id', merchantProfileId)
                .maybeSingle();

            if (!merchantProfile) {
                res.status(404).json({ success: false, error: { message: 'Merchant profile not found' } });
                return;
            }
            if (merchantProfile.distributor_id !== caller.userId) {
                res.status(403).json({ success: false, error: { message: 'You do not have permission to modify this merchant' } });
                return;
            }

            const { data: existing } = await admin
                .from('merchant_bank_details')
                .select('id')
                .eq('merchant_id', merchantProfileId)
                .maybeSingle();

            const bankPayload = {
                account_number: accountNumber,
                ifsc_code: ifscCode,
                bank_name: bankName,
                account_holder_name: accountHolderName,
                updated_at: new Date().toISOString(),
            };

            const { error: bankError } = existing
                ? await admin.from('merchant_bank_details').update(bankPayload).eq('merchant_id', merchantProfileId)
                : await admin.from('merchant_bank_details').insert({ merchant_id: merchantProfileId, ...bankPayload });

            if (bankError) throw bankError;

            res.status(200).json({ success: true, data: { merchantProfileId, message: 'Bank details saved successfully' } });
        } catch (error) {
            console.error('❌ [/save-bank-details]:', error instanceof Error ? error.message : error);
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/distributor/submit-merchant-onboarding  ← UPDATED
// ─────────────────────────────────────────────────────────────────────────────

interface PersonKYCPayload {
    id?: string;
    role: string;
    fullName: string;
    panNumber: string;
    aadhaarNumber?: string;
    addressProofType?: string;
    isAuthorizedSignatory: boolean;
    sequenceOrder: number;
    panDocPath?: string;
    panDocName?: string;
    panDocSize?: number;
    panDocId?: string;
    addressProofDocPath?: string;
    addressProofDocName?: string;
    addressProofDocSize?: number;
    addressProofDocId?: string;
    authorityLetterPath?: string;
    authorityLetterName?: string;
    authorityLetterDocId?: string;
}

interface EntityDocPayload {
    docType: string;
    docCategory: string;
    label: string;
    isMandatory: boolean;
    filePath?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    docId?: string;
    isUploaded?: boolean;
}

interface AddressPayload {
    addressLine1: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
}

interface OnboardingDocuments {
    panCard?:        { file: { name: string; size: number; type: string }; path: string };
    aadhaarCard?:    { file: { name: string; size: number; type: string }; path: string };
    cancelledCheque?:{ file: { name: string; size: number; type: string }; path: string };
    businessProof?:  { file: { name: string; size: number; type: string }; path: string };
    bankStatement?:  { file: { name: string; size: number; type: string }; path: string };
    [key: string]: { file: { name: string; size: number; type: string }; path: string } | undefined;
}

interface SubmitOnboardingBody {
    merchantProfileId: string;
    fullName: string;
    mobileNumber: string;
    email: string;
    businessName: string;
    panNumber: string;
    aadhaarNumber: string;
    gstNumber?: string;

    // New fields
    entityType?: string;
    registeredAddress?: AddressPayload;
    operatingAddress?: AddressPayload;
    operatingAddressDifferent?: boolean;
    doingBusinessDocPath?: string;
    doingBusinessDocName?: string;
    persons?: PersonKYCPayload[];
    entityDocuments?: EntityDocPayload[];

    bankDetails: {
        accountNumber: string;
        ifscCode: string;
        bankName: string;
        accountHolderName: string;
    };
    kycData: {
        isVideoCompleted: boolean;
        selfieUrl?: string;
        locationVerified?: boolean;
        latitude?: number;
        longitude?: number;
        fullAddress?: string;
        area?: string;
        city?: string;
        state?: string;
        pincode?: string;
        country?: string;
    };
    documents: OnboardingDocuments;
    selectedProducts?: string[];
    settlementType?: 'same_day' | 'next_day';
}

router.post(
    '/submit-merchant-onboarding',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            console.log('🔵 [POST /submit-merchant-onboarding] Request received');

            const body = req.body as SubmitOnboardingBody;
            const {
                merchantProfileId,
                bankDetails,
                kycData,
                documents,
                selectedProducts,
                settlementType,
                persons = [],
                entityDocuments = [],
                entityType,
                registeredAddress,
                operatingAddress,
                operatingAddressDifferent,
                doingBusinessDocPath,
                doingBusinessDocName,
            } = body;

            if (!merchantProfileId) {
                throw new BadRequestError('merchantProfileId is required', 'MISSING_ID');
            }

            const admin = getAdminClient();
            const normalizedEntityType = normaliseEntityType(entityType);

            // ── Step 1: Update merchant_profiles ──────────────────────────────
            console.log('📝 Step 1: Updating merchant profile...');

            const registrationDetails = {
                registeredAddress: registeredAddress ?? null,
                operatingAddress: operatingAddress ?? null,
                operatingAddressDifferent: operatingAddressDifferent ?? false,
                businessWebsite: null,
                businessIndustry: null,
            };

            const { error: profileError } = await admin
                .from('merchant_profiles')
                .update({
                    full_name:        body.fullName,
                    mobile_number:    body.mobileNumber,
                    email:            body.email,
                    business_name:    body.businessName,
                    pan_number:       body.panNumber || null,
                    aadhaar_number:   body.aadhaarNumber || null,
                    gst_number:       body.gstNumber || null,
                    entity_type:      normalizedEntityType ?? null,
                    registration_details: registrationDetails,
                    onboarding_status: 'pending',
                    updated_at:       new Date().toISOString(),
                })
                .eq('id', merchantProfileId);

            if (profileError) throw new Error(`Profile update failed: ${profileError.message}`);
            console.log('✅ Profile updated');

            // ── Step 2: Save bank details ─────────────────────────────────────
            console.log('🏦 Step 2: Saving bank details...');
            const { error: bankError } = await admin
                .from('merchant_bank_details')
                .upsert({
                    merchant_id:         merchantProfileId,
                    account_number:      bankDetails.accountNumber,
                    ifsc_code:           bankDetails.ifscCode,
                    bank_name:           bankDetails.bankName,
                    account_holder_name: bankDetails.accountHolderName,
                    updated_at:          new Date().toISOString(),
                }, { onConflict: 'merchant_id' });

            if (bankError) throw new Error(`Bank details failed: ${bankError.message}`);
            console.log('✅ Bank details saved');

            // ── Step 3: Save legacy flat documents (cancelled cheque etc.) ────
            console.log('📄 Step 3: Saving legacy documents...');

            const legacyDocTypeMap: Record<string, string> = {
                panCard:        'pan_card',
                aadhaarCard:    'aadhaar_card',
                cancelledCheque:'cancelled_cheque',
                businessProof:  'business_proof',
                bankStatement:  'bank_statement',
            };

            // Delete all existing docs for this merchant — we re-insert everything cleanly
            await admin.from('merchant_documents').delete().eq('merchant_id', merchantProfileId);

            const legacyInserts = Object.entries(documents)
                .filter(([key, val]) => {
                    return (
                        !!legacyDocTypeMap[key] &&
                        !!val?.path &&
                        val?.file?.name?.trim()
                    );
                })
                .map(([key, val]) => ({
                    merchant_id:   merchantProfileId,
                    document_type: legacyDocTypeMap[key],
                    file_name:     val!.file.name,
                    file_path:     val!.path,
                    file_size:     val!.file.size,
                    mime_type:     val!.file.type,
                    status:        'uploaded' as const,
                    doc_category:  key === 'cancelledCheque' || key === 'bankStatement' ? 'bank' : 'entity_reg',
                    person_id:     null,
                    uploaded_at:   new Date().toISOString(),
                }));

            if (legacyInserts.length > 0) {
                const { error: legacyDocsError } = await admin
                    .from('merchant_documents')
                    .insert(legacyInserts);
                if (legacyDocsError) throw new Error(`Legacy documents failed: ${legacyDocsError.message}`);
            }
            console.log(`✅ Legacy documents saved (${legacyInserts.length})`);

            // ── Step 3a: Save entity-level documents ──────────────────────────
            console.log('📁 Step 3a: Saving entity documents...');

            const entityDocInserts = entityDocuments
                .filter(d => d.filePath && d.fileName)
                .map(d => ({
                    merchant_id:   merchantProfileId,
                    document_type: d.docType,
                    file_name:     d.fileName!,
                    file_path:     d.filePath!,
                    file_size:     d.fileSize ?? null,
                    mime_type:     d.mimeType ?? null,
                    status:        'uploaded' as const,
                    doc_category:  d.docCategory,
                    person_id:     null,
                    uploaded_at:   new Date().toISOString(),
                }));

            if (entityDocInserts.length > 0) {
                const { error: entityDocsError } = await admin
                    .from('merchant_documents')
                    .insert(entityDocInserts);
                if (entityDocsError) throw new Error(`Entity documents failed: ${entityDocsError.message}`);
            }
            console.log(`✅ Entity documents saved (${entityDocInserts.length})`);

            // ── Step 3b: Save doing_business address doc ───────────────────────
            if (doingBusinessDocPath && doingBusinessDocName) {
                console.log('🏠 Step 3b: Saving doing-business doc...');
                const { error: doingBizErr } = await admin
                    .from('merchant_documents')
                    .insert({
                        merchant_id:   merchantProfileId,
                        document_type: 'utility_bill',   // default; actual type is on the file
                        file_name:     doingBusinessDocName,
                        file_path:     doingBusinessDocPath,
                        status:        'uploaded' as const,
                        doc_category:  'doing_business',
                        person_id:     null,
                        uploaded_at:   new Date().toISOString(),
                    });
                if (doingBizErr) {
                    // Non-fatal — log and continue
                    console.error('⚠️ Doing-business doc insert failed:', doingBizErr.message);
                } else {
                    console.log('✅ Doing-business doc saved');
                }
            }

            // ── Step 3c: Save merchant_persons ────────────────────────────────
            console.log(`👥 Step 3c: Saving ${persons.length} person(s)...`);

            // Delete old persons (re-submission safety)
            await admin.from('merchant_persons').delete().eq('merchant_id', merchantProfileId);

            const personIdMap: Record<number, string> = {}; // sequenceOrder → new DB id

            if (persons.length > 0) {
                const personInserts = persons.map(p => ({
                    merchant_id:             merchantProfileId,
                    role:                    p.role,
                    full_name:               p.fullName,
                    pan_number:              p.panNumber || null,
                    address_proof_type:      p.addressProofType || null,
                    is_authorized_signatory: p.isAuthorizedSignatory,
                    sequence_order:          p.sequenceOrder,
                }));

                const { data: insertedPersons, error: personsError } = await admin
                    .from('merchant_persons')
                    .insert(personInserts)
                    .select('id, sequence_order');

                if (personsError) throw new Error(`Persons save failed: ${personsError.message}`);

                if (insertedPersons) {
                    for (const row of insertedPersons) {
                        personIdMap[row.sequence_order] = row.id;
                    }
                }
                console.log(`✅ ${persons.length} person(s) saved`);

                // ── Step 3d: Insert person KYC docs and link person_id ─────────
                console.log('📎 Step 3d: Saving person KYC documents...');

                const personDocInserts: object[] = [];

                for (const p of persons) {
                    const personId = personIdMap[p.sequenceOrder];
                    if (!personId) continue;

                    // PAN card
                    if (p.panDocPath && p.panDocName) {
                        personDocInserts.push({
                            merchant_id:   merchantProfileId,
                            document_type: 'pan_card',
                            file_name:     p.panDocName,
                            file_path:     p.panDocPath,
                            file_size:     p.panDocSize ?? null,
                            mime_type:     null,
                            status:        'uploaded',
                            doc_category:  'person_kyc',
                            person_id:     personId,
                            uploaded_at:   new Date().toISOString(),
                        });
                    }

                    // Address proof
                    if (p.addressProofDocPath && p.addressProofDocName) {
                        personDocInserts.push({
                            merchant_id:   merchantProfileId,
                            document_type: 'address_proof',
                            file_name:     p.addressProofDocName,
                            file_path:     p.addressProofDocPath,
                            file_size:     p.addressProofDocSize ?? null,
                            mime_type:     null,
                            status:        'uploaded',
                            doc_category:  'person_kyc',
                            person_id:     personId,
                            uploaded_at:   new Date().toISOString(),
                        });
                    }

                    // Authority letter (if present)
                    if (p.authorityLetterPath && p.authorityLetterName) {
                        personDocInserts.push({
                            merchant_id:   merchantProfileId,
                            document_type: 'authority_letter',
                            file_name:     p.authorityLetterName,
                            file_path:     p.authorityLetterPath,
                            file_size:     null,
                            mime_type:     null,
                            status:        'uploaded',
                            doc_category:  'person_kyc',
                            person_id:     personId,
                            uploaded_at:   new Date().toISOString(),
                        });
                    }

                    // If person has already-inserted doc IDs from frontend, update person_id on them
                    const frontendDocIds = [p.panDocId, p.addressProofDocId, p.authorityLetterDocId]
                        .filter(Boolean) as string[];
                    if (frontendDocIds.length > 0) {
                        await admin
                            .from('merchant_documents')
                            .update({ person_id: personId })
                            .in('id', frontendDocIds);
                    }
                }

                if (personDocInserts.length > 0) {
                    const { error: personDocsError } = await admin
                        .from('merchant_documents')
                        .insert(personDocInserts);
                    if (personDocsError) {
                        // Non-fatal — docs may already be linked via frontend uploads
                        console.error('⚠️ Person KYC doc insert partial failure:', personDocsError.message);
                    } else {
                        console.log(`✅ ${personDocInserts.length} person KYC doc(s) saved`);
                    }
                }
            }

            // ── Step 4: Save KYC data ──────────────────────────────────────────
            console.log('🎥 Step 4: Saving KYC data...');
            const { error: kycError } = await admin
                .from('merchant_kyc')
                .upsert({
                    merchant_id:        merchantProfileId,
                    video_kyc_completed: kycData.isVideoCompleted,
                    selfie_file_path:   kycData.selfieUrl ?? null,
                    location_captured:  kycData.locationVerified ?? false,
                    latitude:           kycData.latitude ?? null,
                    longitude:          kycData.longitude ?? null,
                    full_address:       kycData.fullAddress ?? null,
                    area:               kycData.area ?? null,
                    city:               kycData.city ?? null,
                    state:              kycData.state ?? null,
                    pincode:            kycData.pincode ?? null,
                    country:            kycData.country ?? null,
                    kyc_status:         'pending',
                    updated_at:         new Date().toISOString(),
                }, { onConflict: 'merchant_id' });

            if (kycError) throw new Error(`KYC failed: ${kycError.message}`);
            console.log('✅ KYC saved');

            // ── Step 5: Save selected products ────────────────────────────────
            if ((selectedProducts?.length ?? 0) > 0) {
                console.log('📦 Step 5: Saving products...');
                await admin.from('merchant_products').delete().eq('merchant_id', merchantProfileId);
                const { error: productsError } = await admin
                    .from('merchant_products')
                    .insert(
                        (selectedProducts ?? []).map(p => ({
                            merchant_id:    merchantProfileId,
                            product_type:   p,
                            settlement_type: settlementType ?? 'next_day',
                            status:         'pending',
                        }))
                    );
                if (productsError) throw new Error(`Products failed: ${productsError.message}`);
                console.log('✅ Products saved');
            }

            // ── Step 6: Mark as submitted ──────────────────────────────────────
            console.log('🎯 Step 6: Marking as submitted...');
            const { error: statusError } = await admin
                .from('merchant_profiles')
                .update({
                    onboarding_status:      'submitted',
                    submitted_at:           new Date().toISOString(),
                    verification_submitted: true,
                })
                .eq('id', merchantProfileId);

            if (statusError) throw new Error(`Status update failed: ${statusError.message}`);
            console.log('✅ Status set to submitted');

            logger.info(`Onboarding submission complete for merchant ${merchantProfileId}`);

            res.status(200).json({
                success: true,
                message: 'Merchant onboarding submitted successfully',
                merchantProfileId,
            });

        } catch (error) {
            console.error('❌ [/submit-merchant-onboarding]:', error instanceof Error ? error.message : error);
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// All remaining routes — unchanged from previous version
// ─────────────────────────────────────────────────────────────────────────────

router.get(
    '/transactions',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const caller = await verifyDistributor(req.headers.authorization, res);
            if (!caller) return;

            const isAdminMode = caller.isAdmin && req.query.all === 'true';
            const admin = getAdminClient();

            let clientIds: string[] = [];
            let merchantLookup: Record<string, { full_name: string; email: string; commission: number }> = {};

            if (isAdminMode) {
                clientIds = await getAllMerchantClientIds();
                const allMerchants = await getAllMerchantsFromMariaDB();
                const nameMap: Record<string, { full_name: string; email: string }> = {};
                allMerchants.forEach((m: any) => {
                    if (m.client_id) {
                        nameMap[m.client_id] = { full_name: m.client_name || '—', email: m.client_email || '—' };
                    }
                });
                const { data: supaMerchants } = await admin
                    .from('merchant_profiles')
                    .select('email, commission');
                const commissionMap: Record<string, number> = {};
                (supaMerchants || []).forEach((m: any) => {
                    if (m.email) commissionMap[m.email.toLowerCase()] = parseFloat(m.commission) || 0;
                });
                clientIds.forEach((cid) => {
                    merchantLookup[cid] = {
                        full_name: nameMap[cid]?.full_name || '—',
                        email: nameMap[cid]?.email || '—',
                        commission: nameMap[cid]?.email ? (commissionMap[nameMap[cid].email.toLowerCase()] || 0) : 0,
                    };
                });
            } else {
                const { data: merchantsData, error: merchantsError } = await admin
                    .from('merchant_profiles')
                    .select('id, user_id, full_name, email, commission')
                    .eq('distributor_id', caller.userId);
                if (merchantsError) throw merchantsError;

                const emails = (merchantsData || []).map((m: any) => m.email).filter(Boolean);
                const emailToClientId = await getClientIdsByEmails(emails);

                (merchantsData || []).forEach((m: any) => {
                    const mariadbClientId = m.email ? emailToClientId[m.email.toLowerCase()] : null;
                    if (mariadbClientId) {
                        clientIds.push(mariadbClientId);
                        merchantLookup[mariadbClientId] = {
                            full_name: m.full_name || '—',
                            email: m.email || '—',
                            commission: parseFloat(m.commission) || 0,
                        };
                    }
                });

                // Lazy sync: auto-fill client_onboarded_by in MariaDB for merchants missing it
                const emailToDistributorId: Record<string, string> = {};
                (merchantsData || []).forEach((m: any) => {
                    if (m.email && caller.userId) {
                        emailToDistributorId[m.email.toLowerCase()] = caller.userId;
                    }
                });
                if (Object.keys(emailToDistributorId).length > 0) {
                    syncClientOnboardedBy(emailToDistributorId).catch((err: any) => {
                        console.error('⚠️ Lazy sync client_onboarded_by failed:', err.message);
                    });
                }
            }

            if (clientIds.length === 0) {
                const { data: distMerchants } = await admin.from('merchant_profiles').select('id, email, full_name, business_name').eq('distributor_id', caller.userId);
                console.error('🔍 Merchants under this distributor:', JSON.stringify(distMerchants));
                const mariadbEmails = (distMerchants || []).map((m: any) => m.email).filter(Boolean);
                if (mariadbEmails.length > 0) {
                    const clientIdsFound = await getClientIdsByEmails(mariadbEmails);
                    console.error('🔍 Client IDs found in MariaDB:', JSON.stringify(clientIdsFound));
                } else {
                    console.error('🔍 No merchants found with emails under this distributor');
                }
                res.json({ success: true, data: [], summary: { totalAmount: 0, totalCount: 0, successCount: 0, pendingCount: 0, failedCount: 0, cancelledCount: 0 } });
                return;
            }

            const { status, search, date_from, date_to, merchant_id, type } = req.query as {
                status?: string;
                search?: string;
                date_from?: string;
                date_to?: string;
                merchant_id?: string;
                type?: string;
            };

            let filteredClientIds = clientIds;
            if (merchant_id && merchant_id !== 'all') {
                filteredClientIds = clientIds.filter((cid: string) => cid === merchant_id);
            }

            let sqlSearch = search?.trim() || undefined;
            if (search && search.trim()) {
                const term = search.trim().toLowerCase();
                const matchingClientIds = filteredClientIds.filter((cid: string) => {
                    const m = merchantLookup[cid];
                    return (m?.full_name && m.full_name.toLowerCase().includes(term)) ||
                           (m?.email && m.email.toLowerCase().includes(term));
                });
                if (matchingClientIds.length > 0) {
                    filteredClientIds = matchingClientIds;
                    sqlSearch = undefined;
                }
            }

            const txData = await getTransactionsByClientIds(filteredClientIds, {
                status,
                search: sqlSearch,
                date_from,
                date_to,
            });

            const enriched = (txData || []).map((tx: any) => ({
                id: tx.id,
                txn_id: tx.order_reference || tx.id,
                order_reference: tx.order_reference,
                merchant_id: tx.client_id,
                amount: parseFloat(tx.amount_final || tx.amount_requested || '0') || 0,
                amount_requested: parseFloat(tx.amount_requested || '0') || 0,
                currency: tx.currency || 'INR',
                status: (tx.status || '').toLowerCase(),
                payment_method: tx.payment_source || '—',
                payment_provider: tx.processor || '—',
                created_at: tx.initiated_at,
                completed_at: tx.completed_at,
                merchant_name: merchantLookup[tx.client_id]?.full_name || '—',
                merchant_email: merchantLookup[tx.client_id]?.email || '—',
                deduction_percentage: parseFloat(tx.deduction_percentage) || 0,
                net_amount_debit: parseFloat(tx.net_amount_debit) || 0,
                commission_rate: merchantLookup[tx.client_id]?.commission || 0,
                bank_ref_num: tx.bank_ref_num || null,
                mode: tx.mode || null,
                card_type: tx.card_type || null,
                city: (() => {
                    const ebCity = (tx.eb_city || '').trim();
                    if (ebCity && ebCity.toLowerCase() !== 'null' && ebCity.toLowerCase() !== 'city') return ebCity;
                    try {
                        const addr = tx.client_business_address ? JSON.parse(tx.client_business_address) : null;
                        if (addr?.city) return addr.city;
                    } catch {}
                    return null;
                })(),
                state: (() => {
                    const ebState = (tx.eb_state || '').trim();
                    if (ebState && ebState.toLowerCase() !== 'null' && ebState.toLowerCase() !== 'state') return ebState;
                    try {
                        const addr = tx.client_business_address ? JSON.parse(tx.client_business_address) : null;
                        if (addr?.state) return addr.state;
                    } catch {}
                    return null;
                })(),
                txnid: tx.txnid || null,
                product_info: tx.product_info || null,
                customer_name: tx.customer_first_name || null,
                customer_email: tx.customer_email || null,
                card_number: tx.card_number || null,
                upi_va: tx.upi_va || null,
                // Recovery fields — populated below from chargebacks lookup
                recovery_amount: 0,
                recovery_percentage: 0,
                chargeback_status: null as string | null,
            }));

            // Enrich with chargeback recovery data via master_chargebacks.master_transaction_id
            try {
                const { getMariaDBPool } = await import('../services/mariadb');
                const pool = getMariaDBPool();
                const txIds = enriched.map((tx: any) => tx.id).filter(Boolean) as string[];
                if (txIds.length > 0) {
                    const placeholders = txIds.map(() => '?').join(',');
                    const [rows] = await pool.execute(
                        `SELECT master_transaction_id, chargeback_amount, status
                         FROM master_chargebacks
                         WHERE master_transaction_id IN (${placeholders})`,
                        txIds
                    );
                    const cbRows = rows as any[];
                    const cbLookup: Record<string, { amount: number; status: string }> = {};
                    for (const cb of cbRows) {
                        if (!cbLookup[cb.master_transaction_id]) {
                            cbLookup[cb.master_transaction_id] = {
                                amount: parseFloat(cb.chargeback_amount),
                                status: cb.status,
                            };
                        } else {
                            cbLookup[cb.master_transaction_id].amount += parseFloat(cb.chargeback_amount);
                        }
                    }
                    for (const tx of enriched) {
                        const cb = cbLookup[tx.id];
                        if (cb) {
                            tx.recovery_amount = cb.amount;
                            tx.recovery_percentage = tx.amount > 0 ? Math.round((cb.amount / tx.amount) * 10000) / 100 : 0;
                            tx.chargeback_status = cb.status;
                        }
                    }
                }
            } catch (cbErr) {
                console.error('Failed to enrich chargeback data:', cbErr instanceof Error ? cbErr.message : String(cbErr));
            }

            const filtered = (type && type !== 'all')
                ? enriched.filter((tx: any) => {
                    const t = type.toLowerCase();
                    return (tx.mode || '').toLowerCase().includes(t) ||
                           (tx.card_type || '').toLowerCase().includes(t) ||
                           (tx.payment_method || '').toLowerCase().includes(t);
                })
                : enriched;

            const successStatuses = ['success', 'completed'];
            const pendingStatuses = ['pending', 'initiated', 'requires_action'];
            const failedStatuses = ['failed'];
            const cancelledStatuses = ['cancelled', 'expired', 'refunded'];

            const summary = {
                totalAmount: filtered.reduce((sum: number, tx: any) => sum + (parseFloat(tx.amount) || 0), 0),
                totalCount: filtered.length,
                successCount: filtered.filter((tx: any) => successStatuses.includes(tx.status)).length,
                pendingCount: filtered.filter((tx: any) => pendingStatuses.includes(tx.status)).length,
                failedCount: filtered.filter((tx: any) => failedStatuses.includes(tx.status)).length,
                cancelledCount: filtered.filter((tx: any) => cancelledStatuses.includes(tx.status)).length,
            };

            res.json({ success: true, data: filtered, summary });
        } catch (error) {
            console.error('❌ [/transactions]:', error instanceof Error ? error.message : error);
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/distributor/earnings
// Returns per-merchant commission earnings based on successful transactions
// ─────────────────────────────────────────────────────────────────────────────

router.get(
    '/earnings',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const caller = await verifyDistributor(req.headers.authorization, res);
            if (!caller) return;

            const isAdminMode = caller.isAdmin && req.query.all === 'true';
            const admin = getAdminClient();

            let clientIds: string[] = [];
            let merchantLookup: Record<string, { full_name: string; email: string; commission: number }> = {};

            if (isAdminMode) {
                clientIds = await getAllMerchantClientIds();
                const allMerchants = await getAllMerchantsFromMariaDB();
                const nameMap: Record<string, { full_name: string; email: string }> = {};
                allMerchants.forEach((m: any) => {
                    if (m.client_id) {
                        nameMap[m.client_id] = { full_name: m.client_name || '—', email: m.client_email || '—' };
                    }
                });
                const { data: supaMerchants } = await admin
                    .from('merchant_profiles')
                    .select('email, commission');
                const commissionMap: Record<string, number> = {};
                (supaMerchants || []).forEach((m: any) => {
                    if (m.email) commissionMap[m.email.toLowerCase()] = parseFloat(m.commission) || 0;
                });
                clientIds.forEach((cid) => {
                    merchantLookup[cid] = {
                        full_name: nameMap[cid]?.full_name || '—',
                        email: nameMap[cid]?.email || '—',
                        commission: nameMap[cid]?.email ? (commissionMap[nameMap[cid].email.toLowerCase()] || 0) : 0,
                    };
                });
            } else {
                const { data: merchantsData, error: merchantsError } = await admin
                    .from('merchant_profiles')
                    .select('id, user_id, full_name, email, commission')
                    .eq('distributor_id', caller.userId);
                if (merchantsError) throw merchantsError;

                const emails = (merchantsData || []).map((m: any) => m.email).filter(Boolean);
                const emailToClientId = await getClientIdsByEmails(emails);

                (merchantsData || []).forEach((m: any) => {
                    const mariadbClientId = m.email ? emailToClientId[m.email.toLowerCase()] : null;
                    if (mariadbClientId) {
                        clientIds.push(mariadbClientId);
                        merchantLookup[mariadbClientId] = {
                            full_name: m.full_name || '—',
                            email: m.email || '—',
                            commission: parseFloat(m.commission) || 0,
                        };
                    }
                });

                // Lazy sync: auto-fill client_onboarded_by in MariaDB
                const emailToDistId: Record<string, string> = {};
                (merchantsData || []).forEach((m: any) => {
                    if (m.email && caller.userId) {
                        emailToDistId[m.email.toLowerCase()] = caller.userId;
                    }
                });
                if (Object.keys(emailToDistId).length > 0) {
                    syncClientOnboardedBy(emailToDistId).catch((err: any) => {
                        console.error('⚠️ Lazy sync client_onboarded_by failed:', err.message);
                    });
                }
            }

            if (clientIds.length === 0) {
                res.json({ success: true, data: [], summary: { totalEarnings: 0, totalSuccessfulAmount: 0, merchantCount: 0 } });
                return;
            }

            // Query successful transactions from MariaDB
            const txData = await getTransactionsByClientIds(clientIds, { status: 'success' });

            const merchantEarnings: Record<string, { totalAmount: number; txCount: number; commissionRate: number; commissionEarned: number }> = {};

            for (const tx of txData || []) {
                const merchantId = tx.client_id;
                const amount = parseFloat(tx.amount_final || tx.amount_requested || '0') || 0;
                const merchant = merchantLookup[merchantId];
                if (!merchant) continue;

                if (!merchantEarnings[merchantId]) {
                    merchantEarnings[merchantId] = {
                        totalAmount: 0,
                        txCount: 0,
                        commissionRate: merchant.commission,
                        commissionEarned: 0,
                    };
                }
                merchantEarnings[merchantId].totalAmount += amount;
                merchantEarnings[merchantId].txCount += 1;
            }

            const result = Object.entries(merchantEarnings).map(([merchantId, data]) => ({
                client_id: merchantId,
                full_name: merchantLookup[merchantId]?.full_name || '—',
                email: merchantLookup[merchantId]?.email || '—',
                commission_rate: data.commissionRate,
                total_successful_amount: data.totalAmount,
                transaction_count: data.txCount,
                commission_earned: (calculateDistributorGrossRate(data.commissionRate) / 100) * data.totalAmount,
            }));

            result.sort((a, b) => b.commission_earned - a.commission_earned);

            const summary = {
                totalEarnings: result.reduce((sum, r) => sum + r.commission_earned, 0),
                totalSuccessfulAmount: result.reduce((sum, r) => sum + r.total_successful_amount, 0),
                merchantCount: result.length,
            };

            res.json({ success: true, data: result, summary });
        } catch (error) {
            console.error('❌ [/earnings]:', error instanceof Error ? error.message : error);
            next(error);
        }
    }
);

router.post(
    '/validate-vpa',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const caller = await verifyDistributor(req.headers.authorization, res);
            if (!caller) return;
            const { vpa, clientRefNum } = req.body as { vpa?: string; clientRefNum?: string };
            if (!vpa) throw new BadRequestError('Missing required field: vpa', 'MISSING_FIELDS');
            const result = await transbankService.validateVpa({ vpa, clientRefNum });
            res.json({ success: true, data: result });
        } catch (error) { next(error); }
    }
);

router.post('/prescreen/aadhaar-generate-otp', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { aadhaarNumber } = req.body;
        if (!aadhaarNumber || aadhaarNumber.length !== 12) {
            res.status(400).json({ success: false, error: { message: 'Valid 12-digit Aadhaar number is required' } });
            return;
        }
        const transbankConfig = {
            BASE_URL: process.env.TRANSBANK_BASE_URL || 'https://transbankuat.sabbpe.com/api',
            CLIENT_ID: process.env.TRANSBANK_CLIENT_ID || '5e06f31d-d298-11f0-96ff-4201c0a81e02',
            PROCESSOR: process.env.TRANSBANK_PROCESSOR || 'TRANSBANK',
        };
        const now = new Date();
        const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
        const timestamp = ist.toISOString().replace('T', ' ').substring(0, 19);
        const tokenRes = await fetch(`${transbankConfig.BASE_URL}/v1/token/generate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_Id: transbankConfig.CLIENT_ID, transaction_timestamp: timestamp, processor: transbankConfig.PROCESSOR }),
        });
        if (!tokenRes.ok) { res.status(500).json({ success: false, error: { message: 'Failed to generate Transbank token' } }); return; }
        const tokenData = await tokenRes.json() as { token?: string };
        if (!tokenData.token) { res.status(500).json({ success: false, error: { message: 'No token in Transbank response' } }); return; }
        const otpRes = await fetch(`${transbankConfig.BASE_URL}/aadhaar-okyc-generate-otp`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenData.token}` },
            body: JSON.stringify({ input: { aadhaarNumber } }),
        });
        const otpData = await otpRes.json() as any;
        // Support both old (sessionId) and new (referenceId) Transbank response formats
        const referenceId = otpData?.data?.referenceId || otpData?.data?.sessionId;
        if (referenceId) {
            res.status(200).json({ success: true, sessionId: referenceId, message: 'OTP sent to Aadhaar-linked mobile number' });
        } else {
            res.status(400).json({ success: false, error: { message: otpData?.result?.error?.message || otpData?.message || 'Failed to generate OTP' } });
        }
    } catch (error) { next(error); }
});

router.post('/prescreen/aadhaar-submit-otp', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { sessionId, otp } = req.body;
        if (!sessionId || !otp) { res.status(400).json({ success: false, error: { message: 'sessionId and otp are required' } }); return; }
        const transbankConfig = {
            BASE_URL: process.env.TRANSBANK_BASE_URL || 'https://transbankuat.sabbpe.com/api',
            CLIENT_ID: process.env.TRANSBANK_CLIENT_ID || '5e06f31d-d298-11f0-96ff-4201c0a81e02',
            PROCESSOR: process.env.TRANSBANK_PROCESSOR || 'TRANSBANK',
        };
        const now = new Date();
        const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
        const timestamp = ist.toISOString().replace('T', ' ').substring(0, 19);
        const tokenRes = await fetch(`${transbankConfig.BASE_URL}/v1/token/generate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_Id: transbankConfig.CLIENT_ID, transaction_timestamp: timestamp, processor: transbankConfig.PROCESSOR }),
        });
        const tokenData = await tokenRes.json() as { token?: string };
        if (!tokenData.token) { res.status(500).json({ success: false, error: { message: 'Failed to generate Transbank token' } }); return; }
        const kycRes = await fetch(`${transbankConfig.BASE_URL}/aadhaar-okyc-submit-otp`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenData.token}` },
            body: JSON.stringify({ input: { referenceId: sessionId, otp } }),
        });
        const kycData = await kycRes.json() as any;
        // Transbank returns { status: "success", data: {...} } — not { success: true }
        const kycResult = kycData?.data || kycData?.result?.data;
        const kycSuccess = kycData?.success === true || kycData?.status === 'success';
        if (kycSuccess && kycResult?.name) {
            res.status(200).json({ success: true, data: { name: kycResult.name, dob: kycResult.dob, gender: kycResult.gender, district: kycResult.splitAddress?.district || kycResult.district, state: kycResult.splitAddress?.state || kycResult.state, pincode: kycResult.splitAddress?.pincode || kycResult.pincode, photo: kycResult.photo } });
        } else {
            res.status(400).json({ success: false, error: { message: kycData?.data?.message || kycData?.result?.error?.message || kycData?.message || 'OTP verification failed' } });
        }
    } catch (error) { next(error); }
});

router.post('/prescreen/bank-validation', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { accountHolderName, ifscCode, accountNumber } = req.body;
        if (!accountHolderName || !ifscCode || !accountNumber) {
            res.status(400).json({ success: false, error: { message: 'accountHolderName, ifscCode and accountNumber are required' } });
            return;
        }

        const result = await transbankService.validateBankAccount({ accountHolderName, ifscCode, accountNumber });
        const payload = {
            isValid: result.isValid,
            accountName: result.accountName || null,
            accountStatus: result.accountStatus || null,
            requestId: result.requestId || null,
            trackingRefNo: result.trackingRefNo || null,
            responseId: result.responseId || null,
            statusCode: result.statusCode || null,
            status: result.status || null,
            message: result.message || null,
            error: result.error || null,
        };

        if (!result.isValid) {
            res.status(200).json({ success: false, data: payload });
            return;
        }

        res.status(200).json({ success: true, data: payload });
    } catch (error) {
        next(error);
    }
});

router.post('/prescreen/experian-report', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { name, mobile, pan } = req.body;
        if (!name || !mobile || !pan) { res.status(400).json({ success: false, error: { message: 'name, mobile and pan are required' } }); return; }
        const transbankConfig = {
            BASE_URL: process.env.TRANSBANK_BASE_URL || 'https://transbankuat.sabbpe.com/api',
            CLIENT_ID: process.env.TRANSBANK_CLIENT_ID || '5e06f31d-d298-11f0-96ff-4201c0a81e02',
            PROCESSOR: process.env.TRANSBANK_PROCESSOR || 'TRANSBANK',
        };
        const now = new Date();
        const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
        const timestamp = ist.toISOString().replace('T', ' ').substring(0, 19);
        const tokenRes = await fetch(`${transbankConfig.BASE_URL}/v1/token/generate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_Id: transbankConfig.CLIENT_ID, transaction_timestamp: timestamp, processor: transbankConfig.PROCESSOR }),
        });
        const tokenData = await tokenRes.json() as { token?: string };
        if (!tokenData.token) { res.status(500).json({ success: false, error: { message: 'Failed to generate Transbank token' } }); return; }
        const experianRes = await fetch(`${transbankConfig.BASE_URL}/experian-report`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenData.token}` },
            body: JSON.stringify({ name, mobile, pan, consent: 'Y', consent_text: 'I hereby provide my consent to fetch my Experian credit report.' }),
        });
        const experianData = await experianRes.json() as any;
        if (experianData?.status === 1 || experianData?.message === 'Success' || experianData?.statusCode === 200 || experianData?.status === 'OK') {
            res.status(200).json({ success: true, data: { creditScore: experianData.result?.credit_score || experianData.data?.creditScore || null, name: experianData.result?.name || null, pan: experianData.result?.pan || pan, txnId: experianData.txn_id || null, creditReport: experianData.result?.credit_report || experianData.data?.creditReport || null, rawResponse: experianData } });
        } else {
            res.status(400).json({ success: false, error: { message: experianData?.message || 'Failed to fetch Experian report' } });
        }
    } catch (error) { next(error); }
});

router.post('/prescreen/vpa-validation', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { vpa } = req.body;
        if (!vpa) { res.status(400).json({ success: false, error: { message: 'vpa is required' } }); return; }
        const result = await transbankService.validateVpa({ vpa });
        res.status(200).json({ success: true, data: result });
    } catch (error) { next(error); }
});

router.post('/assign-product', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { productType, settlementType, assignTo, merchantId } = req.body as { productType?: string; settlementType?: string; assignTo?: 'merchant' | 'distributor'; merchantId?: string };
        if (!productType) { res.status(400).json({ success: false, error: { message: 'productType is required' } }); return; }
        const caller = await verifyDistributor(req.headers.authorization, res);
        if (!caller) return;
        const admin = getAdminClient();
        if (assignTo === 'merchant') {
            if (!merchantId) { res.status(400).json({ success: false, error: { message: 'merchantId is required when assignTo=merchant' } }); return; }
            const { data: merchantRec } = await admin.from('merchant_profiles').select('id, distributor_id').eq('id', merchantId).maybeSingle();
            if (!merchantRec) { res.status(404).json({ success: false, error: { message: 'Merchant not found' } }); return; }
            if (merchantRec.distributor_id !== caller.userId) { res.status(403).json({ success: false, error: { message: 'Merchant does not belong to you' } }); return; }
            const { error: insertErr } = await admin.from('merchant_products').insert([{ merchant_id: merchantId, product_type: productType, settlement_type: settlementType || 'next_day', status: 'pending', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]);
            if (insertErr) throw new Error(insertErr.message);
            res.status(200).json({ success: true, message: 'Product assigned to merchant' });
            return;
        }
        if (assignTo === 'distributor') {
            try {
                const { error: distErr } = await admin.from('distributor_products').insert([{ distributor_id: caller.userId, product_type: productType, settlement_type: settlementType || 'next_day', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]);
                if (distErr) throw distErr;
                res.status(200).json({ success: true, message: 'Product assigned to distributor' });
                return;
            } catch (err) {
                res.status(501).json({ success: false, error: { message: 'Distributor product assignment not supported on this deployment' } });
                return;
            }
        }
        res.status(400).json({ success: false, error: { message: 'Invalid assignTo value' } });
    } catch (error) { next(error); }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/distributor/delete-merchant
// ─────────────────────────────────────────────────────────────────────────────

router.delete(
    '/delete-merchant',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const caller = await verifyDistributor(req.headers.authorization, res);
            if (!caller) return;

            const { merchantId } = req.body as { merchantId?: string };
            if (!merchantId) {
                res.status(400).json({ success: false, error: { message: 'merchantId is required' } });
                return;
            }

            const admin = getAdminClient();

            // Verify merchant belongs to this distributor
            const { data: merchant, error: fetchError } = await admin
                .from('merchant_profiles')
                .select('id, user_id, distributor_id')
                .eq('id', merchantId)
                .maybeSingle();

            if (fetchError || !merchant) {
                res.status(404).json({ success: false, error: { message: 'Merchant not found' } });
                return;
            }

            if (merchant.distributor_id !== caller.userId) {
                res.status(403).json({ success: false, error: { message: 'You do not have permission to delete this merchant' } });
                return;
            }

            // Delete related records first (foreign key safety)
            await admin.from('merchant_documents').delete().eq('merchant_id', merchantId);
            await admin.from('merchant_persons').delete().eq('merchant_id', merchantId);
            await admin.from('merchant_bank_details').delete().eq('merchant_id', merchantId);
            await admin.from('merchant_kyc').delete().eq('merchant_id', merchantId);
            await admin.from('merchant_products').delete().eq('merchant_id', merchantId);

            // Delete merchant profile
            const { error: deleteError } = await admin
                .from('merchant_profiles')
                .delete()
                .eq('id', merchantId);

            if (deleteError) throw new Error(`Failed to delete merchant: ${deleteError.message}`);

            // Optionally delete the auth user as well
            if (merchant.user_id) {
                try {
                    await admin.auth.admin.deleteUser(merchant.user_id);
                } catch (authErr) {
                    // Non-fatal — auth user deletion is optional
                    console.warn('⚠️ Could not delete auth user:', authErr instanceof Error ? authErr.message : authErr);
                }
            }

            logger.info(`Merchant ${merchantId} deleted by distributor ${caller.userId}`);

            res.status(200).json({
                success: true,
                message: 'Merchant deleted successfully',
            });
        } catch (error) {
            console.error('❌ [/delete-merchant]:', error instanceof Error ? error.message : error);
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/distributor/test-email — Send test credentials email
// ─────────────────────────────────────────────────────────────────────────────

router.post(
    '/test-email',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const caller = await verifyDistributor(req.headers.authorization, res);
            if (!caller) return;

            const { email } = req.body as { email?: string };
            if (!email) {
                res.status(400).json({ success: false, error: { message: 'email is required' } });
                return;
            }

            // Check if EMAIL_PASS is configured
            if (!process.env.EMAIL_PASS) {
                res.status(500).json({
                    success: false,
                    error: {
                        message: 'EMAIL_PASS is not configured in backend environment',
                        hint: 'Set EMAIL_PASS in backend/.env or production hosting env vars',
                    },
                });
                return;
            }

            await notificationService.sendMerchantCredentialsEmail({
                merchantEmail: email,
                merchantName: 'Test Merchant',
                password: 'test-password-123',
                commission: 5,
                distributorName: 'Test Distributor',
            });

            res.json({
                success: true,
                message: `Test credentials email sent to ${email}`,
                config: {
                    host: process.env.EMAIL_HOST || 'smtppro.zoho.in',
                    port: process.env.EMAIL_PORT || '465',
                    user: process.env.EMAIL_USER || 'payments@sabbpe.com',
                    passSet: !!process.env.EMAIL_PASS,
                },
            });
        } catch (error) {
            logger.error('Test email failed: ' + String(error));
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/distributor/sync-onboarded-by
// Manually sync client_onboarded_by for all merchants of this distributor
// ─────────────────────────────────────────────────────────────────────────────

router.post(
    '/sync-onboarded-by',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const caller = await verifyDistributor(req.headers.authorization, res);
            if (!caller) return;

            const admin = getAdminClient();
            const { data: merchantsData, error: merchantsError } = await admin
                .from('merchant_profiles')
                .select('email, distributor_id')
                .eq('distributor_id', caller.userId);
            if (merchantsError) throw merchantsError;

            const emailToDistributorId: Record<string, string> = {};
            (merchantsData || []).forEach((m: any) => {
                if (m.email && m.distributor_id) {
                    emailToDistributorId[m.email.toLowerCase()] = m.distributor_id;
                }
            });

            const updated = await syncClientOnboardedBy(emailToDistributorId);

            res.json({
                success: true,
                message: `Synced ${updated} merchant(s)`,
                total: Object.keys(emailToDistributorId).length,
                updated,
            });
        } catch (error) {
            console.error('❌ [/sync-onboarded-by]:', error instanceof Error ? error.message : error);
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/distributor/merchant/:id/settlement-config
// Distributor edits settlement & reserve terms for their merchant
// ─────────────────────────────────────────────────────────────────────────────

router.patch(
    '/merchant/:id/settlement-config',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const caller = await verifyDistributor(req.headers.authorization, res);
            if (!caller) return;

            const merchantId = req.params.id;
            const {
                rolling_reserve_enabled,
                rolling_reserve_percentage,
                rolling_reserve_fixed_inr,
                settlement_cycle_days,
            } = req.body;

            const adminClient = getAdminClient();

            // Fetch merchant profile
            const { data: merchant, error: fetchError } = await adminClient
                .from('merchant_profiles')
                .select('id, distributor_id, settlement_terms_locked')
                .eq('id', merchantId)
                .single();

            if (fetchError || !merchant) {
                res.status(404).json({ success: false, error: { message: 'Merchant not found' } });
                return;
            }

            if (merchant.distributor_id !== caller.userId && !caller.isAdmin) {
                res.status(403).json({ success: false, error: { message: 'Not authorized to edit this merchant' } });
                return;
            }

            if (merchant.settlement_terms_locked) {
                res.status(423).json({
                    success: false,
                    error: { message: 'Settlement terms are locked — settlement has already been processed' },
                });
                return;
            }

            // Validate
            const reserveEnabled = rolling_reserve_enabled ?? false;
            const settlementDays = settlement_cycle_days ?? 1;

            if (!(Number.isInteger(settlementDays) && settlementDays >= 1 && settlementDays <= 7)) {
                throw new BadRequestError('settlement_cycle_days must be an integer between 1 and 7', 'INVALID_SETTLEMENT_CYCLE');
            }

            if (reserveEnabled) {
                const hasPercentage = rolling_reserve_percentage !== null && rolling_reserve_percentage !== undefined && rolling_reserve_percentage > 0;
                const hasFixed = rolling_reserve_fixed_inr !== null && rolling_reserve_fixed_inr !== undefined && rolling_reserve_fixed_inr > 0;
                if (!hasPercentage && !hasFixed) {
                    throw new BadRequestError('When rolling reserve is enabled, provide either rolling_reserve_percentage or rolling_reserve_fixed_inr', 'RESERVE_AMOUNT_REQUIRED');
                }
                if (hasPercentage && hasFixed) {
                    throw new BadRequestError('Provide only one of rolling_reserve_percentage or rolling_reserve_fixed_inr, not both', 'RESERVE_BOTH_NOT_ALLOWED');
                }
                if (hasPercentage && (rolling_reserve_percentage < 0.01 || rolling_reserve_percentage > 50)) {
                    throw new BadRequestError('rolling_reserve_percentage must be between 0.01 and 50', 'RESERVE_PERCENTAGE_RANGE');
                }
                if (hasFixed && rolling_reserve_fixed_inr <= 0) {
                    throw new BadRequestError('rolling_reserve_fixed_inr must be a positive number', 'RESERVE_FIXED_INR_INVALID');
                }
            }

            // Update
            const { error: updateError } = await adminClient
                .from('merchant_profiles')
                .update({
                    rolling_reserve_enabled: reserveEnabled,
                    rolling_reserve_percentage: reserveEnabled ? (rolling_reserve_percentage ?? null) : null,
                    rolling_reserve_fixed_inr: reserveEnabled ? (rolling_reserve_fixed_inr ?? null) : null,
                    settlement_cycle_days: settlementDays,
                })
                .eq('id', merchantId);

            if (updateError) {
                throw new Error(`Failed to update settlement config: ${updateError.message}`);
            }

            res.json({ success: true, message: 'Settlement config updated' });
        } catch (error) {
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/distributor/merchant/:id/settlement-config/admin-override
// Admin overrides settlement & reserve terms (with audit logging)
// ─────────────────────────────────────────────────────────────────────────────

router.patch(
    '/merchant/:id/settlement-config/admin-override',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const caller = await verifyDistributor(req.headers.authorization, res);
            if (!caller) return;

            if (!caller.isAdmin) {
                res.status(403).json({ success: false, error: { message: 'Only admins can override settlement config' } });
                return;
            }

            const merchantId = req.params.id;
            const {
                rolling_reserve_enabled,
                rolling_reserve_percentage,
                rolling_reserve_fixed_inr,
                settlement_cycle_days,
                override_reason,
            } = req.body;

            const adminClient = getAdminClient();

            // Fetch current values
            const { data: merchant, error: fetchError } = await adminClient
                .from('merchant_profiles')
                .select('id, rolling_reserve_enabled, rolling_reserve_percentage, rolling_reserve_fixed_inr, settlement_cycle_days')
                .eq('id', merchantId)
                .single();

            if (fetchError || !merchant) {
                res.status(404).json({ success: false, error: { message: 'Merchant not found' } });
                return;
            }

            // Validate
            const reserveEnabled = rolling_reserve_enabled ?? false;
            const settlementDays = settlement_cycle_days ?? 1;

            if (!(Number.isInteger(settlementDays) && settlementDays >= 1 && settlementDays <= 7)) {
                throw new BadRequestError('settlement_cycle_days must be an integer between 1 and 7', 'INVALID_SETTLEMENT_CYCLE');
            }

            if (reserveEnabled) {
                const hasPercentage = rolling_reserve_percentage !== null && rolling_reserve_percentage !== undefined && rolling_reserve_percentage > 0;
                const hasFixed = rolling_reserve_fixed_inr !== null && rolling_reserve_fixed_inr !== undefined && rolling_reserve_fixed_inr > 0;
                if (!hasPercentage && !hasFixed) {
                    throw new BadRequestError('When rolling reserve is enabled, provide either rolling_reserve_percentage or rolling_reserve_fixed_inr', 'RESERVE_AMOUNT_REQUIRED');
                }
                if (hasPercentage && hasFixed) {
                    throw new BadRequestError('Provide only one of rolling_reserve_percentage or rolling_reserve_fixed_inr, not both', 'RESERVE_BOTH_NOT_ALLOWED');
                }
                if (hasPercentage && (rolling_reserve_percentage < 0.01 || rolling_reserve_percentage > 50)) {
                    throw new BadRequestError('rolling_reserve_percentage must be between 0.01 and 50', 'RESERVE_PERCENTAGE_RANGE');
                }
                if (hasFixed && rolling_reserve_fixed_inr <= 0) {
                    throw new BadRequestError('rolling_reserve_fixed_inr must be a positive number', 'RESERVE_FIXED_INR_INVALID');
                }
            }

            // Update with admin override flag
            const { error: updateError } = await adminClient
                .from('merchant_profiles')
                .update({
                    rolling_reserve_enabled: reserveEnabled,
                    rolling_reserve_percentage: reserveEnabled ? (rolling_reserve_percentage ?? null) : null,
                    rolling_reserve_fixed_inr: reserveEnabled ? (rolling_reserve_fixed_inr ?? null) : null,
                    settlement_cycle_days: settlementDays,
                    settlement_config_overridden_by_admin: true,
                    settlement_config_overridden_at: new Date().toISOString(),
                    settlement_config_overridden_by: caller.userId,
                    settlement_config_override_reason: override_reason || null,
                })
                .eq('id', merchantId);

            if (updateError) {
                throw new Error(`Failed to override settlement config: ${updateError.message}`);
            }

            res.json({
                success: true,
                message: 'Settlement config overridden by admin',
                previous: {
                    rolling_reserve_enabled: merchant.rolling_reserve_enabled,
                    rolling_reserve_percentage: merchant.rolling_reserve_percentage,
                    rolling_reserve_fixed_inr: merchant.rolling_reserve_fixed_inr,
                    settlement_cycle_days: merchant.settlement_cycle_days,
                },
            });
        } catch (error) {
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/distributor/merchant/:id/settlement-config
// Read-only view of settlement config (used by both distributor and admin)
// ─────────────────────────────────────────────────────────────────────────────

router.get(
    '/merchant/:id/settlement-config',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const caller = await verifyDistributor(req.headers.authorization, res);
            if (!caller) return;

            const merchantId = req.params.id;
            const adminClient = getAdminClient();

            const { data: merchant, error: fetchError } = await adminClient
                .from('merchant_profiles')
                .select('id, distributor_id, rolling_reserve_enabled, rolling_reserve_percentage, rolling_reserve_fixed_inr, settlement_cycle_days, settlement_terms_locked, settlement_config_overridden_by_admin, settlement_config_overridden_at, settlement_config_override_reason')
                .eq('id', merchantId)
                .single();

            if (fetchError || !merchant) {
                res.status(404).json({ success: false, error: { message: 'Merchant not found' } });
                return;
            }

            if (merchant.distributor_id !== caller.userId && !caller.isAdmin) {
                res.status(403).json({ success: false, error: { message: 'Not authorized to view this merchant' } });
                return;
            }

            res.json({ success: true, data: merchant });
        } catch (error) {
            next(error);
        }
    }
);

// ─── POST /create — Admin creates a new distributor ─────────────────────────
router.post('/create', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const caller = await verifyDistributor(req.headers.authorization, res);
        if (!caller) return;
        if (!caller.isAdmin) {
            res.status(403).json({ success: false, error: { message: 'Only admins can create distributors' } });
            return;
        }

        const { company_name, contact_person, email, mobile_number, pan_number, aadhaar_number, bank_account_holder, bank_name, bank_account_number, bank_ifsc, address, city, state, pincode, default_commission_rate, payout_cycle, profilePhotoBase64, profilePhotoFileName, signedAgreementBase64, signedAgreementFileName, panFileBase64, panDocumentFilename } = req.body;
        if (!company_name || !contact_person || !email || !mobile_number) {
            res.status(400).json({ success: false, error: { message: 'company_name, contact_person, email, and mobile_number are required' } });
            return;
        }

        // Validate PAN format (e.g., AAAAA9999A)
        if (pan_number && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test(pan_number)) {
            res.status(400).json({ success: false, error: { message: 'Invalid PAN number format' } });
            return;
        }

        // Validate Aadhaar — must be exactly 12 digits
        if (aadhaar_number && (!/^\d{12}$/.test(aadhaar_number))) {
            res.status(400).json({ success: false, error: { message: 'Aadhaar number must be exactly 12 digits' } });
            return;
        }

        // Validate payout_cycle
        const validCycles = ['weekly', 'biweekly', 'monthly', 'daily'];
        if (payout_cycle && !validCycles.includes(payout_cycle)) {
            res.status(400).json({ success: false, error: { message: `Invalid payout_cycle. Must be one of: ${validCycles.join(', ')}` } });
            return;
        }

        // Validate bank account via Transbank if all bank fields provided
        if (bank_account_holder && bank_account_number && bank_ifsc) {
            try {
                const bankValidation = await transbankService.validateBankAccount({
                    accountHolderName: bank_account_holder,
                    ifscCode: bank_ifsc,
                    accountNumber: bank_account_number,
                });
                if (!bankValidation.isValid) {
                    res.status(400).json({ success: false, error: { message: bankValidation.error || 'Bank account validation failed' } });
                    return;
                }
            } catch (bankErr) {
                logger.warn('Bank validation API unavailable, proceeding without bank verification');
            }
        }

        const adminClient = getAdminClient();

        const { data: existingProfile } = await adminClient
            .from('distributor_profiles')
            .select('id')
            .eq('email', email)
            .maybeSingle();

        if (existingProfile) {
            res.status(409).json({ success: false, error: { message: 'A distributor with this email already exists' } });
            return;
        }

        const tempPassword = crypto.randomUUID().replace(/-/g, '').substring(0, 12);

        const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
            email,
            password: tempPassword,
            email_confirm: true,
        });

        if (authError) {
            if (authError.message?.includes('already')) {
                res.status(409).json({ success: false, error: { message: 'A user with this email already exists in auth' } });
                return;
            }
            logger.error('Failed to create auth user for distributor', authError);
            res.status(500).json({ success: false, error: { message: 'Failed to create auth user' } });
            return;
        }

        const userId = authData?.user?.id;
        if (!userId) {
            res.status(500).json({ success: false, error: { message: 'Auth user created but no user ID returned' } });
            return;
        }

        const { error: roleError } = await adminClient
            .from('user_roles')
            .insert({ user_id: userId, role: 'distributor' });

        if (roleError && !roleError.message?.includes('duplicate')) {
            logger.error('Failed to insert user_roles', roleError);
            res.status(500).json({ success: false, error: { message: 'Failed to set distributor role' } });
            return;
        }

        // Upload profile photo and signed agreement copy (admin-provided)
        const supabaseClient = getSupabaseClient();
        const now = new Date().toISOString();
        const adminUserId = caller.userId;

        let profilePhotoPath: string | null = null;
        if (profilePhotoBase64 && profilePhotoFileName) {
            profilePhotoPath = await uploadBase64File(
                supabaseClient,
                'profile-images',
                userId,
                profilePhotoBase64,
                profilePhotoFileName,
                'image/jpeg'
            );
        }

        let signedAgreementPath: string | null = null;
        if (signedAgreementBase64 && signedAgreementFileName) {
            signedAgreementPath = await uploadBase64File(
                supabaseClient,
                'distributor-agreements',
                userId,
                signedAgreementBase64,
                signedAgreementFileName,
                'application/pdf'
            );
        }

        let panDocumentPath: string | null = null;
        if (panFileBase64 && panDocumentFilename) {
            panDocumentPath = await uploadBase64File(
                supabaseClient,
                'merchant-documents',
                userId,
                panFileBase64,
                panDocumentFilename,
                'image/jpeg'
            );
        }

        // Since admin uploads the signed agreement at creation, mark agreement as approved
        // and skip the distributor self-sign onboarding flow.
        const { data: profile, error: profileError } = await adminClient
            .from('distributor_profiles')
            .insert({
                user_id: userId,
                company_name,
                contact_person,
                email,
                mobile_number,
                pan_number: pan_number || null,
                aadhaar_last4: aadhaar_number ? aadhaar_number.slice(-4) : null,
                bank_account_holder: bank_account_holder || null,
                bank_name: bank_name || null,
                bank_account_number: bank_account_number || null,
                bank_ifsc: bank_ifsc || null,
                address: address || null,
                city: city || null,
                state: state || null,
                pincode: pincode || null,
                default_commission_rate: default_commission_rate ? parseFloat(default_commission_rate) : null,
                payout_cycle: payout_cycle || 'monthly',
                profile_photo_path: profilePhotoPath,
                pan_document_path: panDocumentPath,
                signed_agreement_path: signedAgreementPath,
                agreement_uploaded_at: signedAgreementPath ? now : null,
                agreement_approved_at: signedAgreementPath ? now : null,
                agreement_approved_by: signedAgreementPath ? adminUserId : null,
                is_active: false,
                agreement_status: signedAgreementPath ? 'approved' : 'pending',
                kyc_status: 'pending',
            })
            .select('*')
            .single();

        if (profileError) {
            logger.error('Failed to insert distributor_profiles', profileError);
            res.status(500).json({ success: false, error: { message: 'Failed to create distributor profile' } });
            return;
        }

        logger.info('Distributor created', { distributorId: profile.id, email });
        res.status(201).json({ success: true, data: profile, message: 'Distributor created successfully' });
    } catch (error) {
        next(error);
    }
});

export default router;
