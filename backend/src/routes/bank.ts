import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase';
import { logger } from '../utils/logger';
import { buildMerchantFinalApprovalZip } from '../utils/merchantFinalArchive';
import { sendMailViaNotificationEngine } from '../utils/notificationEngine';
import { buildZipCodeEmailSection, generateZipCode } from '../utils/zip';
import type { DecodedToken } from '../types/merchant';

const router = Router();

function getAdminSupabaseClient(): SupabaseClient {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Supabase URL or Service Key not configured');
    }

    return createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
}

type BankUserRequest = Request & {
    bankUser?: {
        user_id: string;
        email: string;
        role: string;
        bankStaffId?: string;
    };
};

const buildFinalApprovalEmailHtml = (
    profile: Record<string, any>,
    applicationId: string,
    zipCode: string
): string => `
  <div style="margin:0;padding:0;background:linear-gradient(135deg,#f8fafc 0%,#e2e8f0 100%);font-family:'Segoe UI',Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:50px 20px;">
          <table width="650" cellpadding="0" cellspacing="0"
            style="background:#ffffff;border-radius:20px;box-shadow:0 20px 40px rgba(0,0,0,0.1);overflow:hidden;border:1px solid #e2e8f0;">

            <tr>
              <td style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:40px 40px 30px;color:#ffffff;text-align:center;">
                <div style="width:80px;height:80px;background:#ffffff;border-radius:50%;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px rgba(0,0,0,0.15);">
                  <span style="font-size:36px;">📋</span>
                </div>
                <h1 style="margin:0;font-size:28px;font-weight:700;letter-spacing:-0.5px;">Merchant Final Approval</h1>
                <p style="margin:10px 0 0;font-size:16px;opacity:0.9;">Onboarding documents archive</p>
              </td>
            </tr>

            <tr>
              <td style="padding:40px;">
                <h2 style="margin:0 0 20px;color:#1f2937;font-size:24px;font-weight:600;">
                  Bank has approved merchant: ${profile.full_name || 'Merchant'}
                </h2>

                <p style="color:#4b5563;font-size:16px;line-height:1.6;margin-bottom:20px;">
                  The merchant agreement has been <strong>finally approved</strong> by the bank.
                  A password-protected ZIP with all onboarding documents is attached to this email.
                </p>

                ${buildZipCodeEmailSection(zipCode)}

                <div style="background:#ffffff;border-radius:12px;padding:20px;margin:0 0 30px;border:1px solid #e5e7eb;">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <span style="color:#6b7280;font-weight:500;">Merchant Name:</span>
                    <span style="color:#1f2937;font-weight:600;">${profile.full_name || 'N/A'}</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <span style="color:#6b7280;font-weight:500;">Merchant Email:</span>
                    <span style="color:#1f2937;font-weight:600;">${profile.email || 'N/A'}</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <span style="color:#6b7280;font-weight:500;">Application ID:</span>
                    <span style="color:#1f2937;font-weight:600;">${profile.application_id || applicationId}</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="color:#6b7280;font-weight:500;">Business:</span>
                    <span style="color:#1f2937;font-weight:600;">${profile.business_name || 'N/A'}</span>
                  </div>
                </div>

                <div style="background:linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%);border-radius:16px;padding:30px;margin:30px 0;border:2px solid #bbf7d0;position:relative;overflow:hidden;">
                  <div style="position:absolute;top:0;left:0;width:100%;height:4px;background:linear-gradient(90deg,#10b981,#059669);"></div>
                  <div style="display:flex;align-items:center;margin-bottom:20px;">
                    <div style="width:48px;height:48px;background:#10b981;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-right:16px;">
                      <span style="color:#ffffff;font-size:24px;">✅</span>
                    </div>
                    <div>
                      <h3 style="margin:0;color:#1f2937;font-size:18px;font-weight:600;">Account Status</h3>
                      <p style="margin:4px 0 0;color:#6b7280;font-size:14px;">Fully activated and ready</p>
                    </div>
                  </div>
                  <div style="background:#ffffff;border-radius:12px;padding:20px;margin-top:20px;border:1px solid #e5e7eb;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                      <span style="color:#6b7280;font-weight:500;">Account Status:</span>
                      <span style="background:#10b981;color:#ffffff;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;">APPROVED ✅</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                      <span style="color:#6b7280;font-weight:500;">Business:</span>
                      <span style="color:#1f2937;font-weight:600;">${profile.business_name}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                      <span style="color:#6b7280;font-weight:500;">Ready to:</span>
                      <span style="color:#1f2937;font-weight:600;">Accept Payments</span>
                    </div>
                  </div>
                </div>

                <div style="background:#f8fafc;border-radius:16px;padding:30px;margin:30px 0;border:1px solid #e2e8f0;">
                  <h3 style="margin:0 0 20px;color:#1f2937;font-size:18px;font-weight:600;">📎 Attached Documents</h3>
                  <p style="color:#4b5563;font-size:15px;line-height:1.6;margin-bottom:16px;">
                    A password-protected ZIP file with this merchant's onboarding documents is attached
                    (KYC documents, merchant details, and CPV video where available).
                  </p>
                  <div style="background:#ffffff;border-radius:12px;padding:20px;border:1px solid #e2e8f0;">
                    <p style="margin:0 0 12px;color:#1f2937;font-size:15px;font-weight:600;">How to open your documents:</p>
                    <ol style="margin:0;padding-left:20px;color:#4b5563;font-size:14px;line-height:1.8;">
                      <li>Download the attached ZIP file from this email.</li>
                      <li>Extract the ZIP (right-click → <strong>Extract All</strong>).</li>
                      <li>Open <strong>OPEN_DOCUMENTS.html</strong> from the extracted folder.</li>
                      <li>Enter your ZIP code: <strong>${zipCode}</strong></li>
                      <li>Click <strong>Unlock Documents</strong> — all files will appear inside.</li>
                    </ol>
                    <p style="margin:12px 0 0;color:#6b7280;font-size:13px;">
                      Or open <strong>documents.zip</strong> directly and enter the same code when Windows asks for a password.
                    </p>
                  </div>
                </div>

                <div style="background:#ffffff;border-radius:16px;padding:30px;margin:30px 0;border:1px solid #e2e8f0;">
                  <h3 style="margin:0 0 20px;color:#1f2937;font-size:18px;font-weight:600;text-align:center;">Onboarding Complete!</h3>
                  <div style="display:flex;justify-content:space-between;margin-bottom:20px;">
                    <div style="flex:1;text-align:center;">
                      <div style="width:40px;height:40px;background:#10b981;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;color:#ffffff;font-weight:600;">✓</div>
                      <p style="margin:0;color:#6b7280;font-size:12px;">KYC Verified</p>
                    </div>
                    <div style="flex:1;text-align:center;">
                      <div style="width:40px;height:40px;background:#10b981;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;color:#ffffff;font-weight:600;">✓</div>
                      <p style="margin:0;color:#6b7280;font-size:12px;">CPV Approved</p>
                    </div>
                    <div style="flex:1;text-align:center;">
                      <div style="width:40px;height:40px;background:#10b981;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;color:#ffffff;font-weight:600;">✓</div>
                      <p style="margin:0;color:#6b7280;font-size:12px;">Bank Approved</p>
                    </div>
                    <div style="flex:1;text-align:center;">
                      <div style="width:40px;height:40px;background:#10b981;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;color:#ffffff;font-weight:600;">✓</div>
                      <p style="margin:0;color:#1f2937;font-size:12px;font-weight:600;">Activated</p>
                    </div>
                  </div>
                  <div style="width:100%;height:4px;background:#e5e7eb;border-radius:2px;margin-bottom:10px;">
                    <div style="width:100%;height:100%;background:linear-gradient(90deg,#10b981,#059669);border-radius:2px;"></div>
                  </div>
                  <p style="color:#10b981;font-size:14px;text-align:center;margin:0;font-weight:600;">100% Complete - You're Live! 🎉</p>
                </div>

                <p style="color:#9ca3af;font-size:14px;text-align:center;margin:20px 0 0;">
                  Internal onboarding notification from SabbPe Merchant Onboarding.
                </p>
              </td>
            </tr>

            <tr>
              <td style="background:#f8fafc;padding:30px 40px;text-align:center;border-top:1px solid #e2e8f0;">
                <div style="margin-bottom:20px;">
                  <img src="https://via.placeholder.com/120x40/10b981/ffffff?text=SabbPe" alt="SabbPe Logo" style="height:40px;">
                </div>
                <p style="margin:0;color:#6b7280;font-size:14px;">
                  © ${new Date().getFullYear()} SabbPe. All rights reserved.<br/>
                  This is an automated message. Please do not reply.
                </p>
                <div style="margin-top:20px;">
                  <a href="#" style="color:#10b981;text-decoration:none;margin:0 10px;font-size:14px;">Privacy Policy</a>
                  <a href="#" style="color:#10b981;text-decoration:none;margin:0 10px;font-size:14px;">Terms of Service</a>
                  <a href="#" style="color:#10b981;text-decoration:none;margin:0 10px;font-size:14px;">Support</a>
                </div>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </div>
`;

