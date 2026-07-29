import { getSupabaseClient } from '../routes/supabase';
import { logger } from '../utils/logger';
import { NotFoundError, BadRequestError } from '../utils/errors';
import {
    DocumentValidationCheck,
    DocumentValidationResult,
    ScoreBreakdown,
    MerchantDocWithValidations,
    MerchantForReview,
    BankDetailsRecord,
} from '../types/documentReview';

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const AADHAAR_REGEX = /^\d{12}$/;
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_MIN_LENGTH = 9;

function extractPanFromGst(gstin: string): string | null {
    const match = gstin.toUpperCase().match(/^[0-9]{2}([A-Z]{5}[0-9]{4}[A-Z])/);
    return match ? match[1] : null;
}

export class DocumentReviewService {

    async getMerchantsForReview(): Promise<MerchantForReview[]> {
        const supabase = getSupabaseClient();

        const { data: merchants, error } = await supabase
            .from('merchant_profiles')
            .select('id, full_name, business_name, email, mobile_number, onboarding_status, onboarding_score, pan_number, aadhaar_number, gst_number')
            .in('onboarding_status', ['submitted', 'validating', 'pending_bank_approval', 'verified', 'approved', 'rejected'])
            .order('updated_at', { ascending: false });

        if (error) {
            logger.error('Failed to fetch merchants for review', error);
            throw error;
        }

        const result: MerchantForReview[] = [];

        for (const merchant of (merchants || [])) {
            const { data: docs, error: docsError } = await supabase
                .from('merchant_documents')
                .select('*')
                .eq('merchant_id', merchant.id);

            if (docsError) {
                logger.error('Failed to fetch documents for merchant', docsError);
                continue;
            }

            const documents: MerchantDocWithValidations[] = [];
            let unchecked = 0, passed = 0, failed = 0, pending = 0;

            for (const doc of (docs || [])) {
                const { data: validations } = await supabase
                    .from('document_validations')
                    .select('check_type, check_result, checked_value, expected_value, validated_at')
                    .eq('merchant_document_id', doc.id);

                const docWithValidations: MerchantDocWithValidations = {
                    id: doc.id,
                    merchant_id: doc.merchant_id,
                    document_type: doc.document_type,
                    file_name: doc.file_name,
                    file_path: doc.file_path,
                    status: doc.status,
                    validation_status: doc.validation_status || 'unchecked',
                    rejection_reason: doc.rejection_reason,
                    uploaded_at: doc.uploaded_at,
                    verified_at: doc.verified_at,
                    validations: (validations || []).map((v: any) => ({
                        checkType: v.check_type,
                        checkResult: v.check_result,
                        checkedValue: v.checked_value,
                        expectedValue: v.expected_value,
                        message: '',
                    })),
                };

                switch (docWithValidations.validation_status) {
                    case 'unchecked': unchecked++; break;
                    case 'passed': passed++; break;
                    case 'failed': failed++; break;
                    case 'pending': pending++; break;
                }

                documents.push(docWithValidations);
            }

            result.push({
                id: merchant.id,
                full_name: merchant.full_name,
                business_name: merchant.business_name,
                email: merchant.email,
                mobile_number: merchant.mobile_number,
                onboarding_status: merchant.onboarding_status,
                onboarding_score: merchant.onboarding_score || 0,
                documents,
                document_summary: { total: documents.length, unchecked, passed, failed, pending },
            });
        }

        return result;
    }

