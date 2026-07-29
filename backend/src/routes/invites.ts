import { Router, Request, Response, NextFunction } from 'express';
import { getAdminClient } from './supabase';
import { sendMerchantInvite } from '../services/inviteService';
import { notificationService } from '../services/notifications';
import { logger } from '../utils/logger';


const router = Router();

// Normalize frontend URL (adds protocol or colon before port if missing)
const normalizeFrontendUrl = (raw?: string) => {
    let url = raw || process.env.VITE_FRONTEND_URL || 'http://localhost:5173';
    if (!url) return 'http://localhost:5173';
    if (!/^[a-zA-Z]+:\/\//.test(url)) url = 'http://' + url;
    url = url.replace(/:\/\/([^:\/]+)(\d{2,5})/, '://$1:$2');
    url = url.replace(/(localhost)(\d{2,5})/, '$1:$2');
    return url.replace(/\/$/, '');
};

interface BulkInviteRequest {
    merchants: Array<{
        email: string;
        fullName: string;
        mobileNumber: string;
        businessName?: string;
    }>;
}

/**
 * POST /api/invites/bulk-send
 * 
 * Send onboarding invites to multiple merchants via SMS
 * Each merchant gets a unique onboarding link they can click to start the flow
 * 
 * Request body:
 * {
 *   merchants: [
 *     { email, fullName, mobileNumber, businessName }
 *   ]
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   results: [
 *     { email, inviteToken, status, error? }
 *   ],
 *   sent: number,
 *   failed: number
 * }
 */
router.post(
    '/bulk-send',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            console.log('🔵 [POST /invites/bulk-send] Request received');

            const { merchants } = req.body as BulkInviteRequest;

            if (!merchants || !Array.isArray(merchants) || merchants.length === 0) {
                res.status(400).json({
                    success: false,
                    error: { message: 'merchants array is required and must not be empty' }
                });
                return;
            }

            // limit for bulk invites
            if (merchants.length > 10) {
                res.status(400).json({
                    success: false,
                    error: { message: 'Cannot send more than 10 invitations at once' }
                });
                return;
            }

            // Verify distributor via JWT
            const authHeader = req.headers.authorization;
            if (!authHeader?.startsWith('Bearer ')) {
                res.status(401).json({ success: false, error: { message: 'Authorization required' } });
                return;
            }

            const callerJwt = authHeader.replace('Bearer ', '');
            const admin = getAdminClient();

            const { data: { user: distributor }, error: userError } = await admin.auth.getUser(callerJwt);
            if (userError || !distributor) {
                res.status(401).json({ success: false, error: { message: 'Invalid session' } });
                return;
            }

            // Verify user is a distributor
            const { data: roleData } = await admin
                .from('user_roles')
                .select('role')
                .eq('user_id', distributor.id)
                .maybeSingle();

            if (roleData?.role !== 'distributor') {
                res.status(403).json({ success: false, error: { message: 'Only distributors can send invites' } });
                return;
            }

            // Get distributor's name and email
            const { data: distributorData } = await admin
                .from('users')
                .select('email, full_name')
                .eq('id', distributor.id)
                .maybeSingle();

            const distributorName = distributorData?.full_name || distributorData?.email?.split('@')[0] || 'SabbPe';

            console.log(`📧 Sending ${merchants.length} invites for distributor ${distributor.id} (${distributorName})`);

            const results: any[] = [];
            let sent = 0;
            let failed = 0;

            // Process each merchant
            for (const merchant of merchants) {
                try {
                    // Validate merchant data
                    if (!merchant.email || !merchant.fullName || !merchant.mobileNumber) {
                        results.push({
                            email: merchant.email || 'unknown',
                            status: 'failed',
                            error: 'Missing required fields: email, fullName, mobileNumber'
                        });
                        failed++;
                        continue;
                    }

                    // Format and validate mobile number
                    let formattedMobile = merchant.mobileNumber.trim();
                    if (!formattedMobile.startsWith('91')) {
                        if (formattedMobile.length === 10) {
                            formattedMobile = '91' + formattedMobile;
                        } else if (!formattedMobile.startsWith('+91')) {
                            results.push({
                                email: merchant.email,
                                status: 'failed',
                                error: 'Invalid mobile number format. Please provide a valid 10-digit number or number starting with 91'
                            });
                            failed++;
                            continue;
                        }
                    }

                    // Generate unique invite token
                    const inviteToken = crypto.randomUUID();
                    const fullFrontendUrl = normalizeFrontendUrl(process.env.VITE_FRONTEND_URL);
                    const inviteLink = `${fullFrontendUrl}/invite/${inviteToken}`;

                    // Store invite in DB with status 'sent' (will be updated if SMS fails)
                    const { data: inviteData, error: inviteError } = await admin
                        .from('merchant_invitations')
                        .insert({
                            distributor_id: distributor.id,
                            merchant_email: merchant.email,
                            merchant_name: merchant.fullName,
                            merchant_mobile: formattedMobile,
                            business_name: merchant.businessName || null,
                            invitation_token: inviteToken,
                            invite_token: inviteToken,
                            invite_link: inviteLink,
                            status: 'sent',
                            sent_via: 'sms',
                            sent_at: new Date().toISOString()
                        })
                        .select()
                        .single();

                    if (inviteError || !inviteData) {
                        console.error(`❌ Failed to store invite for ${merchant.email}:`, inviteError);
                        results.push({
                            email: merchant.email,
                            status: 'failed',
                            error: `Failed to create invite record: ${inviteError?.message}`
                        });
                        failed++;
                        continue;
                    }

                    // Send SMS invite with formatted mobile number
                    const smsResult = await sendMerchantInvite(
                        formattedMobile,
                        inviteLink,
                        distributorName,
                        merchant.fullName
                    );

                    // Send email invite to merchant
                    let emailSent = false;
                    try {
                        await notificationService.sendMerchantInviteEmail({
                            merchantEmail: merchant.email,
                            merchantName: merchant.fullName,
                            inviteLink,
                            distributorName,
                        });
                        emailSent = true;
                        console.log(`✅ Invite email sent to ${merchant.email}`);
                    } catch (emailErr) {
                        console.error(`⚠️ Email invite failed for ${merchant.email}:`, emailErr instanceof Error ? emailErr.message : emailErr);
                    }

                    if (smsResult.success) {
                        await admin
                            .from('merchant_invitations')
                            .update({
                                status: 'sent',
                                sms_message_id: smsResult.messageId || null,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', inviteData.id);

                        results.push({
                            email: merchant.email,
                            inviteToken,
                            status: 'sent',
                            via: 'sms',
                            messageId: smsResult.messageId
                        });
                        sent++;

                        console.log(`✅ Invite SMS sent to ${merchant.email} (${formattedMobile})`);
                    } else {
                        console.error(`❌ SMS invitation failed for ${merchant.email}:`, smsResult.error);
                        
                        await admin
                            .from('merchant_invitations')
                            .update({
                                status: 'failed_to_send',
                                send_error: smsResult.error || 'Unknown error',
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', inviteData.id);

                        results.push({
                            email: merchant.email,
                            inviteToken,
                            status: 'failed_to_send',
                            error: smsResult.error
                        });
                        failed++;

                        console.error(`❌ Failed to send SMS invite to ${merchant.email}:`, smsResult.error);
                    }
                } catch (err) {
                    console.error(`❌ Error processing merchant ${merchant.email}:`, err);
                    results.push({
                        email: merchant.email,
                        status: 'failed',
                        error: err instanceof Error ? err.message : String(err)
                    });
                    failed++;
                }
            }

            console.log(`\n📊 Invite Results: ${sent} sent, ${failed} failed`);

            res.status(200).json({
                success: true,
                results,
                sent,
                failed,
                total: merchants.length
            });
        } catch (error) {
            console.error('❌ Error in bulk-send:', error);
            next(error);
        }
    }
);

export default router;
