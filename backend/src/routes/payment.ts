import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { extractPaymentTransactionId, storeTxnDetailsByTransactionId } from '../services/paymentTransactionService';

const router = Router();

router.post(
    '/sabbpe/callback',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const transactionId = extractPaymentTransactionId(req.body);

            if (!transactionId) {
                res.status(400).json({
                    success: false,
                    message: 'Transaction ID is required in the callback payload'
                });
                return;
            }

            const result = await storeTxnDetailsByTransactionId(transactionId, req.body);

            res.status(200).json({
                success: true,
                message: 'Callback acknowledged',
                data: {
                    transactionId: result.transactionId,
                    outcome: result.outcome
                }
            });
        } catch (error) {
            const errorToLog = error instanceof Error ? error : new Error('Error processing SabbPe callback');
            logger.error('SabbPe callback error', errorToLog);
            next(error);
        }
    }
);

export default router;