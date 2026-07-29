// backend/src/routes/chargeback.ts
//
// Chargeback API routes.
// Provides endpoints for managing chargebacks, recovery, and audit history.

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';
import * as chargebackRecoveryService from '../services/chargebackRecovery';

const router = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUUID(value: string, field: string): void {
    if (!value || !UUID_REGEX.test(value)) {
        throw new BadRequestError(`Invalid ${field}: must be a valid UUID`, 'INVALID_UUID');
    }
}

function sendError(res: Response, status: number, code: string, message: string): void {
    res.status(status).json({ success: false, error: { code, message } });
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────

async function verifyAdmin(authHeader: string | undefined, res: Response): Promise<{ userId: string } | null> {
    if (!authHeader?.startsWith('Bearer ')) {
        sendError(res, 401, 'AUTHENTICATION_REQUIRED', 'Authentication required');
        return null;
    }
    const jwt = authHeader.replace('Bearer ', '');
    const { getSupabaseClient } = await import('./supabase');
    const supabaseClient = getSupabaseClient();
    const { data: { user }, error } = await supabaseClient.auth.getUser(jwt);
    if (error || !user) {
        sendError(res, 401, 'INVALID_SESSION', 'Invalid session');
        return null;
    }
    const { getAdminClient } = await import('./supabase');
    const adminClient = getAdminClient();
    const { data: roleData } = await adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
    if (roleData?.role !== 'admin') {
        sendError(res, 403, 'FORBIDDEN', 'Admin access required');
        return null;
    }
    return { userId: user.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chargeback/create
// Create a new chargeback (admin only)
// ─────────────────────────────────────────────────────────────────────────────

router.post(
    '/create',
    authenticate,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const caller = await verifyAdmin(req.headers.authorization, res);
            if (!caller) return;

            const { merchantId, amount, reason, currency = 'INR', metadata } = req.body;

            if (!merchantId || !amount || !reason) {
                throw new BadRequestError(
                    'merchantId, amount, and reason are required',
                    'MISSING_REQUIRED_FIELDS'
                );
            }

            validateUUID(merchantId, 'merchantId');

            if (typeof amount !== 'number' || amount <= 0) {
                throw new BadRequestError(
                    'Amount must be a positive number',
                    'INVALID_AMOUNT'
                );
            }

            if (!reason || reason.trim().length === 0) {
                throw new BadRequestError(
                    'Reason is required',
                    'MISSING_REASON'
                );
            }

            const chargeback = await chargebackRecoveryService.createChargeback({
                merchantId: merchantId as string,
                amount: amount as number,
                reason,
                currency,
                metadata,
                performedBy: caller.userId
            });

            res.json({
                success: true,
                data: chargeback,
                message: 'Chargeback created successfully'
            });
        } catch (error) {
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chargeback/summary
// Get chargeback summary statistics
// ─────────────────────────────────────────────────────────────────────────────

router.get(
    '/summary',
    authenticate,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const merchantId = req.query.merchant_id as string | undefined;
            if (merchantId) validateUUID(merchantId, 'merchant_id');
            const result = await chargebackRecoveryService.getChargebackSummary(merchantId);

            res.json({
                success: true,
                data: result,
                message: 'Chargeback summary retrieved'
            });
        } catch (error) {
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chargeback/distributor-recovery-summary
// Get distributor recovery balances and history
// ─────────────────────────────────────────────────────────────────────────────

router.get(
    '/distributor-recovery-summary',
    authenticate,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const distributorId = req.query.distributor_id as string | undefined;
            const result = await chargebackRecoveryService.getDistributorRecoverySummary(distributorId);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chargeback/history/:chargebackId
// Get audit trail for a specific chargeback
// ─────────────────────────────────────────────────────────────────────────────

router.get(
    '/history/:chargebackId',
    authenticate,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { chargebackId } = req.params;
            validateUUID(chargebackId, 'chargebackId');
            const page = parseInt(req.query.page as string) || 1;
            const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

            const result = await chargebackRecoveryService.getChargebackHistory(chargebackId, page, limit);

            res.json({
                success: true,
                data: result.data,
                total: result.total,
                page,
                limit,
                message: 'Chargeback history retrieved'
            });
        } catch (error) {
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chargeback/recover
// Recover a chargeback with cascading sources (admin only)
// ─────────────────────────────────────────────────────────────────────────────

router.post(
    '/recover',
    authenticate,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const caller = await verifyAdmin(req.headers.authorization, res);
            if (!caller) return;

            const { chargebackId } = req.body;

            if (!chargebackId) {
                throw new BadRequestError(
                    'chargebackId is required',
                    'MISSING_CHARGEBACK_ID'
                );
            }

            validateUUID(chargebackId, 'chargebackId');

            const result = await chargebackRecoveryService.recoverChargeback(
                chargebackId,
                caller.userId
            );

            res.json({
                success: true,
                data: result,
                message: result.success
                    ? `Chargeback recovered successfully. Total: ₹${result.total_recovered.toLocaleString('en-IN')} from ${result.recovery_steps.length} source(s).`
                    : 'Recovery failed'
            });
        } catch (error) {
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chargeback
// View chargebacks (admin only) - paginated, filterable
// ─────────────────────────────────────────────────────────────────────────────

router.get(
    '/',
    authenticate,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
            const merchantId = req.query.merchant_id as string | undefined;
            const status = req.query.status as string | undefined;

            const result = await chargebackRecoveryService.getChargebacks(merchantId, page, limit, status);

            res.json({
                success: true,
                data: result.data,
                total: result.total,
                page: result.page,
                limit: result.limit
            });
        } catch (error) {
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chargeback/:chargebackId
// Get a specific chargeback with balances and audit data (admin only)
// ─────────────────────────────────────────────────────────────────────────────

router.get(
    '/:chargebackId',
    authenticate,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { chargebackId } = req.params;
            validateUUID(chargebackId, 'chargebackId');

            const chargeback = await chargebackRecoveryService.getChargeback(chargebackId);
            if (!chargeback) {
                throw new NotFoundError('Chargeback not found', 'CHARGEBACK_NOT_FOUND');
            }

            res.json({
                success: true,
                data: chargeback,
                message: 'Chargeback details retrieved'
            });
        } catch (error) {
            next(error);
        }
    }
);

export default router;
