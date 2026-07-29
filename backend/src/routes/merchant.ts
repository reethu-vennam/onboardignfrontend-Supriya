// src/routes/merchant.ts
import { Router } from 'express';
import { merchantController } from '../controllers/merchantController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Merchant routes (require merchant role)
router.post(
    '/profile',
    authenticate,
    authorize('merchant'),
    (req, res, next) => merchantController.saveProfile(req, res, next)
);

router.post(
    '/validate-bank-account',
    authenticate,
    authorize('merchant', 'distributor', 'employee'),
    (req, res, next) => merchantController.validateBankAccount(req, res, next)
);

router.post(
    '/submit',
    authenticate,
    authorize('merchant'),
    (req, res, next) => merchantController.submitProfile(req, res, next)
);

router.get(
    '/profile',
    authenticate,
    authorize('merchant'),
    (req, res, next) => merchantController.getProfile(req, res, next)
);

router.post(
    '/integration-cost',
    authenticate,
    authorize('merchant'),
    async (req, res, next) => {
        try {
            const { getSupabaseClient } = await import('./supabase');
            const supabase = getSupabaseClient();

            const requestedMerchantId = req.user?.merchantId || null;
            const requestedUserId = req.user?.user_id || null;

            if (!requestedMerchantId && !requestedUserId) {
                res.status(400).json({
                    success: false,
                    message: 'Authenticated merchant context is required'
                });
                return;
            }

            let query = supabase
                .from('merchant_profiles')
                .select('id, user_id, total_integration_cost');

            if (requestedMerchantId && requestedMerchantId !== requestedUserId) {
                query = query.eq('id', requestedMerchantId);
            } else if (requestedUserId) {
                query = query.eq('user_id', requestedUserId);
            }

            let { data, error } = await query.maybeSingle();

            if (!data && requestedUserId) {
                const fallback = await supabase
                    .from('merchant_profiles')
                    .select('id, user_id, total_integration_cost')
                    .eq('user_id', requestedUserId)
                    .maybeSingle();

                data = fallback.data;
                error = fallback.error;
            }

            if (error) {
                throw error;
            }

            if (!data) {
                res.status(404).json({
                    success: false,
                    message: 'Merchant profile not found',
                    searched: {
                        merchant_id: requestedMerchantId,
                        user_id: requestedUserId,
                        auth_user_id: req.user?.user_id || null
                    }
                });
                return;
            }

            res.json({
                success: true,
                data: {
                    merchantId: data.id,
                    user_id: data.user_id,
                    total_integration_cost: data.total_integration_cost ?? 0
                }
            });
        } catch (error) {
            next(error);
        }
    }
);

// Temporary debug route: returns the merchant_profiles row the server sees for the authenticated user


// Admin routes
router.get(
    '/all',
    authenticate,
    authorize('admin'),
    (req, res, next) => merchantController.getAllMerchants(req, res, next)
);

router.get(
    '/:merchantId',
    authenticate,
    authorize('admin'),
    (req, res, next) => merchantController.getMerchantById(req, res, next)
);

router.post(
    '/:merchantId/validate',
    authenticate,
    authorize('admin'),
    (req, res, next) => merchantController.validateMerchant(req, res, next)
);

router.post(
    '/:merchantId/submit-to-bank',
    authenticate,
    authorize('admin'),
    (req, res, next) => merchantController.submitToBank(req, res, next)
);

router.post(
    '/:merchantId/approve',
    authenticate,
    authorize('admin'),
    (req, res, next) => merchantController.approveMerchant(req, res, next)
);

router.post(
    '/:merchantId/reject',
    authenticate,
    authorize('admin'),
    (req, res, next) => merchantController.rejectMerchant(req, res, next)
);

router.delete(
    '/:merchantId',
    authenticate,
    authorize('admin'),
    (req, res, next) => merchantController.deleteMerchant(req, res, next)
);

