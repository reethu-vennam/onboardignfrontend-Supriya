// backend/src/routes/supabase.ts
import { Router, Request, Response, NextFunction } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { bankApiService } from '../services/bankApiService';
import { logger } from '../utils/logger';
import { BadRequestError } from '../utils/errors';
import { OnboardingStatus, MerchantDocument as MerchantDocumentType } from '../types/merchant';

const router = Router();

// Lazy initialize Supabase client (service role, bypasses RLS)
let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
    if (!supabaseClient) {
        const supabaseUrl = process.env.SUPABASE_URL;
        // Prefer the service-role key when available (bypasses RLS). Fall back to SERVICE_KEY for compatibility.
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

        if (!supabaseUrl) {
            throw new Error('SUPABASE_URL environment variable is not set');
        }
        if (!supabaseKey) {
            throw new Error('SUPABASE_SERVICE_KEY environment variable is not set');
        }

        supabaseClient = createClient(supabaseUrl, supabaseKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });

        logger.info('Supabase client initialized', {
            url: supabaseUrl.substring(0, 30) + '...',
            usingServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY
        });
    }
    return supabaseClient;
}

// Alias: getAdminClient is the same singleton (service-role client for backend operations)
export const getAdminClient = getSupabaseClient;

// ----------------- Types -----------------

interface MerchantProfile {
    id: string;
    user_id: string;
    full_name: string;
    mobile_number: string;
    email: string;
    pan_number: string | null;
    aadhaar_number: string | null;
    business_name: string | null;
    gst_number: string | null;
    OnboardingStatus: SupabaseOnboardingStatus;
    submitted_at: string | null;
    created_at: string;
    updated_at: string;
}

interface BankDetails {
    id: string;
    merchant_id: string;
    account_number: string;
    ifsc_code: string;
    bank_name: string;
    account_holder_name: string;
    created_at: string;
    updated_at: string;
}

interface MerchantDocument {
    id: string;
    merchant_id: string;
    document_type: string;
    file_name: string;
    file_path: string;
    file_size: number | null;
    mime_type: string | null;
    status: string;
    uploaded_at: string;
    verified_at: string | null;
    verified_by: string | null;
    rejection_reason: string | null;
}

interface MerchantKYC {
    id: string;
    merchant_id: string;
    video_kyc_completed: boolean | null;
    location_captured: boolean | null;
    latitude: number | null;
    longitude: number | null;
    video_kyc_file_path: string | null;
    selfie_file_path: string | null;
    kyc_status: string;
    completed_at: string | null;
    verified_at: string | null;
    verified_by: string | null;
    rejection_reason: string | null;
    created_at: string;
    updated_at: string;
}

interface WebhookPayload {
    type: 'INSERT' | 'UPDATE' | 'DELETE';
    table: string;
    record: MerchantProfile;
    old_record: MerchantProfile | null;
}

interface BankWebhookPayload {
    applicationId: string;
    merchantId: string;
    decision: {
        approved: boolean;
        reason: string | null;
    };
}

interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

interface StatusUpdateData {
    rejection_reason?: string;
    bank_application_id?: string;
    bank_response?: Record<string, unknown>;
    decision_at?: string;
}

type SupabaseOnboardingStatus =
    | 'approved'
    | 'verified'
    | 'submitted'
    | 'pending'
    | 'rejected'
    | 'in_progress';

// ----------------- Helper: Status mapping -----------------
function mapInternalStatusToSupabase(status: string): SupabaseOnboardingStatus {
    switch (status) {
        case 'validating':
        case 'pending_bank_approval':
            return 'in_progress';
        case 'validation_failed':
        case 'bank_rejected':
            return 'rejected';
        default:
            return status as SupabaseOnboardingStatus;
    }
}