// ============================================
// Bank: Login Endpoint
// ============================================

router.post(
    '/auth/login',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                res.status(400).json({
                    success: false,
                    message: 'Email and password required'
                });
                return;
            }

            logger.info('?? Bank login attempt:', { email });

            const supabase = getAdminSupabaseClient();

            // Authenticate with Supabase Auth
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error || !data.user) {
                logger.warn('? Bank auth failed:', { email, error: error?.message });
                res.status(401).json({
                    success: false,
                    message: 'Invalid email or password'
                });
                return;
            }

            logger.info('? Bank auth succeeded:', { user_id: data.user.id });

            // Check bank_staff Table
            const { data: bankUser, error: roleError } = await supabase
                .from('bank_staff')
                .select('*')
                .eq('user_id', data.user.id)
                .single();

            if (roleError || !bankUser) {
                logger.warn('? User not in bank_staff table:', {
                    user_id: data.user.id,
                    email,
                    error: roleError?.message
                });
                res.status(403).json({
                    success: false,
                    message: 'Not authorized as bank staff'
                });
                return;
            }

            // Verify Status
            if (bankUser.status !== 'active') {
                logger.warn('? Bank staff account not active:', {
                    user_id: data.user.id,
                    status: bankUser.status
                });
                res.status(403).json({
                    success: false,
                    message: `Account is ${bankUser.status}. Contact administrator.`
                });
                return;
            }

            const validRoles = ['bank_admin', 'bank_staff'];
            if (!validRoles.includes(bankUser.role)) {
                logger.warn('? User has invalid role:', {
                    user_id: data.user.id,
                    role: bankUser.role
                });
                res.status(403).json({
                    success: false,
                    message: 'Insufficient permissions'
                });
                return;
            }

            // Generate JWT Token
            const nameParts = bankUser.name ? bankUser.name.split(' ') : ['Bank', 'Staff'];

            const token = jwt.sign(
                {
                    user_id: data.user.id,
                    email: data.user.email,
                    role: bankUser.role,
                    bankStaffId: bankUser.id
                },
                process.env.JWT_SECRET || 'your-secret-key-change-this',
                { expiresIn: '24h' }
            );

            logger.info('? Bank login successful:', {
                email,
                user_id: data.user.id,
                role: bankUser.role
            });

            res.json({
                success: true,
                message: 'Login successful',
                token,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                user: {
                    user_id: data.user.id,
                    email: data.user.email,
                    role: bankUser.role,
                    name: bankUser.name,
                    bankStaffId: bankUser.id
                }
            });

        } catch (error) {
            const errorToLog = error instanceof Error ? error : new Error(String(error));
            logger.error('Bank login error:', errorToLog);
            next(error);
        }
    }
);

