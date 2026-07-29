// src/services/notifications.ts
import { MerchantProfile, OnboardingStatus } from '../types/merchant';
import { logger } from '../utils/logger';
import nodemailer from 'nodemailer';

export interface NotificationPayload {
    to: string;
    subject: string;
    body: string;
    type: 'email' | 'sms' | 'push';
}

const getTransporter = () => {
    const emailHost = process.env.EMAIL_HOST || 'smtppro.zoho.in';
    const emailPort = parseInt(process.env.EMAIL_PORT || '465');
    const emailUser = process.env.EMAIL_USER || 'payments@sabbpe.com';
    const emailPass = process.env.EMAIL_PASS;

    if (!emailPass) {
        logger.error('EMAIL_PASS environment variable is not set. Emails will fail.');
    }

    return nodemailer.createTransport({
        host: emailHost,
        port: emailPort,
        secure: emailPort === 465 || process.env.EMAIL_SECURE === 'true',
        auth: {
            user: emailUser,
            pass: emailPass || '',
        },
    });
};

export class NotificationService {
    /**
     * Send notification to merchant about status change
     */
    async notifyMerchantStatusChange(
        merchant: MerchantProfile,
        oldStatus: OnboardingStatus,
        newStatus: OnboardingStatus
    ): Promise<void> {
        const notification = this.buildStatusChangeNotification(
            merchant,
            oldStatus,
            newStatus
        );

        await this.sendNotification(notification);

        // If approved, also send internal notification to onboarding team
        if (newStatus === 'approved') {
            await this.notifyOnboardingTeamApproval(merchant);
        }

        logger.info('Status change notification sent', {
            merchantId: merchant.id,
            email: merchant.email,
            oldStatus,
            newStatus
        });
    }