// ----------------- Update merchant status -----------------
async function updateMerchantStatus(
    merchantId: string,
    status: SupabaseOnboardingStatus,
    additionalData?: StatusUpdateData
): Promise<void> {
    const updateData: {
        OnboardingStatus: SupabaseOnboardingStatus;
        updated_at: string;
        rejection_reason?: string;
        bank_application_id?: string;
        bank_response?: Record<string, unknown>;
        decision_at?: string;
    } = {
        OnboardingStatus: status,
        updated_at: new Date().toISOString()
    };

    if (additionalData?.rejection_reason) updateData.rejection_reason = additionalData.rejection_reason;
    if (additionalData?.bank_application_id) updateData.bank_application_id = additionalData.bank_application_id;
    if (additionalData?.bank_response) updateData.bank_response = additionalData.bank_response;
    if (additionalData?.decision_at) updateData.decision_at = additionalData.decision_at;

    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('merchant_profiles')
        .update(updateData)
        .eq('id', merchantId);

    if (error) {
        logger.error('Failed to update merchant status', error);
        throw new Error(`Status update failed: ${error.message}`);
    }

    logger.info('Merchant status updated', { merchantId, status });
}

// ----------------- Validation -----------------
function validateMerchantData(
    merchant: MerchantProfile,
    bankDetails: BankDetails | null,
    documents: MerchantDocument[],
    kycData: MerchantKYC | null
): ValidationResult {
    const errors: string[] = [];

    if (!merchant.full_name?.trim()) errors.push('Full name is required');
    if (!merchant.mobile_number?.trim()) errors.push('Mobile number is required');
    if (!merchant.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(merchant.email)) errors.push('Valid email is required');
    if (!merchant.business_name?.trim()) errors.push('Business name is required');
    if (!merchant.pan_number?.trim()) errors.push('PAN number is required');
    if (!merchant.aadhaar_number?.trim()) errors.push('Aadhaar number is required');

    if (!bankDetails) {
        errors.push('Bank details are required');
    } else {
        if (!bankDetails.account_number?.trim()) errors.push('Bank account number is required');
        if (!bankDetails.ifsc_code?.trim()) errors.push('IFSC code is required');
        if (!bankDetails.bank_name?.trim()) errors.push('Bank name is required');
        if (!bankDetails.account_holder_name?.trim()) errors.push('Account holder name is required');
    }

    if (documents.length === 0) {
        errors.push('Documents are required');
    } else {
        const requiredDocs = ['pan_card', 'aadhaar_card', 'cancelled_cheque'];
        const uploadedTypes = documents.map(d => d.document_type);
        requiredDocs.forEach(type => {
            if (!uploadedTypes.includes(type)) errors.push(`${type.replace('_', ' ')} document is required`);
        });
    }

    if (!kycData || !kycData.video_kyc_completed) errors.push('Video KYC must be completed');

    return { isValid: errors.length === 0, errors };
}

