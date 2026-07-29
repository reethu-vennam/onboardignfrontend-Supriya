// src/controllers/webhookController.ts
import { Request, Response, NextFunction } from 'express';
import { getAdminClient } from '../routes/supabase';
import { merchantService } from '../services/merchantService';
import { notificationService } from '../services/notifications';
import { logger } from '../utils/logger';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { MerchantProfile, OnboardingStatus } from '../types/merchant';

interface BankWebhookPayload {
    applicationId: string;
    merchantId: string;
    status: 'approved' | 'rejected';
    reason?: string;
    accountDetails?: {
        accountNumber: string;
        ifsc: string;
        bankName: string;
    };
    timestamp: string;
}

export class WebhookController {
    /**
     * Handle bank webhook for approval/rejection
     */
    async handleBankWebhook(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const payload: BankWebhookPayload = req.body;

            logger.info('Bank webhook received', {
                applicationId: payload.applicationId,
                merchantId: payload.merchantId,
                status: payload.status
            });

            // Get merchant
            const merchant = await merchantService.getMerchantById(payload.merchantId);

            // Verify application ID matches
            if (merchant.bankApplicationId !== payload.applicationId) {
                throw new BadRequestError(
                    'Application ID mismatch',
                    'INVALID_APPLICATION_ID'
                );
            }

            const oldStatus = merchant.onboarding_status as OnboardingStatus;
            let newStatus: OnboardingStatus;
            let reason: string | undefined;

            if (payload.status === 'approved') {
                newStatus = 'approved';

                // Update merchant with bank account details
                await merchantService.updateStatus(
                    payload.merchantId,
                    newStatus,
                    undefined,
                    {
                        bankResponse: {
                            approved: true,
                            accountDetails: payload.accountDetails,
                            approvedAt: payload.timestamp
                        }
                    }
                );

                logger.business(
                    'bank_approval_received',
                    payload.merchantId,
                    'merchant',
                    {
                        applicationId: payload.applicationId
                    }
                );
            } else {
                newStatus = 'rejected';
                reason = payload.reason || 'Bank declined the application';

                await merchantService.updateStatus(
                    payload.merchantId,
                    newStatus,
                    reason,
                    {
                        bankResponse: {
                            approved: false,
                            reason: payload.reason,
                            rejectedAt: payload.timestamp
                        }
                    }
                );

                logger.business(
                    'bank_rejection_received',
                    payload.merchantId,
                    'merchant',
                    {
                        applicationId: payload.applicationId,
                        reason: payload.reason
                    }
                );
            }

            // Get updated merchant
            const updatedMerchant = await merchantService.getMerchantById(payload.merchantId);

            // Send notification to merchant
            await notificationService.notifyMerchantStatusChange(
                updatedMerchant,
                oldStatus,
                newStatus
            );

            // Respond to webhook
            res.json({
                success: true,
                message: 'Webhook processed successfully',
                merchantId: payload.merchantId,
                status: newStatus
            });
        } catch (error) {
            logger.error('Bank webhook processing failed', {
                error: error instanceof Error ? error.message : String(error),
                payload: req.body
            } as any);
            next(error);
        }
    }

    /**
     * Test webhook endpoint (development only)
     */
    async testWebhook(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const { merchantId, status, reason } = req.body;

            if (!merchantId || !status) {
                throw new BadRequestError(
                    'merchantId and status are required',
                    'MISSING_REQUIRED_FIELDS'
                );
            }

            const merchant = await merchantService.getMerchantById(merchantId);

            const testPayload: BankWebhookPayload = {
                applicationId: merchant.bankApplicationId || 'test-app-id',
                merchantId,
                status: status as 'approved' | 'rejected',
                reason: reason || undefined,
                accountDetails: status === 'approved' ? {
                    accountNumber: '1234567890',
                    ifsc: 'TEST0001234',
                    bankName: 'Test Bank'
                } : undefined,
                timestamp: new Date().toISOString()
            };

            // Process as webhook
            await this.handleBankWebhook(
                { ...req, body: testPayload } as Request,
                res,
                next
            );
        } catch (error) {
            next(error);
        }
    }

    /**
     * Handle transaction webhook from payment system
     * POST /api/webhooks/transaction
     *
     * Expected payload:
     * {
     *   merchant_id: string,          // merchant_profiles.id
     *   transaction_id: string,       // unique transaction reference
     *   amount: number,
     *   currency?: string,            // default INR
     *   status: 'success' | 'pending' | 'failed' | 'cancelled',
     *   payment_method?: string,      // UPI, Card, Netbanking, etc.
     *   customer_name?: string,
     *   customer_email?: string,
     *   customer_mobile?: string,
     *   metadata?: object,
     *   created_at?: string           // ISO timestamp, defaults to now
     * }
     */
    async handleTransactionWebhook(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const {
                merchant_id,
                transaction_id,
                amount,
                currency = 'INR',
                status,
                payment_method,
                customer_name,
                customer_email,
                customer_mobile,
                metadata,
                created_at,
            } = req.body;

            if (!merchant_id || !transaction_id || amount == null || !status) {
                throw new BadRequestError(
                    'merchant_id, transaction_id, amount, and status are required',
                    'MISSING_FIELDS'
                );
            }

            const validStatuses = ['success', 'pending', 'failed', 'cancelled', 'completed'];
            if (!validStatuses.includes(status)) {
                throw new BadRequestError(
                    `Invalid status. Allowed: ${validStatuses.join(', ')}`,
                    'INVALID_STATUS'
                );
            }

            const admin = getAdminClient();

            // Verify merchant exists
            const { data: merchant, error: merchantError } = await admin
                .from('merchant_profiles')
                .select('id, distributor_id, full_name, email')
                .eq('id', merchant_id)
                .maybeSingle();

            if (merchantError || !merchant) {
                throw new NotFoundError('Merchant not found', 'MERCHANT_NOT_FOUND');
            }

            // Check for duplicate transaction_id
            const { data: existingTx } = await admin
                .from('transactions')
                .select('id')
                .eq('txn_id', transaction_id)
                .maybeSingle();

            if (existingTx) {
                logger.warn('Duplicate transaction webhook ignored', { transaction_id });
                res.json({ success: true, message: 'Transaction already exists', duplicate: true });
                return;
            }

            // Insert transaction — use ONLY columns confirmed in the table
            const txPayload: Record<string, any> = {
                merchant_id,
                txn_id: transaction_id,
                amount: parseFloat(String(amount)),
                status,
                currency: currency || 'INR',
            };
            if (payment_method) txPayload.payment_method = payment_method;
            if (metadata) txPayload.metadata = JSON.stringify(metadata);

            const { data: newTx, error: txError } = await admin
                .from('transactions')
                .insert(txPayload)
                .select()
                .single();

            if (txError) throw new Error(`Failed to insert transaction: ${txError.message}`);

            logger.info('Transaction recorded via webhook', {
                transaction_id,
                merchant_id,
                amount,
                status,
            });

            res.status(201).json({
                success: true,
                message: 'Transaction recorded',
                transaction_id: newTx.id,
            });
        } catch (error) {
            logger.error('Transaction webhook failed', {
                error: error instanceof Error ? error.message : String(error),
                payload: req.body,
            } as any);
            next(error);
        }
    }

    /**
     * Test transaction webhook (development only)
     * POST /api/webhooks/transaction/test
     *
     * Generates a sample transaction for a given merchant
     */
    async testTransactionWebhook(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const { merchant_id, amount, status, payment_method } = req.body;

            if (!merchant_id) {
                throw new BadRequestError('merchant_id is required', 'MISSING_FIELDS');
            }

            const admin = getAdminClient();
            const { data: merchant } = await admin
                .from('merchant_profiles')
                .select('id')
                .eq('id', merchant_id)
                .maybeSingle();

            if (!merchant) {
                throw new NotFoundError('Merchant not found', 'MERCHANT_NOT_FOUND');
            }

            const testPayload = {
                merchant_id,
                transaction_id: `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
                amount: amount || Math.floor(Math.random() * 10000) + 100,
                currency: 'INR',
                status: status || ['success', 'pending', 'failed'][Math.floor(Math.random() * 3)],
                payment_method: payment_method || ['UPI', 'Card', 'Netbanking'][Math.floor(Math.random() * 3)],
                customer_name: 'Test Customer',
                created_at: new Date().toISOString(),
            };

            await this.handleTransactionWebhook(
                { ...req, body: testPayload } as Request,
                res,
                next
            );
        } catch (error) {
            next(error);
        }
    }
}

export const webhookController = new WebhookController();
export default webhookController;