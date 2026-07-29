import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { getAdminClient, getSupabaseClient } from './supabase';
import { authenticate, authorize } from '../middleware/auth';
import { notificationService } from '../services/notifications';
import { logger } from '../utils/logger';

// Ensure storage bucket exists (create if missing). Safe to call repeatedly.
async function ensureBucketExists(supabaseClient: any, bucket: string): Promise<void> {
    try {
        // createBucket will fail if bucket exists; ignore that error
        await supabaseClient.storage.createBucket(bucket, { public: false }).catch(() => {});
    } catch (err) {
        // Non-fatal here; callers will still see storage errors if creation truly fails
        logger.warn(`Failed to ensure bucket ${bucket}: ${err instanceof Error ? err.message : err}`);
    }
}

const router = Router();
const VALID_AGREEMENT_STATUSES = ['pending', 'sent', 'uploaded', 'approved', 'rejected', 'credentials_sent', 'onboarding_completed'] as const;

async function resolveUserRole(user: any, adminClient: any): Promise<'admin' | 'distributor' | 'unknown'> {
    const metadataRole = String(
        user?.app_metadata?.role ||
        user?.user_metadata?.role ||
        user?.app_metadata?.roles?.[0] ||
        ''
    ).toLowerCase();

    if (metadataRole === 'admin') return 'admin';
    if (metadataRole === 'distributor') return 'distributor';

    const { data: roleData, error: roleError } = await adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

    if (!roleError && roleData?.role) {
        const normalizedRole = String(roleData.role).toLowerCase();
        if (normalizedRole === 'admin') return 'admin';
        if (normalizedRole === 'distributor') return 'distributor';
    }

    const { data: distributorProfile } = await adminClient
        .from('distributor_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

    return distributorProfile?.id ? 'distributor' : 'unknown';
}

async function verifyDistributor(authHeader: string | undefined, res: Response): Promise<{ userId: string; isAdmin: boolean } | null> {
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: { message: 'Authentication required' } });
        return null;
    }
    const jwt = authHeader.replace('Bearer ', '');
    const supabaseClient = getSupabaseClient();
    const { data: { user }, error } = await supabaseClient.auth.getUser(jwt);
    if (error || !user) {
        res.status(401).json({ success: false, error: { message: 'Invalid session' } });
        return null;
    }
    const adminClient = getAdminClient();
    const role = await resolveUserRole(user, adminClient);
    const isAdmin = role === 'admin';
    const isDistributor = role === 'distributor';
    if (!isAdmin && !isDistributor) {
        res.status(403).json({ success: false, error: { message: 'Only distributors or admins can perform this action' } });
        return null;
    }
    return { userId: user.id, isAdmin };
}

async function validateOnboardingToken(token: string | undefined): Promise<{
    valid: boolean;
    profile: any;
    error?: { status: number; message: string };
}> {
    if (!token) {
        return { valid: false, profile: null, error: { status: 400, message: 'Token is required' } };
    }

    const adminClient = getAdminClient();
    const { data: profile, error: dbError } = await adminClient
        .from('distributor_profiles')
        .select('id, user_id, company_name, contact_person, agreement_status, agreement_file_path, agreement_rejection_reason, onboarding_token_expires_at, onboarding_token_used_at')
        .eq('onboarding_token', token)
        .maybeSingle();

    if (dbError || !profile) {
        return { valid: false, profile: null, error: { status: 404, message: 'Invalid token' } };
    }

    if (profile.onboarding_token_used_at) {
        return { valid: false, profile: null, error: { status: 410, message: 'Token already used' } };
    }

    const now = new Date();
    const expiresAt = profile.onboarding_token_expires_at ? new Date(profile.onboarding_token_expires_at) : null;
    if (expiresAt && now > expiresAt) {
        return { valid: false, profile: null, error: { status: 410, message: 'Token expired' } };
    }

    return { valid: true, profile };
}

// ─── GET /test — Health check for this router ────────────────────────────────
router.get('/test', async (_req: Request, res: Response): Promise<void> => {
    res.json({ success: true, message: 'distributorOnboarding router is alive' });
});