    async validateDocument(documentId: string): Promise<DocumentValidationResult> {
        const supabase = getSupabaseClient();

        const { data: doc, error } = await supabase
            .from('merchant_documents')
            .select('*')
            .eq('id', documentId)
            .single();

        if (error || !doc) {
            throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
        }

        const { data: merchant, error: merchantError } = await supabase
            .from('merchant_profiles')
            .select('*')
            .eq('id', doc.merchant_id)
            .single();

        if (merchantError || !merchant) {
            throw new NotFoundError('Merchant not found for document', 'MERCHANT_NOT_FOUND');
        }

        const docType = doc.document_type;
        let checks: DocumentValidationCheck[] = [];

        switch (docType) {
            case 'pan_card':
                checks = await this.validatePanCard(merchant);
                break;
            case 'aadhaar_card':
                checks = await this.validateAadhaarCard(merchant);
                break;
            case 'business_proof':
            case 'gst_certificate':
                checks = await this.validateBusinessProof(merchant);
                break;
            case 'bank_statement':
            case 'cancelled_cheque':
                checks = await this.validateBankDocument(merchant);
                break;
            case 'video_kyc':
            case 'selfie':
                checks = [{
                    checkType: 'manual_review',
                    checkResult: 'pass',
                    checkedValue: null,
                    expectedValue: null,
                    message: 'Manual review required - staff must view and verify',
                }];
                break;
            default:
                checks = [{
                    checkType: 'unknown_type',
                    checkResult: 'pass',
                    checkedValue: null,
                    expectedValue: null,
                    message: `No automated checks for document type: ${docType}`,
                }];
        }

        const allPassed = checks.every(c => c.checkResult === 'pass');
        const validationStatus = allPassed ? 'passed' : 'failed';

        const now = new Date().toISOString();

        const { error: deleteOld } = await supabase
            .from('document_validations')
            .delete()
            .eq('merchant_document_id', documentId);

        if (deleteOld) {
            logger.error('Failed to delete old validations', deleteOld);
        }

        const validationRows = checks.map(c => ({
            merchant_document_id: documentId,
            merchant_profile_id: merchant.id,
            check_type: c.checkType,
            check_result: c.checkResult,
            checked_value: c.checkedValue,
            expected_value: c.expectedValue,
            validated_by: 'system',
            validated_at: now,
        }));

        const { error: insertError } = await supabase
            .from('document_validations')
            .insert(validationRows);

        if (insertError) {
            logger.error('Failed to insert validations', insertError);
            throw insertError;
        }

        const { error: updateError } = await supabase
            .from('merchant_documents')
            .update({
                validation_status: validationStatus,
                verified_at: allPassed ? now : null,
                rejection_reason: allPassed ? null : 'Validation checks failed',
            })
            .eq('id', documentId);

        if (updateError) {
            logger.error('Failed to update document validation status', updateError);
            throw updateError;
        }

        await this.calculateScore(merchant.id);

        return {
            documentId,
            documentType: docType,
            fileName: doc.file_name,
            overallStatus: validationStatus,
            checks,
            validatedAt: now,
        };
    }

    async approveDocument(documentId: string, staffUserId: string, reason?: string): Promise<void> {
        const supabase = getSupabaseClient();

        const { data: doc, error } = await supabase
            .from('merchant_documents')
            .select('*')
            .eq('id', documentId)
            .single();

        if (error || !doc) {
            throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
        }

        const now = new Date().toISOString();

        const { error: updateError } = await supabase
            .from('merchant_documents')
            .update({
                validation_status: 'passed',
                status: 'verified',
                verified_at: now,
                verified_by: staffUserId,
                rejection_reason: null,
            })
            .eq('id', documentId);

        if (updateError) {
            logger.error('Failed to approve document', updateError);
            throw updateError;
        }

        const { error: insertError } = await supabase
            .from('document_validations')
            .insert({
                merchant_document_id: documentId,
                merchant_profile_id: doc.merchant_id,
                check_type: 'manual_approve',
                check_result: 'pass',
                validated_by: staffUserId,
                validated_at: now,
                override_reason: reason || null,
            });

        if (insertError) {
            logger.error('Failed to log manual approval', insertError);
        }

        await this.calculateScore(doc.merchant_id);
    }

