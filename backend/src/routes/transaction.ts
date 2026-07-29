import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { getSupabaseClient } from './supabase';
import { logger } from '../utils/logger';
import {
    extractPaymentTransactionId,
    storeMerchantTransactionId,
    storeTxnDetailsByTransactionId
} from '../services/paymentTransactionService';

const router = Router();

router.post(
    '/update',
    authenticate,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const transactionId =
                extractPaymentTransactionId(req.body) ||
                (typeof req.body?.transactionId === 'string' ? req.body.transactionId : null) ||
                (typeof req.body?.transaction_id === 'string' ? req.body.transaction_id : null);

            const merchantId = req.user?.merchantId;

            if (!transactionId) {
                res.status(400).json({
                    success: false,
                    message: 'Transaction ID is required'
                });
                return;
            }

            if (!merchantId) {
                res.status(401).json({
                    success: false,
                    message: 'Merchant ID not found'
                });
                return;
            }

            logger.info('💳 Updating transaction id', { merchantId, transactionId });

            const result = await storeMerchantTransactionId(merchantId, transactionId);

            if (result.outcome === 'not_found') {
                res.status(404).json({
                    success: false,
                    message: 'Merchant profile not found'
                });
                return;
            }

            res.json({
                success: true,
                message:
                    result.outcome === 'stored'
                        ? 'Transaction ID stored successfully'
                        : 'Transaction ID already stored',
                data: {
                    merchantId: result.merchantId,
                    transactionId: result.transactionId,
                    outcome: result.outcome
                }
            });

        } catch (error) {
            const errorToLog = error instanceof Error ? error : new Error('Error updating transaction id');
            logger.error('Transaction update error', errorToLog);
            next(error);
        }
    }
);

router.post(
    '/store-transaction-id',
    authenticate,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const transactionId =
                extractPaymentTransactionId(req.body) ||
                (typeof req.body?.transactionId === 'string' ? req.body.transactionId : null) ||
                (typeof req.body?.transaction_id === 'string' ? req.body.transaction_id : null);

            const merchantId = req.user?.merchantId;

            if (!transactionId) {
                res.status(400).json({
                    success: false,
                    message: 'transaction_id is required'
                });
                return;
            }

            if (!merchantId) {
                res.status(401).json({
                    success: false,
                    message: 'Merchant ID not found'
                });
                return;
            }

            const result = await storeMerchantTransactionId(merchantId, transactionId);

            if (result.outcome === 'not_found') {
                res.status(404).json({
                    success: false,
                    message: 'Merchant profile not found'
                });
                return;
            }

            res.status(200).json({
                success: true,
                message:
                    result.outcome === 'stored'
                        ? 'Transaction ID stored successfully'
                        : 'Transaction ID already stored',
                data: result
            });
        } catch (error) {
            const errorToLog = error instanceof Error ? error : new Error('Error storing transaction id');
            logger.error('Transaction store error', errorToLog);
            next(error);
        }
    }
);

router.post(
    '/store-txn-details',
    authenticate,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const transactionId = extractPaymentTransactionId(req.body);

            if (!transactionId) {
                res.status(400).json({
                    success: false,
                    message: 'transaction_id is required in the decrypt-token response'
                });
                return;
            }

            const result = await storeTxnDetailsByTransactionId(transactionId, req.body);

            if (result.outcome === 'not_found') {
                res.status(404).json({
                    success: false,
                    message: 'Merchant profile not found for the provided transaction id'
                });
                return;
            }

            res.status(200).json({
                success: true,
                message:
                    result.outcome === 'stored'
                        ? 'Transaction details stored successfully'
                        : 'Transaction details already stored',
                data: result
            });
        } catch (error) {
            const errorToLog = error instanceof Error ? error : new Error('Error storing txn details');
            logger.error('Txn details store error', errorToLog);
            next(error);
        }
    }
);

router.post(
    '/details',
    authenticate,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const merchantId = req.user?.merchantId;
            const transactionId =
                extractPaymentTransactionId(req.body) ||
                (typeof req.body?.transactionId === 'string' ? req.body.transactionId : null) ||
                (typeof req.body?.transaction_id === 'string' ? req.body.transaction_id : null);

            if (!merchantId) {
                res.status(401).json({
                    success: false,
                    message: 'Merchant ID not found'
                });
                return;
            }

            if (!transactionId) {
                res.status(400).json({
                    success: false,
                    message: 'transaction_id is required'
                });
                return;
            }

            const supabase = getSupabaseClient();

            const { data, error } = await supabase
                .from('merchant_profiles')
                .select('id, "Transaction Id", txn_details')
                .eq('id', merchantId)
                .eq('Transaction Id', transactionId)
                .maybeSingle();

            if (error) {
                throw error;
            }

            if (!data) {
                res.status(404).json({
                    success: false,
                    message: 'Merchant profile not found for the provided transaction id'
                });
                return;
            }

            res.status(200).json({
                success: true,
                data: {
                    merchantId: data.id,
                    transactionId: data['Transaction Id'],
                    txnDetails: data.txn_details
                }
            });
        } catch (error) {
            const errorToLog = error instanceof Error ? error : new Error('Error fetching txn details');
            logger.error('Txn details fetch error', errorToLog);
            next(error);
        }
    }
);

// ============================================
// Get Transaction ID
// ============================================

router.get(
    '/get',
    authenticate,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const merchantId = req.user?.merchantId;

            if (!merchantId) {
                res.status(401).json({
                    success: false,
                    message: 'Merchant ID not found'
                });
                return;
            }

            const supabase = getSupabaseClient();

            const { data, error } = await supabase
                .from('merchant_profiles')
                .select('"Transaction Id"')
                .eq('id', merchantId)
                .single();

            if (error) throw error;

            res.json({
                success: true,
                data: {
                    transactionId: data?.['Transaction Id'] || null
                }
            });

        } catch (error) {
            const errorToLog = error instanceof Error ? error : new Error('Error fetching transaction ID');
            logger.error('Transaction fetch error:', errorToLog);
            next(error);
        }
    }
);

export default router;