// ─── GET / — List all distributors with agreement status (admin) ──────────────
router.get('/', authenticate, authorize('admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const adminClient = getAdminClient();
        const { data, error } = await adminClient
            .from('distributor_profiles')
            .select('id, user_id, company_name, contact_person, email, mobile_number, created_at, agreement_status, agreement_file_path, agreement_sent_at, agreement_sent_by, signed_agreement_path, agreement_uploaded_at, agreement_approved_at, agreement_approved_by, agreement_rejection_reason, credentials_sent_at, credentials_sent_by, onboarding_completed_at, kyc_status, kyc_submitted_at')
            .order('created_at', { ascending: false });

        if (error) {
            logger.error('Failed to list distributors', error);
            res.status(500).json({ success: false, error: { message: 'Failed to fetch distributors' } });
            return;
        }

        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

// ─── GET /me — Get own agreement status (distributor) ─────────────────────────
router.get('/me', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const auth = await verifyDistributor(req.headers.authorization, res);
        if (!auth) return;

        const adminClient = getAdminClient();
        const { data, error } = await adminClient
            .from('distributor_profiles')
            .select('id, user_id, company_name, contact_person, email, agreement_status, agreement_file_path, agreement_sent_at, signed_agreement_path, agreement_uploaded_at, agreement_rejection_reason, kyc_status')
            .eq('user_id', auth.userId)
            .maybeSingle();

        if (error) {
            logger.error('Failed to query distributor profile for /me', error);
            res.status(500).json({ success: false, error: { message: error.message || 'Database query failed' } });
            return;
        }

        if (!data) {
            // Auto-create profile if it doesn't exist (distributor auth user without a profile row)
            const { data: newProfile, error: createError } = await adminClient
                .from('distributor_profiles')
                .insert({
                    user_id: auth.userId,
                    company_name: 'Distributor',
                    contact_person: 'Distributor',
                    email: '',
                    mobile_number: '',
                    is_active: true,
                })
                .select('id, user_id, company_name, contact_person, email, agreement_status, agreement_file_path, agreement_sent_at, signed_agreement_path, agreement_uploaded_at, agreement_rejection_reason, kyc_status')
                .single();

            if (createError) {
                logger.error('Failed to create distributor profile', createError);
                res.status(500).json({ success: false, error: { message: createError.message || 'Failed to create profile' } });
                return;
            }

            // Re-fetch with the new profile data
            const { data: refetched, error: refetchError } = await adminClient
                .from('distributor_profiles')
                .select('id, user_id, company_name, contact_person, email, agreement_status, agreement_file_path, agreement_sent_at, signed_agreement_path, agreement_uploaded_at, agreement_rejection_reason, kyc_status')
                .eq('user_id', auth.userId)
                .maybeSingle();

            if (refetchError || !refetched) {
                res.status(500).json({ success: false, error: { message: 'Profile creation failed' } });
                return;
            }

            const supabaseClient = getSupabaseClient();
            res.json({
                success: true,
                data: { ...refetched, agreement_download_url: null, signed_agreement_url: null }
            });
            return;
        }

        const supabaseClient = getSupabaseClient();

        let agreementDownloadUrl: string | null = null;
        if (data.agreement_file_path) {
            await ensureBucketExists(supabaseClient, 'distributor-agreements');
            const { data: signedData, error: signedError } = await supabaseClient.storage
                .from('distributor-agreements')
                .createSignedUrl(data.agreement_file_path, 3600);
            if (signedError) logger.warn('createSignedUrl failed for distributor-agreements', { error: signedError.message });
            agreementDownloadUrl = signedData?.signedUrl || null;
        }

        let signedAgreementUrl: string | null = null;
        if (data.signed_agreement_path) {
            await ensureBucketExists(supabaseClient, 'distributor-agreements');
            const { data: signedData, error: signedError } = await supabaseClient.storage
                .from('distributor-agreements')
                .createSignedUrl(data.signed_agreement_path, 3600);
            if (signedError) logger.warn('createSignedUrl failed for distributor-agreements', { error: signedError.message });
            signedAgreementUrl = signedData?.signedUrl || null;
        }

        res.json({
            success: true,
            data: {
                ...data,
                agreement_download_url: agreementDownloadUrl,
                signed_agreement_url: signedAgreementUrl,
            }
        });
    } catch (error) {
        next(error);
    }
});

