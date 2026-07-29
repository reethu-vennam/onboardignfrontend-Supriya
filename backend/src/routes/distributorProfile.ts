import { Router, Request, Response, NextFunction } from 'express';
import { getAdminClient, getSupabaseClient } from './supabase';
import { logger } from '../utils/logger';

const router = Router();

// ─── Auth helper (same pattern as distributor.ts) ────────────────────────────

async function verifyDistributor(authHeader: string | undefined, res: Response): Promise<{ userId: string; isAdmin: boolean } | null> {
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: { message: 'Distributor authentication required' } });
        return null;
    }
    const jwt = authHeader.replace('Bearer ', '');
    const supabaseClient = getSupabaseClient();
    const { data: { user }, error } = await supabaseClient.auth.getUser(jwt);
    if (error || !user) {
        res.status(401).json({ success: false, error: { message: 'Invalid distributor session' } });
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
        res.status(403).json({ success: false, error: { message: 'Only distributors or admins can perform this action' } });
        return null;
    }
    return { userId: user.id, isAdmin };
}

// ─── GET /api/distributor/profile ─────────────────────────────────────────────

router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const auth = await verifyDistributor(req.headers.authorization, res);
        if (!auth) return;

        const adminClient = getAdminClient();
        const { data, error } = await adminClient
            .from('distributor_profiles')
            .select('*')
            .eq('user_id', auth.userId)
            .maybeSingle();

        if (error) {
            logger.error('Failed to fetch distributor profile', error);
            res.status(500).json({ success: false, error: { message: error.message } });
            return;
        }

        if (!data) {
            res.status(404).json({ success: false, error: { message: 'Distributor profile not found' } });
            return;
        }

        res.status(200).json({ success: true, data });
    } catch (error) {
        logger.error('GET /distributor/profile error', error instanceof Error ? error : undefined);
        res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
});

// ─── PATCH /api/distributor/profile ───────────────────────────────────────────

const VALID_PAYOUT_CYCLES = ['daily', 'weekly', 'biweekly', 'monthly'];

router.patch('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const auth = await verifyDistributor(req.headers.authorization, res);
        if (!auth) return;

        const {
            company_name,
            contact_person,
            email,
            mobile_number,
            address,
            city,
            state,
            pincode,
            bank_account_holder,
            bank_name,
            bank_account_number,
            bank_ifsc,
            pan_number,
            aadhaar_last4,
            pan_document_path,
            aadhaar_document_path,
            profile_photo_path,
            default_commission_rate,
            payout_cycle,
        } = req.body;

        // Validate payout_cycle if provided
        if (payout_cycle && !VALID_PAYOUT_CYCLES.includes(payout_cycle)) {
            res.status(400).json({
                success: false,
                error: { message: `Invalid payout_cycle. Must be one of: ${VALID_PAYOUT_CYCLES.join(', ')}` },
            });
            return;
        }

        // Validate default_commission_rate
        if (default_commission_rate !== undefined && default_commission_rate !== null) {
            const rate = parseFloat(default_commission_rate);
            if (isNaN(rate) || rate < 0 || rate > 100) {
                res.status(400).json({
                    success: false,
                    error: { message: 'default_commission_rate must be between 0 and 100' },
                });
                return;
            }
        }

        // Build update object with only provided fields
        const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

        const stringFields = [
            'company_name', 'contact_person', 'email', 'mobile_number',
            'address', 'city', 'state', 'pincode',
            'bank_account_holder', 'bank_name', 'bank_account_number', 'bank_ifsc',
            'pan_number', 'aadhaar_last4',
            'pan_document_path', 'aadhaar_document_path', 'profile_photo_path',
        ];

        for (const field of stringFields) {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field] || null;
            }
        }

        if (payout_cycle !== undefined) {
            updateData.payout_cycle = payout_cycle;
        }

        if (default_commission_rate !== undefined) {
            updateData.default_commission_rate = default_commission_rate === '' || default_commission_rate === null
                ? null
                : parseFloat(default_commission_rate);
        }

        // Update bank_updated_at if bank fields changed
        const bankFields = ['bank_account_holder', 'bank_name', 'bank_account_number', 'bank_ifsc'];
        if (bankFields.some(f => req.body[f] !== undefined)) {
            updateData.bank_updated_at = new Date().toISOString();
        }

        const adminClient = getAdminClient();

        // Find the distributor profile by user_id
        const { data: existing, error: fetchError } = await adminClient
            .from('distributor_profiles')
            .select('id')
            .eq('user_id', auth.userId)
            .maybeSingle();

        if (fetchError || !existing) {
            res.status(404).json({ success: false, error: { message: 'Distributor profile not found' } });
            return;
        }

        const { data, error } = await adminClient
            .from('distributor_profiles')
            .update(updateData)
            .eq('id', existing.id)
            .select('*')
            .single();

        if (error) {
            logger.error('Failed to update distributor profile', error);
            res.status(500).json({ success: false, error: { message: error.message } });
            return;
        }

        logger.info('Distributor profile updated', { userId: auth.userId, fields: Object.keys(updateData).join(', ') });
        res.status(200).json({ success: true, data, message: 'Profile updated successfully' });
    } catch (error) {
        logger.error('PATCH /distributor/profile error', error instanceof Error ? error : undefined);
        res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
});

export default router;