    /**
     * Send detailed internal notification to onboarding@sabbpe.com on approval
     */
    async notifyOnboardingTeamApproval(merchant: MerchantProfile): Promise<void> {
        const onboardingEmail = 'vendor.onboarding@sabbpe.com';

        // Build documents HTML table
        const documentsHtml = merchant.documents && merchant.documents.length > 0
            ? `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%">
                <thead style="background:#f0f0f0">
                    <tr>
                        <th>Document Type</th>
                        <th>File Name</th>
                        <th>Status</th>
                        <th>Link</th>
                    </tr>
                </thead>
                <tbody>
                    ${merchant.documents.map(doc => `
                    <tr>
                        <td>${doc.document_type || doc.type || '-'}</td>
                        <td>${doc.file_name || '-'}</td>
                        <td>${doc.status || '-'}</td>
                        <td>${doc.file_path || doc.url
                            ? `<a href="${doc.file_path || doc.url}">View</a>`
                            : '-'}</td>
                    </tr>`).join('')}
                </tbody>
               </table>`
            : '<p>No documents uploaded.</p>';

        // Build selected products HTML table
        const productsHtml = merchant.selected_products && merchant.selected_products.length > 0
            ? `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%">
                <thead style="background:#f0f0f0">
                    <tr>
                        <th>Product</th>
                        <th>Code</th>
                        <th>Pricing Type</th>
                        <th>Price (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    ${merchant.selected_products.map(p => `
                    <tr>
                        <td>${p.product_name}</td>
                        <td>${p.product_code}</td>
                        <td>${p.pricing_type}</td>
                        <td>${p.price}</td>
                    </tr>`).join('')}
                </tbody>
               </table>
               <p><strong>Monthly Total:</strong> ₹${merchant.total_monthly_cost || 0} &nbsp;|&nbsp;
               <strong>One-time Total:</strong> ₹${merchant.total_onetime_cost || 0} &nbsp;|&nbsp;
               <strong>Integration Total:</strong> ₹${merchant.total_integration_cost || 0}</p>`
            : '<p>No products selected.</p>';

        const html = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:auto">
            <div style="background:#1a56db;padding:20px;border-radius:8px 8px 0 0">
                <h2 style="color:#fff;margin:0">✅ New Merchant Approved — Action Required</h2>
                <p style="color:#cce0ff;margin:4px 0 0">Please complete onboarding for the merchant below.</p>
            </div>

            <div style="border:1px solid #ddd;border-top:none;padding:24px;border-radius:0 0 8px 8px">

                <h3 style="color:#1a56db">👤 Personal Details</h3>
                <table cellpadding="6" style="width:100%">
                    <tr><td><strong>Full Name</strong></td><td>${merchant.full_name || '-'}</td></tr>
                    <tr><td><strong>Email</strong></td><td>${merchant.email || '-'}</td></tr>
                    <tr><td><strong>Mobile</strong></td><td>${merchant.mobile_number || merchant.phone || '-'}</td></tr>
                    <tr><td><strong>PAN</strong></td><td>${merchant.pan_number || '-'}</td></tr>
                    <tr><td><strong>Aadhaar</strong></td><td>${merchant.aadhaar_number || '-'}</td></tr>
                </table>

                <h3 style="color:#1a56db">🏢 Business Details</h3>
                <table cellpadding="6" style="width:100%">
                    <tr><td><strong>Business Name</strong></td><td>${merchant.business_name || '-'}</td></tr>
                    <tr><td><strong>Business Type</strong></td><td>${merchant.businessType || '-'}</td></tr>
                    <tr><td><strong>GST Number</strong></td><td>${merchant.gst_number || '-'}</td></tr>
                    <tr><td><strong>Registration No.</strong></td><td>${merchant.registrationNumber || '-'}</td></tr>
                    <tr><td><strong>Website</strong></td><td>${merchant.website || '-'}</td></tr>
                </table>

                <h3 style="color:#1a56db">📍 Address</h3>
                <table cellpadding="6" style="width:100%">
                    <tr><td><strong>Address Line 1</strong></td><td>${merchant.addressLine1 || '-'}</td></tr>
                    <tr><td><strong>Address Line 2</strong></td><td>${merchant.addressLine2 || '-'}</td></tr>
                    <tr><td><strong>City</strong></td><td>${merchant.city || '-'}</td></tr>
                    <tr><td><strong>State</strong></td><td>${merchant.state || '-'}</td></tr>
                    <tr><td><strong>Postal Code</strong></td><td>${merchant.postalCode || '-'}</td></tr>
                    <tr><td><strong>Country</strong></td><td>${merchant.country || '-'}</td></tr>
                </table>

                <h3 style="color:#1a56db">📦 Selected Products</h3>
                ${productsHtml}

                <h3 style="color:#1a56db">📄 Documents</h3>
                ${documentsHtml}

                <h3 style="color:#1a56db">📋 Agreement & Metadata</h3>
                <table cellpadding="6" style="width:100%">
                    <tr><td><strong>Agreement Signed</strong></td><td>${merchant.agreement_signed ? 'Yes' : 'No'}</td></tr>
                    <tr><td><strong>Agreement Signed At</strong></td><td>${merchant.agreement_signed_at || '-'}</td></tr>
                    <tr><td><strong>Agreement IP</strong></td><td>${merchant.agreement_ip_address || '-'}</td></tr>
                    <tr><td><strong>Submitted At</strong></td><td>${merchant.submittedAt || '-'}</td></tr>
                    <tr><td><strong>Merchant ID</strong></td><td>${merchant.id}</td></tr>
                    <tr><td><strong>User ID</strong></td><td>${merchant.user_id}</td></tr>
                </table>

                <br>
                <p style="color:#888;font-size:12px">This is an automated internal notification from the SabbPe Onboarding System.</p>
            </div>
        </div>`;

        try {
            const transporter = getTransporter();
            await transporter.sendMail({
                from: `"SabbPe Payments" <payments@sabbpe.com>`,
                to: onboardingEmail,
                subject: `✅ Merchant Approved: ${merchant.business_name || merchant.full_name} — Action Required`,
                html,
            });
            logger.info('Internal onboarding notification sent', {
                merchantId: merchant.id,
                to: onboardingEmail
            });
        } catch (error) {
            logger.error('Failed to send internal onboarding notification: ' + String(error));
        }
    }

    /**
     * Build notification for status change
     */
    private buildStatusChangeNotification(
        merchant: MerchantProfile,
        oldStatus: OnboardingStatus,
        newStatus: OnboardingStatus
    ): NotificationPayload {
        const subject = this.getSubjectForStatus(newStatus);
        const body = this.getBodyForStatus(merchant, newStatus);

        return {
            to: merchant.email,
            subject,
            body,
            type: 'email'
        };
    }

    /**
     * Get email subject for status
     */
    private getSubjectForStatus(status: OnboardingStatus): string {
        const subjects: Record<OnboardingStatus, string> = {
            draft: 'Application Saved as Draft',
            submitted: 'Application Submitted Successfully',
            validating: 'Application Under Review',
            pending_bank_approval: 'Bank Approval Pending',
            approved: 'Application Approved!',
            rejected: 'Application Requires Updates',
            validation_failed: 'Validation Failed',
            bank_rejected: 'Bank Approval Declined',
            verified: 'Account Verified'
        };

        return subjects[status];
    }

    /**
     * Get email body for status
     */
    private getBodyForStatus(
        merchant: MerchantProfile,
        status: OnboardingStatus
    ): string {
        const bodies: Record<OnboardingStatus, string> = {
            draft: `Hi ${merchant.business_name}...`,
            submitted: `Hi ${merchant.business_name}...`,
            validating: `Hi ${merchant.business_name}...`,
            pending_bank_approval: `Hi ${merchant.business_name}...`,
            approved: `Hi ${merchant.business_name}...`,
            rejected: `Hi ${merchant.business_name}...`,
            validation_failed: `Hi ${merchant.business_name}, your application failed validation...`,
            bank_rejected: `Hi ${merchant.business_name}, bank approval was declined...`,
            verified: `Hi ${merchant.business_name}, your account is now verified!`
        };

        return bodies[status];
    }

    /**
     * Send notification via real email
     */
    private async sendNotification(notification: NotificationPayload): Promise<void> {
        logger.debug('Sending notification', {
            to: notification.to,
            subject: notification.subject,
            type: notification.type
        });

        try {
            const transporter = getTransporter();
            await transporter.sendMail({
                from: `"SabbPe Payments" <payments@sabbpe.com>`,
                to: notification.to,
                subject: notification.subject,
                html: `<div style="font-family:Arial,sans-serif">${notification.body}</div>`,
            });
            logger.info(`Email sent to ${notification.to}: ${notification.subject}`);
        } catch (error) {
            logger.error('Failed to send email notification to ' + notification.to + ': ' + String(error));
        }
    }

    /**
     * Send admin notification
     */
    async notifyAdminNewSubmission(merchant: MerchantProfile): Promise<void> {
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@sabbpe.com';

        const notification: NotificationPayload = {
            to: adminEmail,
            subject: 'New merchant application submitted',
            body: `A new merchant application has been submitted:<br><br>
                   <strong>Business:</strong> ${merchant.business_name}<br>
                   <strong>Email:</strong> ${merchant.email}<br>
                   <strong>Submitted:</strong> ${merchant.submittedAt}`,
            type: 'email'
        };

        await this.sendNotification(notification);

        logger.info('Admin notification sent', {
            merchantId: merchant.id,
            adminEmail
        });
    }

    /**
     * Send merchant credentials email after distributor creates the merchant
     */
    async sendMerchantCredentialsEmail(params: {
        merchantEmail: string;
        merchantName: string;
        password: string;
        commission?: number;
        distributorName?: string;
    }): Promise<void> {
        const { merchantEmail, merchantName, password, commission, distributorName } = params;

        const loginUrl = process.env.VITE_FRONTEND_URL
            ? `${process.env.VITE_FRONTEND_URL.includes('://') ? '' : 'https://'}${process.env.VITE_FRONTEND_URL}/auth`
            : 'https://onboarding.sabbpe.com/auth';

        const commissionText = commission != null ? `${commission}%` : 'Not set';

        const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
            <div style="background:#1a56db;padding:20px;border-radius:8px 8px 0 0">
                <h2 style="color:#fff;margin:0">Welcome to SabbPe!</h2>
                <p style="color:#cce0ff;margin:4px 0 0">Your merchant account has been created.</p>
            </div>

            <div style="border:1px solid #ddd;border-top:none;padding:24px;border-radius:0 0 8px 8px">
                <p style="color:#333;font-size:15px">Hi <strong>${merchantName}</strong>,</p>
                
                <p style="color:#333;font-size:14px">
                    Your merchant account has been created by${distributorName ? ` <strong>${distributorName}</strong>` : ' your distributor'}.
                    Please use the following credentials to log in:
                </p>

                <div style="background:#f0f7ff;border:1px solid #b3d4fc;border-radius:8px;padding:16px;margin:16px 0">
                    <h3 style="color:#1a56db;margin:0 0 12px 0;font-size:16px">Your Login Credentials</h3>
                    <table cellpadding="6" style="width:100%;font-size:14px">
                        <tr>
                            <td style="color:#555;font-weight:bold;width:120px">Email</td>
                            <td style="color:#111">${merchantEmail}</td>
                        </tr>
                        <tr>
                            <td style="color:#555;font-weight:bold">Password</td>
                            <td style="color:#111;font-family:monospace;background:#fff;padding:4px 8px;border-radius:4px;border:1px solid #ddd;display:inline-block">${password}</td>
                        </tr>
                        <tr>
                            <td style="color:#555;font-weight:bold">Commission</td>
                            <td style="color:#1a56db;font-weight:bold">${commissionText}</td>
                        </tr>
                    </table>
                </div>

                <div style="text-align:center;margin:24px 0">
                    <a href="${loginUrl}" style="background:#1a56db;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block">
                        Login to Your Dashboard
                    </a>
                </div>

                <p style="color:#888;font-size:13px;margin-top:24px;border-top:1px solid #eee;padding-top:16px">
                    For any issues, please contact us at <a href="mailto:onboarding@sabbpe.com" style="color:#1a56db">onboarding@sabbpe.com</a>
                </p>

                <p style="color:#aaa;font-size:11px;margin-top:8px">
                    This is an automated email from SabbPe Onboarding System.
                </p>
            </div>
        </div>`;

        try {
            if (!process.env.EMAIL_PASS) {
                logger.error('Cannot send credentials email: EMAIL_PASS is not configured');
                return;
            }

            const transporter = getTransporter();
            const info = await transporter.sendMail({
                from: `"SabbPe Payments" <payments@sabbpe.com>`,
                to: merchantEmail,
                subject: `Welcome to SabbPe — Your Login Credentials`,
                html,
            });
            logger.info('Merchant credentials email sent', {
                merchantEmail,
                commission: commissionText,
                messageId: info.messageId,
            });
        } catch (error) {
            logger.error('Failed to send merchant credentials email: ' + String(error));
            logger.error('Email config check: HOST=' + (process.env.EMAIL_HOST || 'smtppro.zoho.in') + ', PORT=' + (process.env.EMAIL_PORT || '465') + ', USER=' + (process.env.EMAIL_USER || 'payments@sabbpe.com') + ', PASS_SET=' + (!!process.env.EMAIL_PASS));
        }
    }