// ─── POST /agreement/send — Admin sends agreement to distributor ──────────────
router.post('/agreement/send', authenticate, authorize('admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { distributorId, agreementFilePath, fileBase64, fileName } = req.body;
        if (!distributorId || (!agreementFilePath && !fileBase64)) {
            res.status(400).json({ success: false, error: { message: 'distributorId and either agreementFilePath or fileBase64+fileName are required' } });
            return;
        }

        let finalFilePath = agreementFilePath;

        if (!agreementFilePath && fileBase64) {
            const buffer = Buffer.from(fileBase64, 'base64');
            const ext = fileName?.split('.').pop() || 'pdf';
            finalFilePath = `${distributorId}/agreement-${Date.now()}.${ext}`;

            const supabaseClient = getSupabaseClient();

            // Ensure bucket exists
            await supabaseClient.storage.createBucket('distributor-agreements', { public: false }).catch(() => {});

            const { error: uploadError } = await supabaseClient.storage
                .from('distributor-agreements')
                .upload(finalFilePath, buffer, {
                    contentType: 'application/pdf',
                    upsert: true,
                });

            if (uploadError) {
                logger.error('Failed to upload agreement file to storage', uploadError);
                res.status(500).json({ success: false, error: { message: 'Failed to upload agreement file' } });
                return;
            }
        }

        const adminClient = getAdminClient();
        const { data: profile, error: fetchError } = await adminClient
            .from('distributor_profiles')
            .select('id, user_id, company_name, contact_person, email, agreement_status')
            .eq('id', distributorId)
            .maybeSingle();

        if (fetchError || !profile) {
            res.status(404).json({ success: false, error: { message: 'Distributor not found' } });
            return;
        }

        if (profile.agreement_status !== 'pending' && profile.agreement_status !== 'rejected') {
            res.status(400).json({ success: false, error: { message: `Cannot send agreement when status is '${profile.agreement_status}'` } });
            return;
        }

        const adminUser = req.user as unknown as { user_id: string };
        const onboardingToken = crypto.randomUUID();
        const tokenExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

        const { error: updateError } = await adminClient
            .from('distributor_profiles')
            .update({
                agreement_status: 'sent',
                agreement_file_path: finalFilePath,
                agreement_sent_at: new Date().toISOString(),
                agreement_sent_by: adminUser.user_id,
                onboarding_token: onboardingToken,
                onboarding_token_expires_at: tokenExpiresAt,
                onboarding_token_used_at: null,
            })
            .eq('id', distributorId);

        if (updateError) {
            logger.error('Failed to update agreement status', updateError);
            res.status(500).json({ success: false, error: { message: 'Failed to send agreement' } });
            return;
        }

        // Send notification email with onboarding link
        const frontendUrl = process.env.VITE_FRONTEND_URL || 'https://onboarding.sabbpe.com';
        const onboardingUrl = `${frontendUrl.includes('://') ? '' : 'https://'}${frontendUrl}/distributor-onboarding?token=${onboardingToken}`;

        const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
            <div style="background:#1a56db;padding:20px;border-radius:8px 8px 0 0">
                <h2 style="color:#fff;margin:0">Distributor Agreement Ready</h2>
                <p style="color:#cce0ff;margin:4px 0 0">Please review and sign your agreement.</p>
            </div>
            <div style="border:1px solid #ddd;border-top:none;padding:24px;border-radius:0 0 8px 8px">
                <p style="color:#333;font-size:15px">Hi <strong>${profile.contact_person || profile.company_name}</strong>,</p>
                <p style="color:#333;font-size:14px">Your distributor agreement from SabbPe is ready. Please click the link below to download, sign, and upload the signed copy.</p>
                <div style="text-align:center;margin:24px 0">
                    <a href="${onboardingUrl}" style="background:#1a56db;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block">Access Onboarding Portal</a>
                </div>
                <p style="color:#666;font-size:13px">Or copy this link: <a href="${onboardingUrl}" style="color:#1a56db">${onboardingUrl}</a></p>
                <p style="color:#888;font-size:13px;margin-top:24px;border-top:1px solid #eee;padding-top:16px">This link will expire in 14 days. If you have any questions, contact us at <a href="mailto:onboarding@sabbpe.com" style="color:#1a56db">onboarding@sabbpe.com</a></p>
                <p style="color:#aaa;font-size:11px;margin-top:8px">This is an automated email from SabbPe Onboarding System.</p>
            </div>
        </div>`;

        try {
            const transporter = (await import('nodemailer')).default.createTransport({
                host: process.env.EMAIL_HOST || 'smtppro.zoho.in',
                port: parseInt(process.env.EMAIL_PORT || '465'),
                secure: parseInt(process.env.EMAIL_PORT || '465') === 465,
                auth: {
                    user: process.env.EMAIL_USER || 'payments@sabbpe.com',
                    pass: process.env.EMAIL_PASS || '',
                },
            });
            await transporter.sendMail({
                from: '"SabbPe Payments" <payments@sabbpe.com>',
                to: profile.email,
                subject: 'Your SabbPe Distributor Agreement is Ready',
                html,
            });
            logger.info('Agreement sent email to distributor', { distributorId: profile.id, email: profile.email });
        } catch (emailError) {
            logger.error('Failed to send agreement email', emailError instanceof Error ? emailError : undefined, { emailError: String(emailError) });
        }

        logger.info('Agreement sent to distributor', { distributorId, adminId: adminUser.user_id, token: onboardingToken });
        res.json({ success: true, message: 'Agreement sent successfully' });
    } catch (error) {
        next(error);
    }
});

// ─── GET /agreement/download?token=xxx — Public: get agreement download URL ────
router.get('/agreement/download', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const token = req.query.token as string;
        const validation = await validateOnboardingToken(token);
        if (!validation.valid) {
            res.status(validation.error!.status).json({ success: false, error: { message: validation.error!.message } });
            return;
        }

        const profile = validation.profile;
        if (profile.agreement_status !== 'sent' && profile.agreement_status !== 'rejected') {
            res.status(400).json({ success: false, error: { message: 'No agreement available for download at this stage' } });
            return;
        }

        const supabaseClient = getSupabaseClient();
        let agreementDownloadUrl: string | null = null;
        if (profile.agreement_file_path) {
            await ensureBucketExists(supabaseClient, 'distributor-agreements');
            const { data: signedData, error: signedError } = await supabaseClient.storage
                .from('distributor-agreements')
                .createSignedUrl(profile.agreement_file_path, 604800);
            if (signedError) logger.warn('createSignedUrl failed for distributor-agreements', { error: signedError.message });
            agreementDownloadUrl = signedData?.signedUrl || null;
        }

        res.json({
            success: true,
            data: {
                company_name: profile.company_name,
                agreement_status: profile.agreement_status,
                agreement_rejection_reason: profile.agreement_rejection_reason,
                agreement_download_url: agreementDownloadUrl,
            }
        });
    } catch (error) {
        next(error);
    }
});

// ─── POST /agreement/upload-signed?token=xxx — Public: upload signed agreement ──
router.post('/agreement/upload-signed', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const token = req.query.token as string;
        const validation = await validateOnboardingToken(token);
        if (!validation.valid) {
            res.status(validation.error!.status).json({ success: false, error: { message: validation.error!.message } });
            return;
        }

        const profile = validation.profile;
        if (profile.agreement_status !== 'sent' && profile.agreement_status !== 'rejected') {
            res.status(400).json({ success: false, error: { message: `Cannot upload signed agreement when status is '${profile.agreement_status}'` } });
            return;
        }

        const { fileBase64, fileName } = req.body;
        if (!fileBase64) {
            res.status(400).json({ success: false, error: { message: 'fileBase64 is required' } });
            return;
        }

        // Decode base64 and upload to storage
        const buffer = Buffer.from(fileBase64, 'base64');
        const ext = fileName?.split('.').pop() || 'pdf';
        const storagePath = `${profile.user_id}/signed-${Date.now()}.${ext}`;

        const supabaseClient = getSupabaseClient();
        await ensureBucketExists(supabaseClient, 'distributor-agreements');
        const { error: uploadError } = await supabaseClient.storage
            .from('distributor-agreements')
            .upload(storagePath, buffer, {
                contentType: 'application/pdf',
                upsert: true,
            });

        if (uploadError) {
            logger.error('Failed to upload signed agreement to storage', uploadError);
            res.status(500).json({ success: false, error: { message: 'Failed to upload file' } });
            return;
        }

        const adminClient = getAdminClient();
        const { error: updateError } = await adminClient
            .from('distributor_profiles')
            .update({
                agreement_status: 'uploaded',
                signed_agreement_path: storagePath,
                agreement_uploaded_at: new Date().toISOString(),
                agreement_rejection_reason: null,
                onboarding_token_used_at: new Date().toISOString(),
            })
            .eq('id', profile.id);

        if (updateError) {
            logger.error('Failed to update agreement after upload', updateError);
            res.status(500).json({ success: false, error: { message: 'Failed to save agreement record' } });
            return;
        }

        logger.info('Signed agreement uploaded via public onboarding link', { distributorId: profile.id });
        res.json({ success: true, message: 'Signed agreement uploaded successfully' });
    } catch (error) {
        next(error);
    }
});

// ─── GET /signed/:distributorId — View signed copy (admin or the distributor themself) ──
router.get('/signed/:distributorId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const auth = await verifyDistributor(req.headers.authorization, res);
        if (!auth) return;

        const { distributorId } = req.params;
        const adminClient = getAdminClient();

        // Admin passes profile id, distributor passes their own user_id
        const isSearchByUserId = !auth.isAdmin;
        const queryField = isSearchByUserId ? 'user_id' : 'id';
        const queryValue = isSearchByUserId ? auth.userId : distributorId;

        const { data: profile, error } = await adminClient
            .from('distributor_profiles')
            .select('id, user_id, company_name, signed_agreement_path')
            .eq(queryField, queryValue)
            .maybeSingle();

        if (error || !profile) {
            res.status(404).json({ success: false, error: { message: 'Distributor not found' } });
            return;
        }

        // Allow if admin or the distributor themself
        if (!auth.isAdmin && profile.user_id !== auth.userId) {
            res.status(403).json({ success: false, error: { message: 'Not authorized' } });
            return;
        }

        if (!profile.signed_agreement_path) {
            res.status(404).json({ success: false, error: { message: 'No signed agreement uploaded yet' } });
            return;
        }

        const supabaseClient = getSupabaseClient();
        await ensureBucketExists(supabaseClient, 'distributor-agreements');
        const { data: signedData, error: signedError } = await supabaseClient.storage
            .from('distributor-agreements')
            .createSignedUrl(profile.signed_agreement_path, 3600);

        if (signedError || !signedData?.signedUrl) {
            logger.error('Failed to generate signed URL for distributor-agreements', signedError || undefined);
            res.status(500).json({ success: false, error: { message: 'Failed to generate download link' } });
            return;
        }

        res.json({ success: true, data: { signedUrl: signedData.signedUrl, companyName: profile.company_name } });
    } catch (error) {
        next(error);
    }
});

// ─── POST /approve — Admin approves agreement ─────────────────────────────────
router.post('/approve', authenticate, authorize('admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { distributorId } = req.body;
        if (!distributorId) {
            res.status(400).json({ success: false, error: { message: 'distributorId is required' } });
            return;
        }

        const adminClient = getAdminClient();
        const { data: profile, error: fetchError } = await adminClient
            .from('distributor_profiles')
            .select('id, agreement_status')
            .eq('id', distributorId)
            .maybeSingle();

        if (fetchError || !profile) {
            res.status(404).json({ success: false, error: { message: 'Distributor not found' } });
            return;
        }

        if (profile.agreement_status !== 'uploaded') {
            res.status(400).json({ success: false, error: { message: `Cannot approve when status is '${profile.agreement_status}'` } });
            return;
        }

        const adminUser = req.user as unknown as { user_id: string };
        const { error: updateError } = await adminClient
            .from('distributor_profiles')
            .update({
                agreement_status: 'approved',
                agreement_approved_at: new Date().toISOString(),
                agreement_approved_by: adminUser.user_id,
            })
            .eq('id', distributorId);

        if (updateError) {
            logger.error('Failed to approve agreement', updateError);
            res.status(500).json({ success: false, error: { message: 'Failed to approve agreement' } });
            return;
        }

        logger.info('Agreement approved', { distributorId, adminId: adminUser.user_id });
        res.json({ success: true, message: 'Agreement approved successfully' });
    } catch (error) {
        next(error);
    }
});

// ─── POST /reject — Admin rejects agreement ───────────────────────────────────
router.post('/reject', authenticate, authorize('admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { distributorId, reason } = req.body;
        if (!distributorId) {
            res.status(400).json({ success: false, error: { message: 'distributorId is required' } });
            return;
        }

        if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
            res.status(400).json({ success: false, error: { message: 'Rejection reason is required' } });
            return;
        }

        const adminClient = getAdminClient();
        const { data: profile, error: fetchError } = await adminClient
            .from('distributor_profiles')
            .select('id, agreement_status')
            .eq('id', distributorId)
            .maybeSingle();

        if (fetchError || !profile) {
            res.status(404).json({ success: false, error: { message: 'Distributor not found' } });
            return;
        }

        if (profile.agreement_status !== 'uploaded') {
            res.status(400).json({ success: false, error: { message: `Cannot reject when status is '${profile.agreement_status}'` } });
            return;
        }

        const { error: updateError } = await adminClient
            .from('distributor_profiles')
            .update({
                agreement_status: 'rejected',
                agreement_rejection_reason: reason.trim(),
            })
            .eq('id', distributorId);

        if (updateError) {
            logger.error('Failed to reject agreement', updateError);
            res.status(500).json({ success: false, error: { message: 'Failed to reject agreement' } });
            return;
        }

        logger.info('Agreement rejected', { distributorId, reason: reason.trim() });
        res.json({ success: true, message: 'Agreement rejected' });
    } catch (error) {
        next(error);
    }
});

// ─── POST /credentials/send — Admin sends credentials to distributor ──────────
router.post('/credentials/send', authenticate, authorize('admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { distributorId, password } = req.body;
        if (!distributorId || !password) {
            res.status(400).json({ success: false, error: { message: 'distributorId and password are required' } });
            return;
        }

        if (password.length < 6) {
            res.status(400).json({ success: false, error: { message: 'Password must be at least 6 characters' } });
            return;
        }

        const adminClient = getAdminClient();
        const { data: profile, error: fetchError } = await adminClient
            .from('distributor_profiles')
            .select('id, user_id, company_name, contact_person, email, agreement_status')
            .eq('id', distributorId)
            .maybeSingle();

        if (fetchError || !profile) {
            res.status(404).json({ success: false, error: { message: 'Distributor not found' } });
            return;
        }

        if (profile.agreement_status !== 'approved' && profile.agreement_status !== 'credentials_sent' && profile.agreement_status !== 'onboarding_completed') {
            res.status(400).json({ success: false, error: { message: `Cannot send credentials when status is '${profile.agreement_status}'. Must be 'approved' first.` } });
            return;
        }

        // Reset password via admin API
        const { error: passwordError } = await adminClient.auth.admin.updateUserById(profile.user_id, { password });
        if (passwordError) {
            logger.error('Failed to reset distributor password', passwordError);
            res.status(500).json({ success: false, error: { message: 'Failed to set password. Make sure the user exists in auth.' } });
            return;
        }

        const adminUser = req.user as unknown as { user_id: string };
        const newStatus = profile.agreement_status === 'approved' ? 'credentials_sent' : profile.agreement_status;
        const { error: updateError } = await adminClient
            .from('distributor_profiles')
            .update({
                agreement_status: newStatus,
                credentials_sent_at: new Date().toISOString(),
                credentials_sent_by: adminUser.user_id,
                onboarding_completed_at: new Date().toISOString(),
            })
            .eq('id', distributorId);

        if (updateError) {
            logger.error('Failed to update credentials sent status', updateError);
            res.status(500).json({ success: false, error: { message: 'Failed to update credentials sent status' } });
            return;
        }

        // Send credentials email
        await notificationService.sendDistributorCredentialsEmail({
            distributorEmail: profile.email,
            distributorName: profile.contact_person || profile.company_name || 'Distributor',
            password,
        });

        logger.info('Credentials sent to distributor', { distributorId, email: profile.email, adminId: adminUser.user_id });
        res.json({ success: true, message: 'Credentials sent successfully' });
    } catch (error) {
        next(error);
    }
});

// ─── POST /kyc/submit — Distributor submits KYC ──────────────────────────────
router.post('/kyc/submit', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const auth = await verifyDistributor(req.headers.authorization, res);
        if (!auth) return;

        const adminClient = getAdminClient();
        const { data: profile, error: fetchError } = await adminClient
            .from('distributor_profiles')
            .select('id, pan_number, aadhaar_last4, bank_account_number, bank_ifsc, address, kyc_status')
            .eq('user_id', auth.userId)
            .maybeSingle();

        if (fetchError || !profile) {
            res.status(404).json({ success: false, error: { message: 'Profile not found' } });
            return;
        }

        if (profile.kyc_status !== 'pending' && profile.kyc_status !== 'rejected') {
            res.status(400).json({ success: false, error: { message: `Cannot submit KYC when status is '${profile.kyc_status}'` } });
            return;
        }

        const missing: string[] = [];
        if (!profile.pan_number) missing.push('PAN Number');
        if (!profile.aadhaar_last4) missing.push('Aadhaar');
        if (!profile.bank_account_number || !profile.bank_ifsc) missing.push('Bank Details');
        if (!profile.address) missing.push('Address');

        if (missing.length > 0) {
            res.status(400).json({ success: false, error: { message: `Please complete the following before submitting: ${missing.join(', ')}` } });
            return;
        }

        const { error: updateError } = await adminClient
            .from('distributor_profiles')
            .update({
                kyc_status: 'submitted',
                kyc_submitted_at: new Date().toISOString(),
            })
            .eq('id', profile.id);

        if (updateError) {
            logger.error('Failed to submit KYC', updateError);
            res.status(500).json({ success: false, error: { message: 'Failed to submit KYC' } });
            return;
        }

        logger.info('KYC submitted', { distributorId: profile.id, userId: auth.userId });
        res.json({ success: true, message: 'KYC submitted for review', kyc_status: 'submitted' });
    } catch (error) {
        next(error);
    }
});

// ─── POST /kyc/approve — Admin approves KYC ──────────────────────────────────
router.post('/kyc/approve', authenticate, authorize('admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { distributorId } = req.body;
        if (!distributorId) {
            res.status(400).json({ success: false, error: { message: 'distributorId is required' } });
            return;
        }

        const adminClient = getAdminClient();
        const { data: profile, error: fetchError } = await adminClient
            .from('distributor_profiles')
            .select('id, kyc_status')
            .eq('id', distributorId)
            .maybeSingle();

        if (fetchError || !profile) {
            res.status(404).json({ success: false, error: { message: 'Distributor not found' } });
            return;
        }

        if (profile.kyc_status !== 'submitted') {
            res.status(400).json({ success: false, error: { message: `Cannot approve KYC when status is '${profile.kyc_status}'` } });
            return;
        }

        const adminUser = req.user as unknown as { user_id: string };
        const { error: updateError } = await adminClient
            .from('distributor_profiles')
            .update({
                kyc_status: 'approved',
                kyc_verified_at: new Date().toISOString(),
                kyc_verified_by: adminUser.user_id,
            })
            .eq('id', distributorId);

        if (updateError) {
            logger.error('Failed to approve KYC', updateError);
            res.status(500).json({ success: false, error: { message: 'Failed to approve KYC' } });
            return;
        }

        logger.info('KYC approved', { distributorId, adminId: adminUser.user_id });
        res.json({ success: true, message: 'KYC approved successfully' });
    } catch (error) {
        next(error);
    }
});

// ─── POST /kyc/reject — Admin rejects KYC ────────────────────────────────────
router.post('/kyc/reject', authenticate, authorize('admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { distributorId } = req.body;
        if (!distributorId) {
            res.status(400).json({ success: false, error: { message: 'distributorId is required' } });
            return;
        }

        const adminClient = getAdminClient();
        const { data: profile, error: fetchError } = await adminClient
            .from('distributor_profiles')
            .select('id, kyc_status')
            .eq('id', distributorId)
            .maybeSingle();

        if (fetchError || !profile) {
            res.status(404).json({ success: false, error: { message: 'Distributor not found' } });
            return;
        }

        if (profile.kyc_status !== 'submitted') {
            res.status(400).json({ success: false, error: { message: `Cannot reject KYC when status is '${profile.kyc_status}'` } });
            return;
        }

        const { error: updateError } = await adminClient
            .from('distributor_profiles')
            .update({
                kyc_status: 'rejected',
            })
            .eq('id', distributorId);

        if (updateError) {
            logger.error('Failed to reject KYC', updateError);
            res.status(500).json({ success: false, error: { message: 'Failed to reject KYC' } });
            return;
        }

        logger.info('KYC rejected', { distributorId });
        res.json({ success: true, message: 'KYC rejected' });
    } catch (error) {
        next(error);
    }
});

console.log('distributorOnboarding routes:', 
    router.stack.filter((r: any) => r.route).map((r: any) => `${Object.keys(r.route.methods).join(',')} ${r.route.path}`).join(', '));

export default router;