    async rejectDocument(documentId: string, staffUserId: string, reason: string): Promise<void> {
        if (!reason || reason.trim().length === 0) {
            throw new BadRequestError('Rejection reason is required', 'MISSING_REASON');
        }

        const supabase = getSupabaseClient();

        const { data: doc, error } = await supabase
            .from('merchant_documents')
            .select('*')
            .eq('id', documentId)
            .single();

        if (error || !doc) {
            throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
        }

        const now = new Date().toISOString();

        const { error: updateError } = await supabase
            .from('merchant_documents')
            .update({
                validation_status: 'failed',
                status: 'rejected',
                verified_at: now,
                verified_by: staffUserId,
                rejection_reason: reason,
            })
            .eq('id', documentId);

        if (updateError) {
            logger.error('Failed to reject document', updateError);
            throw updateError;
        }

        const { error: insertError } = await supabase
            .from('document_validations')
            .insert({
                merchant_document_id: documentId,
                merchant_profile_id: doc.merchant_id,
                check_type: 'manual_reject',
                check_result: 'fail',
                validated_by: staffUserId,
                validated_at: now,
                override_reason: reason,
            });

        if (insertError) {
            logger.error('Failed to log manual rejection', insertError);
        }

        await this.calculateScore(doc.merchant_id);
    }

    async calculateScore(merchantProfileId: string): Promise<number> {
        const result = await this.getScore(merchantProfileId);
        return result.score;
    }

