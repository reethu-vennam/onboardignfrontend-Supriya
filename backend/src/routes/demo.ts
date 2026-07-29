import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

const DEMO_SESSION_ID = 'demo_session_001';

// ─── Supabase service-role client (bypasses RLS) ─────────────────────────────

const getAdmin = () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    return createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
};

// ─── Shared-secret middleware ─────────────────────────────────────────────────

function requireDemoKey(req: Request, res: Response, next: () => void): void {
    const provided = req.headers['x-demo-key'] as string | undefined;
    const expected = process.env.DEMO_ACCESS_KEY;

    if (!expected) {
        res.status(500).json({ success: false, error: 'DEMO_ACCESS_KEY not configured on server' });
        return;
    }
    if (!provided || provided !== expected) {
        res.status(401).json({ success: false, error: 'Invalid or missing demo access key' });
        return;
    }
    next();
}

// ─── GET /api/demo/quota ─────────────────────────────────────────────────────
// Returns current used/max/remaining. Does not consume a verification.

router.get('/quota', requireDemoKey, async (_req: Request, res: Response): Promise<void> => {
    try {
        const admin = getAdmin();
        const { data, error } = await admin
            .from('demo_verification_usage')
            .select('used_count, max_count, updated_at')
            .eq('id', DEMO_SESSION_ID)
            .single();

        if (error || !data) {
            res.status(500).json({ success: false, error: 'Could not read quota' });
            return;
        }

        res.json({
            success: true,
            used: data.used_count,
            max: data.max_count,
            remaining: data.max_count - data.used_count,
            lastUsed: data.updated_at,
        });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── POST /api/demo/quota/increment ──────────────────────────────────────────
// Checks quota, increments counter, writes a log entry.
// Called by the dashboard after a successful Aadhaar OTP send or Experian fetch.
//
// Body: {
//   checkType:     'aadhaar_otp' | 'aadhaar_confirm' | 'experian'
//   inputData:     object   — masked inputs (e.g. aadhaar_last4, pan, name)
//   resultSummary: object   — key fields from API response
//   status:        'success' | 'failed'
//   errorMessage?: string
// }

router.post('/quota/increment', requireDemoKey, async (req: Request, res: Response): Promise<void> => {
    try {
        const { checkType, inputData, resultSummary, status, errorMessage } = req.body as {
            checkType: string;
            inputData: Record<string, any>;
            resultSummary: Record<string, any> | null;
            status: 'success' | 'failed';
            errorMessage?: string;
        };

        if (!checkType || !status) {
            res.status(400).json({ success: false, error: 'checkType and status are required' });
            return;
        }

        const admin = getAdmin();

        // Read current quota
        const { data: quota, error: readErr } = await admin
            .from('demo_verification_usage')
            .select('used_count, max_count')
            .eq('id', DEMO_SESSION_ID)
            .single();

        if (readErr || !quota) {
            res.status(500).json({ success: false, error: 'Could not read verification quota' });
            return;
        }

        // Enforce limit — only block on success increments
        if (status === 'success' && quota.used_count >= quota.max_count) {
            res.status(429).json({
                success: false,
                limitReached: true,
                error: `Verification limit reached (${quota.max_count} of ${quota.max_count} used). Contact onboarding@sabbpe.com.`,
                used: quota.used_count,
                max: quota.max_count,
            });
            return;
        }

        // Increment counter only on success
        let newUsed = quota.used_count;
        if (status === 'success') {
            newUsed = quota.used_count + 1;
            await admin
                .from('demo_verification_usage')
                .update({ used_count: newUsed, updated_at: new Date().toISOString() })
                .eq('id', DEMO_SESSION_ID);
        }

        // Always write a log entry (success or failure)
        await admin.from('demo_verification_log').insert({
            check_type: checkType,
            input_data: inputData ?? null,
            result_summary: resultSummary ?? null,
            status,
            error_message: errorMessage ?? null,
        });

        res.json({
            success: true,
            used: newUsed,
            max: quota.max_count,
            remaining: quota.max_count - newUsed,
        });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