export default router;
// Merchant restart after bank_rejected
router.post(
    '/restart-onboarding',
    authenticate,
    authorize('merchant'),
    async (req, res, next) => {
        try {
            const { getSupabaseClient } = await import('./supabase');
            const supabase = getSupabaseClient();
            const userId = req.user?.user_id;

            // Get merchant profile
            const { data: profile, error: fetchError } = await supabase
                .from('merchant_profiles')
                .select('id, onboarding_status')
                .eq('user_id', userId)
                .single();

            if (fetchError || !profile) {
                res.status(404).json({ success: false, message: 'Merchant not found' });
                return;
            }

            // Only allow restart from bank_rejected
            if (profile.onboarding_status !== 'bank_rejected') {
                res.status(400).json({
                    success: false,
                    message: `Cannot restart from status: ${profile.onboarding_status}`
                });
                return;
            }

            // Reset merchant_profiles to pending
            const { error: profileError } = await supabase
                .from('merchant_profiles')
                .update({
                    onboarding_status: 'pending',
                    rejection_reason: null,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId);

            if (profileError) throw profileError;

            // Reset merchant_kyc for fresh KYC
            const { error: kycError } = await supabase
                .from('merchant_kyc')
                .update({
                    kyc_status: 'pending',
                    video_kyc_completed: false,
                    verified_at: null,
                    reviewed_by_admin: null,
                    review_notes: null,
                    updated_at: new Date().toISOString()
                })
                .eq('merchant_id', profile.id);

            if (kycError) {
                console.warn('KYC reset warning:', kycError.message);
            }

            res.json({
                success: true,
                message: 'Onboarding restarted successfully. Please complete your KYC again.'
            });
        } catch (error) {
            next(error);
        }
    }
);

// Accept PG commercials
router.post(
    '/accept-pg-commercials',
    authenticate,
    authorize('merchant'),
    async (req, res, next) => {
        try {
            const { getSupabaseClient } = await import('./supabase');
            const supabase = getSupabaseClient();
            const userId = req.user?.user_id;

            const { error } = await supabase
                .from('merchant_profiles')
                .update({
                    has_pg_product: true,
                    commercials_accepted: true,
                    commercials_accepted_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId);

            if (error) throw error;

            res.json({ success: true, message: 'PG commercials accepted' });
        } catch (error) {
            next(error);
        }
    }
);

// Submit CPV video
router.post(
    '/submit-cpv',
    authenticate,
    authorize('merchant'),
    async (req, res, next) => {
        try {
            const { getSupabaseClient } = await import('./supabase');
            const supabase = getSupabaseClient();
            const userId = req.user?.user_id;
            const { cpv_video_path } = req.body;

            if (!cpv_video_path) {
                res.status(400).json({ success: false, message: 'cpv_video_path is required' });
                return;
            }

            const { error } = await supabase
                .from('merchant_profiles')
                .update({
                    cpv_video_path,
                    cpv_status: 'submitted',
                    cpv_submitted_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId);

            if (error) throw error;

            res.json({ success: true, message: 'CPV video submitted successfully' });
        } catch (error) {
            next(error);
        }
    }
);

// Sign PG Agreement
router.post(
    '/sign-pg-agreement',
    authenticate,
    authorize('merchant'),
    async (req, res, next) => {
        try {
            const { getSupabaseClient } = await import('./supabase');
            const supabase = getSupabaseClient();
            const userId = req.user?.user_id;
            const { signature } = req.body;

            if (!signature) {
                res.status(400).json({ success: false, message: 'Signature required' });
                return;
            }

            const { data: profile, error: fetchError } = await supabase
                .from('merchant_profiles')
                .select('id, onboarding_status')
                .eq('user_id', userId)
                .single();

            if (fetchError || !profile) {
                res.status(404).json({ success: false, message: 'Merchant not found' });
                return;
            }

            if (profile.onboarding_status !== 'agreement_pending') {
                res.status(400).json({
                    success: false,
                    message: `Cannot sign agreement from status: ${profile.onboarding_status}`
                });
                return;
            }

            const { error } = await supabase
                .from('merchant_profiles')
                .update({
                    onboarding_status: 'agreement_signed',
                    pg_agreement_signed: true,
                    pg_agreement_signed_at: new Date().toISOString(),
                    pg_agreement_signature: signature,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId);

            if (error) throw error;

            res.json({ success: true, message: 'Agreement signed successfully' });
        } catch (error) {
            next(error);
        }
    }
);

// Merchant confirms agreement signed on DocuSeal
router.post(
    '/confirm-agreement-signed',
    authenticate,
    authorize('merchant'),
    async (req, res, next) => {
        try {
            const { getSupabaseClient } = await import('./supabase');
            const supabase = getSupabaseClient();
            const userId = req.user?.user_id;

            const { data: profile } = await supabase
                .from('merchant_profiles')
                .select('id, onboarding_status')
                .eq('user_id', userId)
                .maybeSingle();

            if (!profile) {
                res.status(404).json({ success: false, message: 'Merchant not found' });
                return;
            }

            if (profile.onboarding_status !== 'agreement_pending') {
                res.status(400).json({
                    success: false,
                    message: `Cannot confirm signing from status: ${profile.onboarding_status}`
                });
                return;
            }

            const { error } = await supabase
                .from('merchant_profiles')
                .update({
                    onboarding_status: 'agreement_signed',
                    pg_agreement_signed: true,
                    pg_agreement_signed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId);

            if (error) throw error;

            res.json({ success: true, message: 'Agreement signing confirmed' });
        } catch (error) {
            next(error);
        }
    }
);

// Save split payment configuration
import { getSupabaseClient } from './supabase';
import { Request, Response, NextFunction } from 'express';

router.post(
    '/save-split-config',
    authenticate,
    authorize('merchant', 'distributor', 'employee'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const userId = req.user?.user_id;
            const { splitAccounts } = req.body;

            if (!userId) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }

            if (!Array.isArray(splitAccounts)) {
                res.status(400).json({ success: false, message: 'splitAccounts must be an array' });
                return;
            }

            const supabase = getSupabaseClient();
            const { error } = await supabase
                .from('merchant_profiles')
                .update({
                    split_payment_config: JSON.stringify(splitAccounts),
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId);

            if (error) throw error;

            res.json({ success: true, message: 'Split payment configuration saved' });
        } catch (error) {
            next(error);
        }
    }
);