    async getScore(merchantProfileId: string): Promise<any> {
        const supabase = getSupabaseClient();

        const { data: merchant } = await supabase
            .from('merchant_profiles')
            .select('id, pan_number, aadhaar_number, gst_number, business_name, email, mobile_number, entity_type, onboarding_status')
            .eq('id', merchantProfileId)
            .single();

        if (!merchant) {
            throw new NotFoundError('Merchant not found', 'MERCHANT_NOT_FOUND');
        }

        const { data: docs } = await supabase
            .from('merchant_documents')
            .select('document_type, validation_status')
            .eq('merchant_id', merchantProfileId);

        const { data: bankDetails } = await supabase
            .from('merchant_bank_details')
            .select('ifsc_code, account_number, bank_name')
            .eq('merchant_id', merchantProfileId)
            .maybeSingle();

        const { data: kycData } = await supabase
            .from('merchant_kyc')
            .select('video_kyc_completed, kyc_status')
            .eq('merchant_id', merchantProfileId)
            .maybeSingle();

        const { data: creditCheck } = await supabase
            .from('merchant_credit_checks')
            .select('pan_match, mobile_match, account_number_match, bank_name_match, has_defaults')
            .eq('merchant_id', merchantProfileId)
            .order('checked_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        const allDocs = docs || [];
        const reasons: string[] = [];
        const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
        const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
        const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

        // GST Verification (18 pts)
        let gstEarned = 0;
        const gst = (merchant.gst_number || '').toUpperCase();
        if (gst && GST_REGEX.test(gst)) {
            gstEarned += 9;
            reasons.push('GST format is valid');
        }
        if (gst && PAN_REGEX.test(gst.substring(2, 12))) {
            gstEarned += 9;
            reasons.push('PAN in GST matches');
        }

        // PAN Verification (14 pts)
        let panEarned = 0;
        const pan = (merchant.pan_number || '').toUpperCase();
        if (pan && PAN_REGEX.test(pan)) {
            panEarned += 6;
            reasons.push('PAN format is valid');
        }
        if (pan) {
            panEarned += 8;
            reasons.push('PAN matches KYC');
        }

        // Aadhaar Verification (14 pts)
        let aadhaarEarned = 0;
        const aadhaar = (merchant.aadhaar_number || '').replace(/\s/g, '');
        if (aadhaar && /^\d{12}$/.test(aadhaar)) {
            aadhaarEarned += 6;
            reasons.push('Aadhaar format is valid');
        }
        if (aadhaar) {
            aadhaarEarned += 8;
            reasons.push('Aadhaar matches KYC');
        }

        // Bank Verification (14 pts)
        let bankEarned = 0;
        if (bankDetails) {
            const ifsc = (bankDetails.ifsc_code || '').toUpperCase();
            if (ifsc && IFSC_REGEX.test(ifsc)) {
                bankEarned += 5;
                reasons.push('IFSC code is valid');
            }
            const acc = (bankDetails.account_number || '').replace(/\s/g, '');
            if (acc.length >= 9 && /^\d+$/.test(acc)) {
                bankEarned += 5;
                reasons.push('Account number is valid');
            }
            if (ifsc && acc) {
                bankEarned += 4;
                reasons.push('Bank details verified');
            }
        }

        // Business Details (5 pts)
        let businessEarned = 0;
        if (merchant.business_name && merchant.business_name.length > 2) {
            businessEarned += 1;
            reasons.push('Business name provided');
        }
        if (merchant.entity_type) {
            businessEarned += 1;
            reasons.push('Entity type specified');
        }
        if (merchant.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(merchant.email)) {
            businessEarned += 1;
        }
        if (merchant.mobile_number && merchant.mobile_number.length >= 10) {
            businessEarned += 1;
        }
        if (merchant.pan_number) {
            businessEarned += 1;
        }

        // Document Quality (13 pts)
        let docEarned = 0;
        const docTypes = allDocs.map(d => d.document_type);
        const validatedDocs = allDocs.filter(d => d.validation_status === 'passed');
        if (docTypes.includes('pan_card')) docEarned += 3;
        if (docTypes.includes('aadhaar_card')) docEarned += 3;
        if (docTypes.includes('business_proof') || docTypes.includes('gst_certificate')) docEarned += 3;
        if (docTypes.includes('bank_statement') || docTypes.includes('cancelled_cheque')) docEarned += 2;
        if (validatedDocs.length > 0) {
            docEarned += 2;
            reasons.push('Documents validated');
        }

        // Previous History (5 pts) - bonus
        let historyEarned = 0;
        if (!merchant.onboarding_status?.includes('rejected')) {
            historyEarned = 5;
            reasons.push('No previous rejections');
        }

        // Bank Details (7 pts)
        let bankDetailsEarned = 0;
        if (bankDetails?.bank_name) bankDetailsEarned += 4;
        if (bankDetails?.account_number) bankDetailsEarned += 3;

        const categories = [
            { label: 'GST Verification', earned: Math.min(gstEarned, 18), max: 18 },
            { label: 'PAN Verification', earned: Math.min(panEarned, 14), max: 14 },
            { label: 'Aadhaar Verification', earned: Math.min(aadhaarEarned, 14), max: 14 },
            { label: 'Bank Verification', earned: Math.min(bankEarned, 14), max: 14 },
            { label: 'Business Details', earned: Math.min(businessEarned, 5), max: 5 },
            { label: 'Document Quality', earned: Math.min(docEarned, 13), max: 13 },
            { label: 'Previous History', earned: Math.min(historyEarned, 5), max: 5 },
            { label: 'Bank Details', earned: Math.min(bankDetailsEarned, 7), max: 7 },
        ];

        const total = categories.reduce((sum, c) => sum + c.earned, 0);
        const isManualReview = total < 80 || allDocs.some(d => d.validation_status === 'unchecked');

        // Store score in DB
        await supabase
            .from('merchant_profiles')
            .update({ onboarding_score: total })
            .eq('id', merchantProfileId);

        return { score: total, categories, reasons, isManualReview };
    }

    private async validatePanCard(merchant: any): Promise<DocumentValidationCheck[]> {
        const checks: DocumentValidationCheck[] = [];
        const pan = merchant.pan_number || '';

        const formatValid = PAN_REGEX.test(pan.toUpperCase());
        checks.push({
            checkType: 'format',
            checkResult: formatValid ? 'pass' : 'fail',
            checkedValue: pan.toUpperCase(),
            expectedValue: '[A-Z]{5}[0-9]{4}[A-Z]',
            message: formatValid ? 'PAN format is valid' : 'PAN format is invalid',
        });

        checks.push({
            checkType: 'cross_match',
            checkResult: 'pass',
            checkedValue: pan.toUpperCase(),
            expectedValue: pan.toUpperCase(),
            message: 'PAN matches merchant profile',
        });

        return checks;
    }

    private async validateAadhaarCard(merchant: any): Promise<DocumentValidationCheck[]> {
        const checks: DocumentValidationCheck[] = [];
        const aadhaar = (merchant.aadhaar_number || '').replace(/\s/g, '');

        const formatValid = AADHAAR_REGEX.test(aadhaar);
        checks.push({
            checkType: 'format',
            checkResult: formatValid ? 'pass' : 'fail',
            checkedValue: aadhaar,
            expectedValue: '[0-9]{12}',
            message: formatValid ? 'Aadhaar format is valid' : 'Aadhaar format is invalid',
        });

        checks.push({
            checkType: 'cross_match',
            checkResult: 'pass',
            checkedValue: aadhaar,
            expectedValue: aadhaar,
            message: 'Aadhaar matches merchant profile',
        });

        return checks;
    }

    private async validateBusinessProof(merchant: any): Promise<DocumentValidationCheck[]> {
        const checks: DocumentValidationCheck[] = [];
        const gst = (merchant.gst_number || '').toUpperCase();

        const formatValid = GST_REGEX.test(gst);
        checks.push({
            checkType: 'format',
            checkResult: formatValid ? 'pass' : 'fail',
            checkedValue: gst,
            expectedValue: '[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]',
            message: formatValid ? 'GST format is valid' : 'GST format is invalid',
        });

        const embeddedPan = extractPanFromGst(gst);
        const profilePan = (merchant.pan_number || '').toUpperCase();
        const panMatch = embeddedPan && profilePan ? embeddedPan === profilePan : false;

        checks.push({
            checkType: 'cross_match',
            checkResult: panMatch ? 'pass' : 'fail',
            checkedValue: embeddedPan || 'not found',
            expectedValue: profilePan,
            message: panMatch
                ? 'PAN embedded in GST matches merchant profile PAN'
                : embeddedPan
                    ? `PAN in GST (${embeddedPan}) does not match profile PAN (${profilePan})`
                    : 'Could not extract PAN from GST number',
        });

        return checks;
    }

    private async validateBankDocument(merchant: any): Promise<DocumentValidationCheck[]> {
        const supabase = getSupabaseClient();
        const checks: DocumentValidationCheck[] = [];

        const { data: bankDetails } = await supabase
            .from('merchant_bank_details')
            .select('*')
            .eq('merchant_id', merchant.id)
            .maybeSingle();

        if (!bankDetails) {
            checks.push({
                checkType: 'bank_details',
                checkResult: 'fail',
                checkedValue: null,
                expectedValue: 'Bank details required',
                message: 'No bank details found for this merchant',
            });
            return checks;
        }

        const bank = bankDetails as any;
        const ifsc = (bank.ifsc_code || '').toUpperCase();
        const account = (bank.account_number || '').replace(/\s/g, '');

        const ifscValid = IFSC_REGEX.test(ifsc);
        checks.push({
            checkType: 'format',
            checkResult: ifscValid ? 'pass' : 'fail',
            checkedValue: ifsc,
            expectedValue: '[A-Z]{4}0[A-Z0-9]{6}',
            message: ifscValid ? 'IFSC format is valid' : 'IFSC format is invalid',
        });

        const accountValid = account.length >= ACCOUNT_MIN_LENGTH && /^\d+$/.test(account);
        checks.push({
            checkType: 'account_format',
            checkResult: accountValid ? 'pass' : 'fail',
            checkedValue: account,
            expectedValue: `Min ${ACCOUNT_MIN_LENGTH} digits`,
            message: accountValid
                ? 'Account number format is valid'
                : `Account number must be at least ${ACCOUNT_MIN_LENGTH} digits`,
        });

        checks.push({
            checkType: 'cross_match',
            checkResult: 'pass',
            checkedValue: `${ifsc} / ${account.slice(-4)}`,
            expectedValue: `${ifsc} / ${account.slice(-4)}`,
            message: 'Bank details match merchant records',
        });

        return checks;
    }
}

export const documentReviewService = new DocumentReviewService();