    /**
     * Send distributor credentials email after admin approves the agreement
     */
    async sendDistributorCredentialsEmail(params: {
        distributorEmail: string;
        distributorName: string;
        password: string;
    }): Promise<void> {
        const { distributorEmail, distributorName, password } = params;

        const loginUrl = process.env.VITE_FRONTEND_URL
            ? `${process.env.VITE_FRONTEND_URL.includes('://') ? '' : 'https://'}${process.env.VITE_FRONTEND_URL}/auth`
            : 'https://onboarding.sabbpe.com/auth';

        const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
            <div style="background:#1a56db;padding:20px;border-radius:8px 8px 0 0">
                <h2 style="color:#fff;margin:0">Your Distributor Account is Ready!</h2>
                <p style="color:#cce0ff;margin:4px 0 0">Your agreement has been approved. Use the credentials below to log in.</p>
            </div>
            <div style="border:1px solid #ddd;border-top:none;padding:24px;border-radius:0 0 8px 8px">
                <p style="color:#333;font-size:15px">Hi <strong>${distributorName}</strong>,</p>
                <p style="color:#333;font-size:14px">Your SabbPe distributor account is ready. Please log in with the following credentials:</p>
                <div style="background:#f0f7ff;border:1px solid #b3d4fc;border-radius:8px;padding:16px;margin:16px 0">
                    <h3 style="color:#1a56db;margin:0 0 12px 0;font-size:16px">Your Login Credentials</h3>
                    <table cellpadding="6" style="width:100%;font-size:14px">
                        <tr>
                            <td style="color:#555;font-weight:bold;width:120px">Email</td>
                            <td style="color:#111">${distributorEmail}</td>
                        </tr>
                        <tr>
                            <td style="color:#555;font-weight:bold">Password</td>
                            <td style="color:#111;font-family:monospace;background:#fff;padding:4px 8px;border-radius:4px;border:1px solid #ddd;display:inline-block">${password}</td>
                        </tr>
                    </table>
                </div>
                <div style="text-align:center;margin:24px 0">
                    <a href="${loginUrl}" style="background:#1a56db;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block">Login to Your Dashboard</a>
                </div>
                <p style="color:#888;font-size:13px;margin-top:24px;border-top:1px solid #eee;padding-top:16px">For any issues, contact us at <a href="mailto:onboarding@sabbpe.com" style="color:#1a56db">onboarding@sabbpe.com</a></p>
                <p style="color:#aaa;font-size:11px;margin-top:8px">This is an automated email from SabbPe Onboarding System.</p>
            </div>
        </div>`;

        try {
            if (!process.env.EMAIL_PASS) {
                logger.error('Cannot send distributor credentials email: EMAIL_PASS is not configured');
                return;
            }

            const transporter = getTransporter();
            const info = await transporter.sendMail({
                from: '"SabbPe Payments" <payments@sabbpe.com>',
                to: distributorEmail,
                subject: 'Your SabbPe Distributor Account Credentials',
                html,
            });
            logger.info('Distributor credentials email sent', {
                distributorEmail,
                messageId: info.messageId,
            });
        } catch (error) {
            logger.error('Failed to send distributor credentials email: ' + String(error));
        }
    }

    /**
     * Send employee credentials email after admin creates the employee
     */
    async sendEmployeeCredentialsEmail(params: {
        employeeEmail: string;
        employeeName: string;
        password: string;
    }): Promise<void> {
        const { employeeEmail, employeeName, password } = params;

        const loginUrl = process.env.VITE_FRONTEND_URL
            ? `${process.env.VITE_FRONTEND_URL.includes('://') ? '' : 'https://'}${process.env.VITE_FRONTEND_URL}/auth`
            : 'https://onboarding.sabbpe.com/auth';

        const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
            <div style="background:#059669;padding:20px;border-radius:8px 8px 0 0">
                <h2 style="color:#fff;margin:0">Welcome to SabbPe — Employee Account</h2>
                <p style="color:#a7f3d0;margin:4px 0 0">Your employee account has been created.</p>
            </div>
            <div style="border:1px solid #ddd;border-top:none;padding:24px;border-radius:0 0 8px 8px">
                <p style="color:#333;font-size:15px">Hi <strong>${employeeName}</strong>,</p>
                <p style="color:#333;font-size:14px">Your SabbPe employee account is ready. Please log in with the following credentials:</p>
                <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:8px;padding:16px;margin:16px 0">
                    <h3 style="color:#059669;margin:0 0 12px 0;font-size:16px">Your Login Credentials</h3>
                    <table cellpadding="6" style="width:100%;font-size:14px">
                        <tr>
                            <td style="color:#555;font-weight:bold;width:120px">Email</td>
                            <td style="color:#111">${employeeEmail}</td>
                        </tr>
                        <tr>
                            <td style="color:#555;font-weight:bold">Password</td>
                            <td style="color:#111;font-family:monospace;background:#fff;padding:4px 8px;border-radius:4px;border:1px solid #ddd;display:inline-block">${password}</td>
                        </tr>
                    </table>
                </div>
                <div style="text-align:center;margin:24px 0">
                    <a href="${loginUrl}" style="background:#059669;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block">Login to Your Dashboard</a>
                </div>
                <p style="color:#888;font-size:13px;margin-top:24px;border-top:1px solid #eee;padding-top:16px">For any issues, contact us at <a href="mailto:onboarding@sabbpe.com" style="color:#059669">onboarding@sabbpe.com</a></p>
                <p style="color:#aaa;font-size:11px;margin-top:8px">This is an automated email from SabbPe Onboarding System.</p>
            </div>
        </div>`;

        try {
            if (!process.env.EMAIL_PASS) {
                logger.error('Cannot send employee credentials email: EMAIL_PASS is not configured');
                return;
            }

            const transporter = getTransporter();
            const info = await transporter.sendMail({
                from: '"SabbPe Payments" <payments@sabbpe.com>',
                to: employeeEmail,
                subject: 'Welcome to SabbPe — Your Employee Account Credentials',
                html,
            });
            logger.info('Employee credentials email sent', {
                employeeEmail,
                messageId: info.messageId,
            });
        } catch (error) {
            logger.error('Failed to send employee credentials email: ' + String(error));
        }
    }