// ============================================
// Middleware: Verify Bank Token
// ============================================

export const verifyBankToken = (
    req: BankUserRequest,
    res: Response,
    next: NextFunction
): void => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            logger.warn('? No authorization header');
            res.status(401).json({
                success: false,
                message: 'No token provided'
            });
            return;
        }

        const token = authHeader.substring(7);

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'your-secret-key-change-this'
        ) as DecodedToken;

        req.bankUser = {
            user_id: decoded.user_id,
            email: decoded.email,
            role: decoded.role,
            bankStaffId: decoded.bankStaffId
        };

        next();
    } catch (error) {
        logger.warn('Token verification failed', {
            message: error instanceof Error ? error.message : String(error)
        });
        res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
};

// ============================================
// Bank: Get Pending Applications
// ============================================

router.get(
    '/applications/pending',
    verifyBankToken,
    async (req: BankUserRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            logger.info('?? Bank fetching pending applications:', {
                bankStaffId: req.bankUser?.bankStaffId,
                email: req.bankUser?.email
            });

            const supabase = getSupabaseClient();

            // Get all applications with status = 'pending_bank_approval'
            const { data: applications, error: fetchError } = await supabase
                .from('merchant_profiles')
                .select('*')
                .eq('onboarding_status', 'pending_bank_approval')
                .order('updated_at', { ascending: false });

            if (fetchError) throw fetchError;

            logger.info('? Found pending applications:', { count: applications?.length || 0 });

            res.json({
                success: true,
                data: applications || [],
                count: applications?.length || 0
            });

        } catch (error) {
            const errorToLog = error instanceof Error ? error : new Error('Error fetching applications');
            logger.error('Error fetching pending applications:', errorToLog);
            next(error);
        }
    }
);


