import { Request, Response, NextFunction } from 'express';

import { sendMerchantInvite } from '../services/inviteService';

export const bulkSendInvites = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { merchants } = req.body;

    if (!merchants || !Array.isArray(merchants)) {
      return res.status(400).json({
        success: false,
        error: 'Merchants array is required'
      });
    }

    let sent = 0;
    let failed = 0;
    const results = [];

    for (const merchant of merchants) {
      try {
        const { fullName, mobileNumber, email } = merchant;

        if (!fullName || !mobileNumber || !email) {
          failed++;
          results.push({
            merchant: fullName || email,
            success: false,
            error: 'Missing required fields'
          });
          continue;
        }

        // Generate invite link (placeholder - you might want to create actual invite tokens)
        const inviteLink = `${process.env.VITE_FRONTEND_URL || 'http://localhost:5173'}/invite?email=${encodeURIComponent(email)}&name=${encodeURIComponent(fullName)}`;

        // Send SMS invite
        const smsResult = await sendMerchantInvite(mobileNumber, inviteLink, fullName);

        if (smsResult.success) {
          sent++;
          results.push({
            merchant: fullName,
            success: true,
            message: 'SMS sent successfully'
          });
        } else {
          failed++;
          results.push({
            merchant: fullName,
            success: false,
            error: smsResult.error
          });
        }
      } catch (error) {
        failed++;
        results.push({
          merchant: merchant.fullName || merchant.email,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return res.json({
      success: true,
      sent,
      failed,
      results
    });
  } catch (err) {
    return next(err);
  }
};