    /**
     * Send invitation email to merchant from distributor
     */
    async sendMerchantInviteEmail(params: {
        merchantEmail: string;
        merchantName: string;
        inviteLink: string;
        distributorName: string;
    }): Promise<void> {
        const { merchantEmail, merchantName, inviteLink, distributorName } = params;

        const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
            <div style="background:#1a56db;padding:20px;border-radius:8px 8px 0 0">
                <h2 style="color:#fff;margin:0">You're Invited to SabbPe!</h2>
                <p style="color:#cce0ff;margin:4px 0 0">Complete your merchant onboarding</p>
            </div>

            <div style="border:1px solid #ddd;border-top:none;padding:24px;border-radius:0 0 8px 8px">
                <p style="color:#333;font-size:15px">Hi <strong>${merchantName}</strong>,</p>
                
                <p style="color:#333;font-size:14px">
                    <strong>${distributorName}</strong> has invited you to join SabbPe as a merchant.
                    Click the button below to start your onboarding process:
                </p>

                <div style="text-align:center;margin:30px 0">
                    <a href="${inviteLink}" style="background:#1a56db;color:#fff;padding:14px 36px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;display:inline-block">
                        Start Onboarding
                    </a>
                </div>

                <p style="color:#666;font-size:13px;text-align:center">
                    Or copy this link: <a href="${inviteLink}" style="color:#1a56db">${inviteLink}</a>
                </p>

                <p style="color:#888;font-size:13px;margin-top:24px;border-top:1px solid #eee;padding-top:16px">
                    If you did not expect this invitation, please ignore this email.
                </p>

                <p style="color:#aaa;font-size:11px;margin-top:8px">
                    This is an automated email from SabbPe Onboarding System.
                </p>
            </div>
        </div>`;

        try {
            const transporter = getTransporter();
            await transporter.sendMail({
                from: `"SabbPe Payments" <payments@sabbpe.com>`,
                to: merchantEmail,
                subject: `${distributorName} invited you to join SabbPe`,
                html,
            });
            logger.info('Merchant invite email sent', { merchantEmail, distributorName });
        } catch (error) {
            logger.error('Failed to send merchant invite email: ' + String(error));
        }
    }
}

export const notificationService = new NotificationService();
