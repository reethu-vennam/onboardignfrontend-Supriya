// backend/src/routes/settlement.ts
//
// Settlement API routes.
// Provides endpoints for processing settlements, viewing history,
// and managing rolling reserve ledger.

import { Router, Request, Response, NextFunction } from 'express';
import { getAdminClient, getSupabaseClient } from './supabase';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';
import * as settlementService from '../services/settlementService';
import { runReserveReleaseManual } from '../services/reserveReleaseScheduler';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUUID(value: string, field: string): void {
    if (!value || !UUID_REGEX.test(value)) {
        throw new BadRequestError(`Invalid ${field}: must be a valid UUID`, 'INVALID_UUID');
    }
}

const router = Router();

// ─── Auth Middleware ──────────────────────────────────────────────────────────

function sendError(res: Response, status: number, code: string, message: string): void {
    res.status(status).json({ success: false, error: { code, message } });
}

async function verifyAdmin(authHeader: string | undefined, res: Response): Promise<{ userId: string } | null> {
    if (!authHeader?.startsWith('Bearer ')) {
        sendError(res, 401, 'AUTHENTICATION_REQUIRED', 'Authentication required');
        return null;
    }
    const jwt = authHeader.replace('Bearer ', '');
    const supabaseClient = getSupabaseClient();
    const { data: { user }, error } = await supabaseClient.auth.getUser(jwt);
    if (error || !user) {
        sendError(res, 401, 'INVALID_SESSION', 'Invalid session');
        return null;
    }
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

async function verifyDistributorOrAdmin(authHeader: string | undefined, res: Response): Promise<{ userId: string; isAdmin: boolean } | null> {
    if (!authHeader?.startsWith('Bearer ')) {
        sendError(res, 401, 'AUTHENTICATION_REQUIRED', 'Authentication required');
        return null;
    }
    const jwt = authHeader.replace('Bearer ', '');
    const supabaseClient = getSupabaseClient();
    const { data: { user }, error } = await supabaseClient.auth.getUser(jwt);
    if (error || !user) {
        sendError(res, 401, 'INVALID_SESSION', 'Invalid session');
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
    if (!isAdmin && !isDistributor) {
        sendError(res, 403, 'FORBIDDEN', 'Distributor or admin access required');
        return null;
    }
    return { userId: user.id, isAdmin };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/settlement/run
// Process settlement batch for all eligible merchants (admin only)
// ─────────────────────────────────────────────────────────────────────────────

router.post(
    '/run',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const caller = await verifyAdmin(req.headers.authorization, res);
            if (!caller) return;

            logger.info('Settlement batch triggered by admin', { admin_id: caller.userId });

            const result = await settlementService.processSettlementBatch();

            res.json({
                success: true,
                data: result,
                message: `Settlement batch completed: ${result.settled} settled, ${result.skipped} skipped, ${result.failed} failed`,
            });
        } catch (error) {
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/settlement/run/:merchantId
// Process settlement for a single merchant (admin only)
// ─────────────────────────────────────────────────────────────────────────────

router.post(
    '/run/:merchantId',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const caller = await verifyAdmin(req.headers.authorization, res);
            if (!caller) return;

            const { merchantId } = req.params;
            validateUUID(merchantId, 'merchantId');
            const dryRun = req.query.dry_run === 'true';

            logger.info('Settlement triggered for merchant', {
                admin_id: caller.userId,
                merchant_id: merchantId,
                dry_run: dryRun,
            });

            const result = await settlementService.processSettlementForMerchant(merchantId, dryRun);

            if (!result) {
                res.status(404).json({
                    success: false,
                    error: { code: 'NO_ELIGIBLE_TRANSACTIONS', message: 'No eligible transactions found for settlement' },
                });
                return;
            }

            res.json({
                success: true,
                data: result,
                message: dryRun ? 'Dry run completed' : 'Settlement processed successfully',
            });
        } catch (error) {
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/settlement/history
// Paginated settlement history for distributor's merchants
// ─────────────────────────────────────────────────────────────────────────────

router.get(
    '/history',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const caller = await verifyDistributorOrAdmin(req.headers.authorization, res);
            if (!caller) return;

            const page = parseInt(req.query.page as string) || 1;
            const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
            const merchantId = req.query.merchant_id as string;

            const admin = getAdminClient();

            // If specific merchant requested, check ownership
            if (merchantId) {
                const { data: merchant } = await admin
                    .from('merchant_profiles')
                    .select('id, distributor_id')
                    .eq('id', merchantId)
                    .single();

                if (!merchant) {
                    throw new NotFoundError('Merchant not found', 'MERCHANT_NOT_FOUND');
                }
                if (!caller.isAdmin && merchant.distributor_id !== caller.userId) {
                    sendError(res, 403, 'FORBIDDEN', 'Not authorized');
                    return;
                }

                const result = await settlementService.getSettlementHistory(merchantId, page, limit);
                res.json({ success: true, data: result.data, total: result.total, page: result.page, limit: result.limit, message: 'Settlement history retrieved' });
                return;
            }

            // All merchants for this distributor (or all for admin)
            let countQuery = admin.from('settlement_history').select('*', { count: 'exact', head: true });
            if (!caller.isAdmin) {
                const { data: merchants } = await admin
                    .from('merchant_profiles')
                    .select('id')
                    .eq('distributor_id', caller.userId);

                const merchantIds = (merchants || []).map((m: any) => m.id);
                if (merchantIds.length === 0) {
                    res.json({ success: true, data: [], total: 0, page, limit });
                    return;
                }
                countQuery = countQuery.in('merchant_id', merchantIds);
            }

            const { count } = await countQuery;

            let dataQuery = admin.from('settlement_history').select('*');
            if (!caller.isAdmin) {
                const { data: merchants } = await admin
                    .from('merchant_profiles')
                    .select('id')
                    .eq('distributor_id', caller.userId);

                const merchantIds = (merchants || []).map((m: any) => m.id);
                if (merchantIds.length > 0) {
                    dataQuery = dataQuery.in('merchant_id', merchantIds);
                }
            }

            const { data, error } = await dataQuery
                .order('settlement_date', { ascending: false })
                .range((page - 1) * limit, (page - 1) * limit + limit - 1);

            if (error) throw new Error(error.message);

            res.json({
                success: true,
                data: data || [],
                total: count || 0,
                page,
                limit,
            });
        } catch (error) {
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/settlement/history/:merchantId
// Settlement history for a specific merchant
// ─────────────────────────────────────────────────────────────────────────────

router.get(
    '/history/:merchantId',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const caller = await verifyDistributorOrAdmin(req.headers.authorization, res);
            if (!caller) return;

            const { merchantId } = req.params;
            validateUUID(merchantId, 'merchantId');
            const page = parseInt(req.query.page as string) || 1;
            const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

            const admin = getAdminClient();
            const { data: merchant } = await admin
                .from('merchant_profiles')
                .select('id, distributor_id')
                .eq('id', merchantId)
                .single();

            if (!merchant) {
                throw new NotFoundError('Merchant not found', 'MERCHANT_NOT_FOUND');
            }
            if (!caller.isAdmin && merchant.distributor_id !== caller.userId) {
                res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized' } });
                return;
            }

            const result = await settlementService.getSettlementHistory(merchantId, page, limit);
            res.json({ success: true, data: result.data, total: result.total, page: result.page, limit: result.limit });
        } catch (error) {
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/settlement/summary/:merchantId
// Settlement summary for a merchant
// ─────────────────────────────────────────────────────────────────────────────

router.get(
    '/summary/:merchantId',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const caller = await verifyDistributorOrAdmin(req.headers.authorization, res);
            if (!caller) return;

            const { merchantId } = req.params;
            validateUUID(merchantId, 'merchantId');

            const admin = getAdminClient();
            const { data: merchant } = await admin
                .from('merchant_profiles')
                .select('id, distributor_id')
                .eq('id', merchantId)
                .single();

            if (!merchant) {
                throw new NotFoundError('Merchant not found', 'MERCHANT_NOT_FOUND');
            }
            if (!caller.isAdmin && merchant.distributor_id !== caller.userId) {
                res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized' } });
                return;
            }

            const summary = await settlementService.getSettlementSummary(merchantId);
            res.json({ success: true, data: summary, message: 'Settlement summary retrieved' });
        } catch (error) {
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/settlement/ledger/:merchantId
// Rolling reserve ledger for a merchant
// ─────────────────────────────────────────────────────────────────────────────

router.get(
    '/ledger/:merchantId',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const caller = await verifyDistributorOrAdmin(req.headers.authorization, res);
            if (!caller) return;

            const { merchantId } = req.params;
            validateUUID(merchantId, 'merchantId');
            const page = parseInt(req.query.page as string) || 1;
            const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

            const admin = getAdminClient();
            const { data: merchant } = await admin
                .from('merchant_profiles')
                .select('id, distributor_id')
                .eq('id', merchantId)
                .single();

            if (!merchant) {
                throw new NotFoundError('Merchant not found', 'MERCHANT_NOT_FOUND');
            }
            if (!caller.isAdmin && merchant.distributor_id !== caller.userId) {
                res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized' } });
                return;
            }

            const result = await settlementService.getReserveLedger(merchantId, page, limit);
            res.json({ success: true, data: result.data, total: result.total, page: result.page, limit: result.limit });
        } catch (error) {
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/settlement/preview/:merchantId
// Preview pending settlement for a merchant (dry run)
// ─────────────────────────────────────────────────────────────────────────────

router.get(
    '/preview/:merchantId',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const caller = await verifyDistributorOrAdmin(req.headers.authorization, res);
            if (!caller) return;

            const { merchantId } = req.params;
            validateUUID(merchantId, 'merchantId');

            const admin = getAdminClient();
            const { data: merchant } = await admin
                .from('merchant_profiles')
                .select('id, distributor_id')
                .eq('id', merchantId)
                .single();

            if (!merchant) {
                throw new NotFoundError('Merchant not found', 'MERCHANT_NOT_FOUND');
            }
            if (!caller.isAdmin && merchant.distributor_id !== caller.userId) {
                res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized' } });
                return;
            }

            const preview = await settlementService.previewSettlement(merchantId);

            if (!preview) {
                res.status(404).json({
                    success: false,
                    error: { code: 'NO_ELIGIBLE_TRANSACTIONS', message: 'No eligible transactions for settlement' },
                });
                return;
            }

            res.json({ success: true, data: preview, message: 'Settlement preview generated' });
        } catch (error) {
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/settlement/undertaking/:merchantId
// Generate Settlement Undertaking PDF, upload to storage, return signed URL
// ─────────────────────────────────────────────────────────────────────────────

router.get(
    '/undertaking/:merchantId',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const caller = await verifyDistributorOrAdmin(req.headers.authorization, res);
            if (!caller) return;

            const { merchantId } = req.params;
            const admin = getAdminClient();

            const { data: merchant, error: merchantError } = await admin
                .from('merchant_profiles')
                .select('*')
                .eq('id', merchantId)
                .single();

            if (merchantError || !merchant) {
                throw new NotFoundError('Merchant not found', 'MERCHANT_NOT_FOUND');
            }
            if (!caller.isAdmin && merchant.distributor_id !== caller.userId) {
                sendError(res, 403, 'FORBIDDEN', 'Not authorized');
                return;
            }

            // Generate PDF using jsPDF (same pattern as frontend)
            const { default: jsPDF } = await import('jspdf');
            const pdf = new jsPDF();
            const pageWidth = pdf.internal.pageSize.getWidth();
            const margin = 20;
            let y = margin;

            const addText = (text: string, x: number, yPos: number, maxWidth: number, size = 10, style = 'normal' as const) => {
                pdf.setFontSize(size);
                pdf.setFont('helvetica', style);
                const lines = pdf.splitTextToSize(text, maxWidth);
                pdf.text(lines, x, yPos);
                return yPos + lines.length * size * 0.45;
            };

            const checkPage = (h: number) => {
                if (y + h > pdf.internal.pageSize.getHeight() - margin) {
                    pdf.addPage();
                    y = margin;
                }
            };

            // Header
            pdf.setFontSize(16);
            pdf.setFont('helvetica', 'bold');
            pdf.text('SETTLEMENT UNDERTAKING', pageWidth / 2, y, { align: 'center' });
            y += 8;
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');
            pdf.text('SabbPe Technology Solutions India Private Limited', pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, pageWidth / 2, y, { align: 'center' });
            y += 10;

            pdf.setDrawColor(200, 200, 200);
            pdf.line(margin, y, pageWidth - margin, y);
            y += 8;

            // Merchant Details
            checkPage(60);
            pdf.setFontSize(12);
            pdf.setFont('helvetica', 'bold');
            pdf.text('MERCHANT DETAILS', margin, y);
            y += 8;

            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');
            const details = [
                `Merchant Name: ${merchant.full_name || 'N/A'}`,
                `Business Name: ${merchant.business_name || 'N/A'}`,
                `PAN: ${merchant.pan_number || 'N/A'}`,
                `GST: ${merchant.gst_number || 'N/A'}`,
                `Merchant ID: ${merchant.id}`,
            ];
            details.forEach(d => {
                y = addText(d, margin, y, pageWidth - 2 * margin);
                y += 2;
            });
            y += 6;

            // Settlement Terms
            checkPage(60);
            pdf.setFontSize(12);
            pdf.setFont('helvetica', 'bold');
            pdf.text('SETTLEMENT TERMS', margin, y);
            y += 8;

            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');
            const terms = [
                `Rolling Reserve: ${merchant.rolling_reserve_enabled ? 'Enabled' : 'Disabled'}`,
                `Reserve Percentage: ${merchant.rolling_reserve_percentage ? `${merchant.rolling_reserve_percentage}%` : 'N/A'}`,
                `Fixed Reserve Amount: ${merchant.rolling_reserve_fixed_inr ? `INR ${merchant.rolling_reserve_fixed_inr}` : 'N/A'}`,
                `Settlement Cycle: T+${merchant.settlement_cycle_days ?? 1} business days`,
            ];
            terms.forEach(d => {
                y = addText(d, margin, y, pageWidth - 2 * margin);
                y += 2;
            });
            y += 6;

            // Undertaking Text
            checkPage(80);
            pdf.setFontSize(12);
            pdf.setFont('helvetica', 'bold');
            pdf.text('UNDERTAKING', margin, y);
            y += 8;

            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');

            const undertakingClauses = [
                `1. I/We, ${merchant.full_name || 'the merchant'}, representing ${merchant.business_name || 'the business'} (Merchant ID: ${merchant.id}), hereby acknowledge and agree to the settlement terms defined by SabbPe Technology Solutions India Private Limited.`,
                `2. I/We understand and agree that settlement of payment transactions shall be processed as per the settlement cycle of T+${merchant.settlement_cycle_days ?? 1} business days from the date of transaction settlement.`,
                `3. I/We understand and agree to the rolling reserve policy. A rolling reserve of ${merchant.rolling_reserve_enabled ? (merchant.rolling_reserve_percentage ? `${merchant.rolling_reserve_percentage}%` : (merchant.rolling_reserve_fixed_inr ? `INR ${merchant.rolling_reserve_fixed_inr} per transaction` : 'applicable percentage')) : 'N/A'} shall be deducted from each transaction settlement amount and held as reserve.`,
                `4. I/We understand that the rolling reserve amount shall be held for a period as defined in the policy and released after the completion of the applicable holding period, subject to no outstanding chargebacks, disputes, or liabilities.`,
                `5. I/We agree that the reserve may be used to cover any chargebacks, refunds, penalties, or other liabilities arising from the merchant's transaction activity.`,
                `6. I/We confirm that the information provided in this undertaking is true and correct to the best of our knowledge.`,
                `7. I/We agree to comply with all applicable laws, regulations, and SabbPe's acceptable use policies.`,
            ];

            undertakingClauses.forEach(clause => {
                checkPage(20);
                y = addText(clause, margin, y, pageWidth - 2 * margin);
                y += 4;
            });

            y += 6;

            // Signature Block
            checkPage(40);
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');
            y = addText(`For ${merchant.business_name || merchant.full_name || 'Merchant'}`, margin, y, pageWidth - 2 * margin);
            y += 12;
            pdf.setFont('helvetica', 'bold');
            y = addText('Authorized Signatory', margin, y, pageWidth - 2 * margin);
            y += 4;
            pdf.setFont('helvetica', 'normal');
            y = addText(`Name: ${merchant.full_name || ''}`, margin, y, pageWidth - 2 * margin);
            y += 2;
            y = addText(`Date: ${new Date().toLocaleDateString('en-IN')}`, margin, y, pageWidth - 2 * margin);

            // Generate PDF buffer
            const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));

            // Upload to Supabase Storage
            const storagePath = `${merchant.id}/settlement_undertaking_${Date.now()}.pdf`;

            const { error: uploadError } = await admin.storage
                .from('merchant-documents')
                .upload(storagePath, pdfBuffer, {
                    contentType: 'application/pdf',
                    cacheControl: '3600',
                    upsert: true,
                });

            if (uploadError) {
                logger.error('Failed to upload undertaking PDF', new Error(uploadError.message));
                throw new Error('Failed to upload undertaking PDF');
            }

            // Save URL to merchant_profiles
            const { error: updateError } = await admin
                .from('merchant_profiles')
                .update({ undertaking_pdf_url: storagePath })
                .eq('id', merchantId);

            if (updateError) {
                logger.error('Failed to save undertaking PDF URL', new Error(updateError.message));
            }

            // Get signed URL for download
            const { data: urlData, error: urlError } = await admin.storage
                .from('merchant-documents')
                .createSignedUrl(storagePath, 3600);

            if (urlError) {
                logger.error('Failed to create signed URL', new Error(urlError.message));
                throw new Error('Failed to create download URL');
            }

            res.json({
                success: true,
                data: {
                    signedUrl: urlData.signedUrl,
                    storagePath,
                },
            });
        } catch (error) {
            next(error);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/settlement/release-reserves
// Manually trigger reserve release (admin only, temporary for testing)
// ─────────────────────────────────────────────────────────────────────────────

router.post(
    '/release-reserves',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const caller = await verifyAdmin(req.headers.authorization, res);
            if (!caller) return;

            await runReserveReleaseManual(false);

            res.json({
                success: true,
                message: 'Reserve release completed',
            });
        } catch (error) {
            next(error);
        }
    }
);

export default router;
