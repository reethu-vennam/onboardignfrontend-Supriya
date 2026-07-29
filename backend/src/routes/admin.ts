// src/routes/admin.ts
import { Router, Request, Response, NextFunction } from 'express';
import { merchantService } from '../services/merchantService';
import { validationService } from '../services/validationService';
import { bankApiService } from '../services/bankApiService';
import { notificationService } from '../services/notifications';
import { documentReviewService } from '../services/documentReviewService';
import { authenticate, authorize } from '../middleware/auth';
import { OnboardingStatus } from '../types/merchant';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';
import { getAdminClient } from './supabase';

const router = Router();

interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    message?: string;
    count?: number;
}

// Get all merchants with optional status filter
router.get(
    '/merchants',
    authenticate,
    authorize('admin'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const status = req.query.status as OnboardingStatus | undefined;
            const merchants = await merchantService.getAllMerchants(status);

            const response: ApiResponse = {
                success: true,
                data: merchants,
                count: merchants.length
            };

            res.json(response);
        } catch (error) {
            next(error);
        }
    }
);

// Get specific merchant details
router.get(
    '/merchants/:merchantId',
    authenticate,
    authorize('admin'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { merchantId } = req.params;
            const merchant = await merchantService.getMerchantById(merchantId);

            const response: ApiResponse = {
                success: true,
                data: merchant
            };

            res.json(response);
        } catch (error) {
            next(error);
        }
    }
);

// Validate merchant application
router.post(
    '/merchants/:merchantId/validate',
    authenticate,
    authorize('admin'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { merchantId } = req.params;
            const merchant = await merchantService.getMerchantById(merchantId);

            if (merchant.onboarding_status !== 'submitted') {
                throw new BadRequestError(
                    'Merchant must be in submitted status',
                    'INVALID_STATUS'
                );
            }

            // Perform validation using validation service
            await validationService.validateMerchantProfile(merchant);

            // Update status to validating
            const updated = await merchantService.updateStatus(merchantId, 'validating',undefined);

            // Send notification
            await notificationService.notifyMerchantStatusChange(
                updated,
                'submitted',
                'validating'
            );

            logger.business(
                'merchant_validated',
                merchantId,
                'merchant',
                { adminuser_id: req.user?.user_id }
            );

            const response: ApiResponse = {
                success: true,
                data: updated,
                message: 'Merchant validated successfully'
            };

            res.json(response);
        } catch (error) {
            next(error);
        }
    }
);

// Submit to bank
router.post(
    '/merchants/:merchantId/submit-to-bank',
    authenticate,
    authorize('admin'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { merchantId } = req.params;
            const merchant = await merchantService.getMerchantById(merchantId);

            if (merchant.onboarding_status !== 'validating') {
                throw new BadRequestError(
                    'Merchant must be validated first',
                    'INVALID_STATUS'
                );
            }

            // Submit to bank API
            const bankResponse = await bankApiService.submitMerchantApplication(merchant,'etc','@ybl');

            // Update merchant with bank response
            const updated = await merchantService.updateStatus(
                merchantId,
                'pending_bank_approval',
                undefined,
                {
                    ...merchant,
                    bankApplicationId: bankResponse.applicationId,
                    bankResponse: {
                        success: bankResponse.success,
                        applicationId: bankResponse.applicationId,
                        message: bankResponse.message,
                        estimatedProcessingTime: bankResponse.estimatedProcessingTime
                    }
                }
            );

            // Send notification
            await notificationService.notifyMerchantStatusChange(
                updated,
                'validating',
                'pending_bank_approval'
            );

            logger.business(
                'merchant_submitted_to_bank',
                merchantId,
                'merchant',
                {
                    adminuser_id: req.user?.user_id,
                    bankApplicationId: bankResponse.applicationId
                }
            );

            const response: ApiResponse = {
                success: true,
                data: {
                    merchant: updated,
                    bankResponse
                },
                message: 'Application submitted to bank successfully'
            };

            res.json(response);
        } catch (error) {
            next(error);
        }
    }
);