// ============================================
// Bank: Get Agreement Signed Applications
// ============================================
router.get(
    '/applications/agreement-signed',
    verifyBankToken,
    async (req: BankUserRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('merchant_profiles')
                .select('*')
                .eq('onboarding_status', 'agreement_signed')
                .order('updated_at', { ascending: false });

            if (error) throw error;

            res.json({ success: true, data: data || [], count: data?.length || 0 });
        } catch (error) {
            next(error);
        }
    }
);

// ============================================
// Bank: Get Application Details
// ============================================

router.get(
    '/applications/:applicationId',
    verifyBankToken,
    async (req: BankUserRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { applicationId } = req.params;
            const supabase = getSupabaseClient(); // service role — bypasses RLS

            const { data: application, error: fetchError } = await supabase
                .from('merchant_profiles')
                .select('*')
                .eq('id', applicationId)
                .single();

            if (fetchError) throw fetchError;
            if (!application) {
                res.status(404).json({ success: false, message: 'Application not found' });
                return;
            }

            // Fetch sub-data using service role (bypasses RLS)
            const [docsRes, bankRes, kycRes] = await Promise.all([
                supabase.from('merchant_documents').select('*').eq('merchant_id', applicationId),
                supabase.from('merchant_bank_details').select('*').eq('merchant_id', applicationId),
                supabase.from('merchant_kyc').select('*').eq('merchant_id', applicationId),
            ]);

            // Generate public URLs for documents
            const documentsWithUrls = (docsRes.data || []).map((doc: any) => {
                const { data } = supabase.storage
                    .from('merchant-documents')
                    .getPublicUrl(doc.file_path);
                return { ...doc, public_url: data?.publicUrl || null };
            });

            // Generate CPV video public URL
            let cpvVideoUrl = null;
            if (application.cpv_video_path) {
                const { data: cpvData } = supabase.storage
                    .from('merchant-documents')
                    .getPublicUrl(application.cpv_video_path);
                cpvVideoUrl = cpvData?.publicUrl || null;
            }

            res.json({
                success: true,
                data: {
                    ...application,
                    documents: documentsWithUrls,
                    bank_details: bankRes.data?.[0] || null,
                    kyc: kycRes.data?.[0] || null,
                    cpv_video_url: cpvVideoUrl,
                }
            });

        } catch (error) {
            const errorToLog = error instanceof Error ? error : new Error('Error fetching application');
            logger.error('Error fetching application:', errorToLog);
            next(error);
        }
    }
);

// ============================================
// Bank: Approve/Reject Application
// ============================================

