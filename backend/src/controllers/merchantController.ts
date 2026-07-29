// src/controllers/merchantController.ts
import { Request, Response, NextFunction } from 'express';
import { getSupabaseClient } from '../routes/supabase';
import { merchantService } from '../services/merchantService';
import { validationService } from '../services/validationService';
import { bankApiService } from '../services/bankApiService';
import { transbankService } from '../services/transbankService';
import { notificationService } from '../services/notifications';
import { MerchantSubmission, OnboardingStatus } from '../types/merchant';
import { logger } from '../utils/logger';
import { BadRequestError, NotFoundError } from '../utils/errors';

export class MerchantController {
    /**
     * Create or update merchant profile (draft)
     */
    async saveProfile(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            if (!req.user) {
                throw new BadRequestError('User not authenticated', 'UNAUTHORIZED');
            }

            const data: MerchantSubmission = req.body;
            const user_id = req.user.user_id;

            // Check if merchant already exists
            let merchant = await merchantService.getMerchantByUserId(user_id);

            if (merchant) {
                // Update existing
                merchant = await merchantService.updateMerchant(merchant.id, data);
            } else {
                // Create new
                merchant = await merchantService.createMerchant(user_id, data);
            }

            res.json({
                success: true,
                data: merchant,
                message: 'Profile saved successfully'
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Submit merchant profile for validation
     */
    async submitProfile(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            if (!req.user) {
                throw new BadRequestError('User not authenticated', 'UNAUTHORIZED');
            }

            const user_id = req.user.user_id;
            const merchant = await merchantService.getMerchantByUserId(user_id);

            if (!merchant) {
                throw new NotFoundError('Merchant profile not found', 'MERCHANT_NOT_FOUND');
            }

            // Validate profile
            await validationService.validateMerchantProfile(merchant);

            // Update status to submitted
            const updated = await merchantService.updateStatus(
                merchant.id,
                'submitted', undefined
            );

            // Send notification to admin
            await notificationService.notifyAdminNewSubmission(updated);

            // Send confirmation to merchant
            await notificationService.notifyMerchantStatusChange(
                updated,
                'draft',
                'submitted'
            );

            logger.business(
                'merchant_submitted',
                merchant.id,
                'merchant',
                { user_id }
            );

            res.json({
                success: true,
                data: updated,
                message: 'Application submitted successfully'
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get merchant profile
     */
    async getProfile(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            if (!req.user) {
                throw new BadRequestError('User not authenticated', 'UNAUTHORIZED');
            }

            const user_id = req.user.user_id;
            const merchant = await merchantService.getMerchantByUserId(user_id);

            if (!merchant) {
                res.json({
                    success: true,
                    data: null,
                    message: 'No merchant profile found'
                });
                return;
            }

            // NEW: Fetch KYC data as well
            const supabase = getSupabaseClient();
            const { data: kyc, error: kycError } = await supabase
                .from('merchant_kyc')
                .select('*')
                .eq('merchant_id', merchant.id)
                .single();

            if (kycError && kycError.code !== 'PGRST116') {
                // PGRST116 = no rows found (which is ok for new merchants)
                logger.warn('Error fetching KYC data:', { error: 'Error fetching KYC data:' });
            }

            res.json({
                success: true,
                data: {
                    merchant,
                    kyc: kyc || null
                }
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get merchant by ID (admin)
     */
    async getMerchantById(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const { merchantId } = req.params;
            const merchant = await merchantService.getMerchantById(merchantId);

            res.json({
                success: true,
                data: merchant
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get all merchants (admin)
     */
    async getAllMerchants(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const status = req.query.status as OnboardingStatus | undefined;
            const merchants = await merchantService.getAllMerchants(status);

            res.json({
                success: true,
                data: merchants,
                count: merchants.length
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Validate merchant (admin)
     */
    async validateMerchant(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const { merchantId } = req.params;
            const merchant = await merchantService.getMerchantById(merchantId);

            if (merchant.onboarding_status !== 'submitted') {
                throw new BadRequestError(
                    'Merchant must be in submitted status',
                    'INVALID_STATUS'
                );
            }

            // Perform validation
            await validationService.validateMerchantProfile(merchant);

            // Update status to validating
            const updated = await merchantService.updateStatus(
                merchantId,
                'validating',undefined
            );

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

            res.json({
                success: true,
                data: updated,
                message: 'Merchant validated successfully'
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Submit to bank (admin)
     */
    async submitToBank(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
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
            const upiVpa = 'etc'; // Placeholder - Get the actual VPA
            const upiQrString = '@ybl'; 
            const bankResponse = await bankApiService.submitMerchantApplication(merchant,upiVpa,upiQrString);

            // Update merchant with bank response
            const updated = await merchantService.updateStatus(
                merchantId,
                'pending_bank_approval',
                undefined,
                {
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

            res.json({
                success: true,
                data: {
                    merchant: updated,
                    bankResponse
                },
                message: 'Application submitted to bank successfully'
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Approve merchant manually (admin override)
     */
    async approveMerchant(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
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

            res.json({
                success: true,
                data: updated,
                message: 'Merchant approved successfully'
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Reject merchant (admin)
     */
    async rejectMerchant(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
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

            res.json({
                success: true,
                data: updated,
                message: 'Merchant rejected'
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Delete merchant profile (admin)
     */
    async deleteMerchant(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const { merchantId } = req.params;

            await merchantService.deleteMerchant(merchantId);

            logger.business(
                'merchant_deleted',
                merchantId,
                'merchant',
                { adminuser_id: req.user?.user_id }
            );

            res.json({
                success: true,
                message: 'Merchant profile deleted successfully'
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Validate bank account via Transbank (Private endpoint - merchant user only)
     * Backend handles all Transbank communication - No sensitive data in logs
     */
    async validateBankAccount(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            if (!req.user) {
                throw new BadRequestError('User not authenticated', 'UNAUTHORIZED');
            }

            const { accountHolderName, ifscCode, accountNumber } = req.body;

            // Validate input
            if (!accountHolderName || !ifscCode || !accountNumber) {
                throw new BadRequestError(
                    'Missing required fields: accountHolderName, ifscCode, accountNumber',
                    'MISSING_FIELDS'
                );
            }

            logger.info('🏦 Bank account validation request received', {
                user_id: req.user.user_id,
            });

            // Call Transbank service (backend)
            const result = await transbankService.validateBankAccount({
                accountHolderName,
                ifscCode,
                accountNumber,
            });

            if (result.isValid) {
                logger.info('✅ Bank account validation successful');
                res.json({
                    success: true,
                    data: {
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
                    }
                });
            } else {
                logger.warn('⚠️ Bank account validation failed');
                res.status(200).json({
                    success: false,
                    data: {
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
                    }
                });
            }
        } catch (error) {
            logger.error('Bank account validation failed', error instanceof Error ? error : undefined);
            next(error);
        }
    }
}

export const merchantController = new MerchantController();