// Approve merchant manually (admin override)
router.post(
    '/merchants/:merchantId/approve',
    authenticate,
    authorize('admin'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { merchantId } = req.params;
            const merchant = await merchantService.getMerchantById(merchantId);
            const oldStatus = merchant.onboarding_status as OnboardingStatus;

            const updated = await merchantService.updateStatus(
                merchantId,
                'approved',undefined
            );

            // Send notification
            await notificationService.notifyMerchantStatusChange(
                updated,
                oldStatus,
                'approved'
            );

            logger.business(
                'merchant_approved',
                merchantId,
                'merchant',
                {
                    adminuser_id: req.user?.user_id,
                    manualOverride: true
                }
            );

            const response: ApiResponse = {
                success: true,
                data: updated,
                message: 'Merchant approved successfully'
            };

            res.json(response);
        } catch (error) {
            next(error);
        }
    }
);

// Reject merchant
router.post(
    '/merchants/:merchantId/reject',
    authenticate,
    authorize('admin'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { merchantId } = req.params;
            const { reason } = req.body;

            if (!reason || typeof reason !== 'string') {
                throw new BadRequestError(
                    'Rejection reason is required',
                    'MISSING_REASON'
                );
            }

            const merchant = await merchantService.getMerchantById(merchantId);
            const oldStatus = merchant.onboarding_status as OnboardingStatus;

            const updated = await merchantService.updateStatus(
                merchantId,
                'rejected',
                reason
            );

            // Send notification
            await notificationService.notifyMerchantStatusChange(
                updated,
                oldStatus,
                'rejected'
            );

            logger.business(
                'merchant_rejected',
                merchantId,
                'merchant',
                {
                    adminuser_id: req.user?.user_id,
                    reason
                }
            );

            const response: ApiResponse = {
                success: true,
                data: updated,
                message: 'Merchant rejected'
            };

            res.json(response);
        } catch (error) {
            next(error);
        }
    }
);

// Delete merchant profile (admin)
router.post(
    '/merchants/:merchantId/delete',
    authenticate,
    authorize('admin'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { merchantId } = req.params;

            await merchantService.deleteMerchant(merchantId);

            logger.business(
                'merchant_deleted',
                merchantId,
                'merchant',
                { adminuser_id: req.user?.user_id }
            );

            const response: ApiResponse = {
                success: true,
                message: 'Merchant profile deleted successfully'
            };

            res.json(response);
        } catch (error) {
            next(error);
        }
    }
);

// ---------------------------------------------------------------------------
// Document Review & Score Card routes
// ---------------------------------------------------------------------------

router.get(
    '/document-review/merchants',
    authenticate,
    authorize('admin'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const merchants = await documentReviewService.getMerchantsForReview();
            res.json({ success: true, data: merchants, count: merchants.length });
        } catch (error) {
            next(error);
        }
    }
);

router.get(
    '/document-review/merchants/:merchantId/score',
    authenticate,
    authorize('admin'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { merchantId } = req.params;
            const score = await documentReviewService.getScore(merchantId);
            res.json({ success: true, data: score });
        } catch (error) {
            next(error);
        }
    }
);

router.post(
    '/document-review/documents/:docId/validate',
    authenticate,
    authorize('admin'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { docId } = req.params;
            const result = await documentReviewService.validateDocument(docId);
            res.json({ success: true, data: result, message: 'Document validation completed' });
        } catch (error) {
            next(error);
        }
    }
);

router.post(
    '/document-review/documents/:docId/approve',
    authenticate,
    authorize('admin'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { docId } = req.params;
            const { reason } = req.body;
            const staffUserId = req.user?.user_id || 'unknown';
            await documentReviewService.approveDocument(docId, staffUserId, reason);
            res.json({ success: true, message: 'Document approved' });
        } catch (error) {
            next(error);
        }
    }
);

router.post(
    '/document-review/documents/:docId/reject',
    authenticate,
    authorize('admin'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { docId } = req.params;
            const { reason } = req.body;
            const staffUserId = req.user?.user_id || 'unknown';
            await documentReviewService.rejectDocument(docId, staffUserId, reason);
            res.json({ success: true, message: 'Document rejected' });
        } catch (error) {
            next(error);
        }
    }
);

export default router;