router.post(
    '/applications/decide/:applicationId',
    verifyBankToken,
    async (req: BankUserRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { applicationId } = req.params;
            const { decision, notes } = req.body; // 'approve' or 'reject'

            if (!['approve', 'reject'].includes(decision)) {
                res.status(400).json({
                    success: false,
                    message: 'Invalid decision. Use approve or reject'
                });
                return;
            }

            const supabase = getSupabaseClient();

            const newStatus = decision === 'approve' ? 'approved' : 'bank_rejected';

            logger.info('?? Bank processing application:', {
                applicationId,
                decision,
                bankStaffId: req.bankUser?.bankStaffId
            });

            // Update application status
            const { error: updateError } = await supabase
                .from('merchant_profiles')
                .update({
                    onboarding_status: newStatus,
                    rejection_reason: decision === 'reject' ? (notes || 'Rejected by bank') : null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', applicationId);

            if (updateError) throw updateError;

            logger.info('? Application status updated:', { applicationId, newStatus });

            res.json({
                success: true,
                message: `Application ${decision}ed successfully`,
                decision,
                newStatus,
                applicationId
            });

        } catch (error) {
            const errorToLog = error instanceof Error ? error : new Error('Error processing application');
            logger.error('Error processing application:', errorToLog);
            next(error);
        }
    }
);

// ============================================
// Bank: Send Agreement to Merchant
// ============================================
router.post(
    '/applications/send-agreement/:applicationId',
    verifyBankToken,
    async (req: BankUserRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { applicationId } = req.params;
            const { commercials, notes } = req.body;

            if (!commercials && !notes && !req.body) {
                res.status(400).json({ success: false, message: 'Request body required' });
                return;
            }

            const supabase = getSupabaseClient();

            const { error } = await supabase
                .from('merchant_profiles')
                .update({
                    onboarding_status: 'agreement_pending',
                    bank_commercials: commercials,
                    bank_commercials_set_at: new Date().toISOString(),
                    bank_commercials_set_by: req.bankUser?.user_id,
                    bank_decision_notes: notes || null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', applicationId);

            if (error) throw error;

            res.json({ success: true, message: 'Agreement sent to merchant successfully' });
        } catch (error) {
            next(error);
        }
    }
);

// ============================================
// Bank: Final Approve/Reject after Agreement
// ============================================
router.post(
    '/applications/final-decision/:applicationId',
    verifyBankToken,
    async (req: BankUserRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { applicationId } = req.params;
            const { decision, notes } = req.body;

            if (!['approve', 'reject'].includes(decision)) {
                res.status(400).json({ success: false, message: 'Invalid decision' });
                return;
            }

            const supabase = getSupabaseClient();

            // Get merchant profile first to get email and archive data
            const { data: profile, error: profileError } = await supabase
                .from('merchant_profiles')
                .select('*')
                .eq('id', applicationId)
                .single();

            if (profileError || !profile) {
                res.status(404).json({ success: false, message: 'Merchant not found' });
                return;
            }

            const newStatus = decision === 'approve' ? 'approved' : 'bank_rejected';

            const { error } = await supabase
                .from('merchant_profiles')
                .update({
                    onboarding_status: newStatus,
                    rejection_reason: decision === 'reject' ? (notes || 'Rejected by bank') : null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', applicationId);

            if (error) throw error;

            // Sync approved merchant to MariaDB client_profile
            if (decision === 'approve' && profile.email) {
                try {
                    const { insertClientProfile, getClientIdsByEmails } = await import('../services/mariadb');
                    const existingMap = await getClientIdsByEmails([profile.email]);
                    if (!existingMap[profile.email.toLowerCase()]) {
                        let distributorClientId: string | undefined;
                        if (profile.distributor_id) {
                            const { data: distProf } = await supabase
                                .from('distributor_profiles')
                                .select('email')
                                .eq('user_id', profile.distributor_id)
                                .maybeSingle();
                            if (distProf?.email) {
                                const distCidMap = await getClientIdsByEmails([distProf.email]);
                                distributorClientId = distCidMap[distProf.email.toLowerCase()];
                            }
                        }
                        await insertClientProfile({
                            clientId: profile.user_id,
                            clientName: profile.business_name || profile.full_name || profile.email,
                            clientEmail: profile.email,
                            clientMobile: profile.mobile_number,
                            distributorClientId,
                        });
                    }
                } catch (syncErr) {
                    const syncMsg = syncErr instanceof Error ? syncErr.message : String(syncErr);
                    logger.error('MariaDB sync failed during final approval: ' + syncMsg);
                    throw new Error('Approval succeeded in Supabase but failed to sync to payments database: ' + syncMsg);
                }
            }

            let finalApprovalArchiveEmailSent = false;
            let finalApprovalArchiveEmailError: string | null = null;

            // Send documents ZIP to internal onboarding email (not to merchant)
            const documentsRecipientEmail =
                process.env.FINAL_APPROVAL_DOCUMENTS_EMAIL || 'vendor.onboarding@sabbpe.com';

            console.log(`📧 Documents ZIP recipient: ${documentsRecipientEmail}`);

            if (decision === 'approve') {
                const subject = `Merchant Final Approval — ${profile.business_name || profile.full_name || 'Merchant'} — Documents Attached`;

                let zipBuffer: Buffer | null = null;
                let zipCode = '';

                try {
                    // Step 1: Generate unique ZIP password (not stored)
                    zipCode = generateZipCode();
                    console.log(`🔐 Step 1: Generated ZIP code for merchant ${applicationId}`);

                    // Step 2: Download docs + video, create AES-256 encrypted ZIP
                    zipBuffer = await buildMerchantFinalApprovalZip(supabase, profile, zipCode);
                    console.log(`📦 Step 2: Encrypted ZIP ready (${zipBuffer.length} bytes)`);
                } catch (zipError) {
                    console.error('❌ Failed to build merchant documents ZIP:', zipError);
                    finalApprovalArchiveEmailError = 'Failed to build ZIP';
                }

                if (!finalApprovalArchiveEmailError && zipBuffer) {
                    // Step 3: Build approval email HTML with ZIP code shown prominently
                    const htmlBody = buildFinalApprovalEmailHtml(profile, applicationId, zipCode);
                    console.log(`📧 Step 3-4: Sending encrypted ZIP to ${documentsRecipientEmail}`);

                    const mailResult = await sendMailViaNotificationEngine({
                        to: documentsRecipientEmail,
                        subject,
                        htmlBody,
                        attachments: [{
                            filename: `sabbpe-documents-${profile.application_id || applicationId}.zip`,
                            content: zipBuffer,
                            contentType: 'application/zip',
                        }],
                    });

                    if (mailResult.sent) {
                        finalApprovalArchiveEmailSent = true;
                        console.log(`✅ Step 5: Email sent — recipient can open ZIP with code ${zipCode}`);
                        if (mailResult.via === 'smtp-fallback') {
                            console.warn('⚠️ Approval documents email delivered via SMTP fallback to:', documentsRecipientEmail);
                        }
                    } else {
                        finalApprovalArchiveEmailError = mailResult.error || 'Failed to send approval email';
                    }
                }
            }

            res.json({
                success: true,
                message: `Application ${decision}d successfully`,
                newStatus,
                finalApprovalArchiveEmailSent,
                finalApprovalArchiveEmailError
            });
        } catch (error) {
            next(error);
        }
    }
);
export default router;
// ============================================
// Bank: Send Agreement Link to Merchant
// ============================================
router.post(
    '/applications/send-agreement-link/:applicationId',
    verifyBankToken,
    async (req: BankUserRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { applicationId } = req.params;
            const { agreement_link } = req.body;

            if (!agreement_link) {
                res.status(400).json({ success: false, message: 'Agreement link is required' });
                return;
            }

            const supabase = getSupabaseClient();

            const { error } = await supabase
                .from('merchant_profiles')
                .update({
                    agreement_link,
                    onboarding_status: 'agreement_pending',
                    updated_at: new Date().toISOString()
                })
                .eq('id', applicationId);

            if (error) throw error;

            res.json({ success: true, message: 'Agreement link sent to merchant' });
        } catch (error) {
            next(error);
        }
    }
);