// ----------------- Process submitted merchant -----------------
async function processSubmittedMerchant(merchant: MerchantProfile): Promise<void> {
    const merchantId = merchant.id;

    try {
        logger.info('Processing merchant submission', { merchantId, business_name: merchant.business_name || 'Unknown' });

        await updateMerchantStatus(merchantId, mapInternalStatusToSupabase('validating'));

        const supabase = getSupabaseClient();

        const [bankResult, documentsResult, kycResult] = await Promise.all([
            supabase.from('merchant_bank_details').select('*').eq('merchant_id', merchantId).single(),
            supabase.from('merchant_documents').select('*').eq('merchant_id', merchantId),
            supabase.from('merchant_kyc').select('*').eq('merchant_id', merchantId).single()
        ]);

        const bankDetails = bankResult.data as BankDetails | null;
        const documents = (documentsResult.data || []) as MerchantDocument[];
        const kycData = kycResult.data as MerchantKYC | null;

        const validation = validateMerchantData(merchant, bankDetails, documents, kycData);

        if (!validation.isValid) {
            await updateMerchantStatus(merchantId, mapInternalStatusToSupabase('validation_failed'), {
                rejection_reason: validation.errors.join('; ')
            });

            logger.warn('Merchant validation failed', { merchantId, errorCount: validation.errors.length });
            return;
        }

        // ? GENERATE UPI CREDENTIALS BEFORE BANK API CALL
        logger.info('Validation passed, generating UPI credentials', { merchantId });

        const phone = merchant.mobile_number.replace(/\D/g, ''); // Remove non-digits
        const upiVpa = `${phone}@sabbpe`;
        const business_name = merchant.business_name || 'Merchant';
        const upiQrString = `upi://pay?pa=${upiVpa}&pn=${encodeURIComponent(business_name)}&cu=INR`;

        // Save UPI to database BEFORE bank submission
        const { error: upiError } = await supabase
            .from('merchant_profiles')
            .update({
                upi_vpa: upiVpa,
                upi_qr_string: upiQrString,
                updated_at: new Date().toISOString()
            })
            .eq('id', merchantId);

        if (upiError) {
            logger.error('Failed to save UPI credentials', upiError);
            await updateMerchantStatus(merchantId, mapInternalStatusToSupabase('validation_failed'), {
                rejection_reason: `UPI generation failed: ${upiError.message}`
            });
            return;
        }

        logger.info('UPI credentials generated and saved', { merchantId, upiVpa });

        // ? NOW CALL BANK API WITH UPI DATA
        logger.info('Calling Bank API with UPI credentials', { merchantId, upiVpa });

        const bankProfile = {
            id: merchant.id,
            user_id: merchant.user_id,
            businessName: merchant.business_name || '',
            businessType: 'retail',
            registrationNumber: merchant.pan_number || '',
            taxId: merchant.gst_number || '',
            email: merchant.email,
            phone: merchant.mobile_number,
            website: undefined,
            addressLine1: 'TBD',
            addressLine2: undefined,
            city: 'TBD',
            state: 'TBD',
            postalCode: 'TBD',
            country: 'India',
            documents: documents.map(doc => ({
                type: doc.document_type as 'business_license' | 'tax_certificate' | 'id_proof' | 'bank_statement' | 'other',
                url: doc.file_path,
                filename: doc.file_name,
                uploadedAt: doc.uploaded_at
            })),
            OnboardingStatus: 'validating' as OnboardingStatus,
            createdAt: merchant.created_at,
            updatedAt: new Date().toISOString()
        };

        const bankResponse = await bankApiService.submitMerchantApplication(
            bankProfile as any,
            upiVpa,
            upiQrString
        );

        await updateMerchantStatus(merchantId, mapInternalStatusToSupabase('pending_bank_approval'), {
            bank_application_id: bankResponse.applicationId,
            bank_response: {
                applicationId: bankResponse.applicationId,
                estimatedProcessingTime: bankResponse.estimatedProcessingTime || 'Unknown',
                upiVpa,
                upiQrString
            }
        });

        logger.info('Bank API submission successful', {
            merchantId,
            applicationId: bankResponse.applicationId,
            upiVpa
        });

    } catch (error) {
        logger.error('Error processing merchant', error instanceof Error ? error : undefined);

        await updateMerchantStatus(merchantId, mapInternalStatusToSupabase('validation_failed'), {
            rejection_reason: error instanceof Error ? error.message : 'Processing error'
        });
    }
}

// ----------------- Supabase webhook -----------------
router.post('/merchant-webhook', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const payload = req.body as WebhookPayload;

        // Just log for audit trail
        logger.info('?? Merchant profile updated', {
            merchantId: payload.record?.id,
            status: payload.record?.OnboardingStatus,
            timestamp: new Date().toISOString()
        });

        // Could send notifications here if needed
        // Could update cache here if needed
        // But NO business operations

        res.json({ success: true });

    } catch (error) {
        next(error);
    }
});

// ----------------- Bank webhook -----------------
router.post('/bank-webhook', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const payload = req.body as BankWebhookPayload;

        logger.info('Received bank webhook', {
            applicationId: payload.applicationId,
            merchantId: payload.merchantId,
            approved: payload.decision.approved
        });

        // Skip signature verification for mock bank (or check properly)
        // const isValid = await bankApiService.verifyWebhook(req.body);
        // if (!isValid) throw new BadRequestError('Invalid webhook signature', 'INVALID_WEBHOOK');

        const newStatus = payload.decision.approved ? 'approved' : 'rejected';

        await updateMerchantStatus(payload.merchantId, mapInternalStatusToSupabase(newStatus), {
            bank_response: { approved: payload.decision.approved, reason: payload.decision.reason },
            decision_at: new Date().toISOString(),
            rejection_reason: payload.decision.approved ? undefined : payload.decision.reason || undefined
        });

        res.json({ success: true, message: 'Webhook processed' });
    } catch (error) {
        next(error);
    }
});

export default router;