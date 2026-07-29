import { Request, Response, NextFunction } from 'express';
import { sendWhatsAppTemplate } from '../services/whatsappService';

// simple in-memory store for OTPs: map phone -> { otp, expiresAt }
const otpStore: Map<string, { otp: string; expiresAt: number }> = new Map();

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

const generateOtp = (digits = 4) => {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
};

export const sendOtp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { to, templateName, namespace } = req.body;
    if (!to) {
      return res.status(400).json({ success: false, error: 'Missing "to" phone number' });
    }

    const otp = generateOtp(4);

    // store OTP
    otpStore.set(to, { otp, expiresAt: Date.now() + OTP_TTL_MS });

    // send via MSG91 template - supply OTP as first body value
    const tpl = templateName || process.env.MSG91_TEMPLATE_NAME || 'ekyc_verification';
    const ns = namespace || process.env.MSG91_NAMESPACE || '';

    const result = await sendWhatsAppTemplate(to, tpl, ns, [otp]);

    if (!result.success) {
      // include backend provider response for debugging in development
      const payload: any = { success: false, error: result.error || 'Failed to send OTP' };
      if (result.status) payload.providerResponse = result.status;
      return res.status(500).json(payload);
    }

    // success - include provider response when in development to help debugging delivery issues
    const respPayload: any = { success: true, message: 'OTP sent', otpSent: true };
    // include provider response for debugging
    respPayload.providerResponse = result.status;

    // For development only: include the OTP so you can verify delivery without WhatsApp
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG_INCLUDE_OTP === 'true') {
      respPayload.debugOtp = otp;
      // Removed console.log for security - OTP should only be in WhatsApp
    }

    return res.json(respPayload);
  } catch (err) {
    return next(err);
  }
};

export const verifyOtp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { to, otp } = req.body;
    if (!to || !otp) {
      return res.status(400).json({ success: false, error: 'Missing parameters' });
    }

    const entry = otpStore.get(to);
    if (!entry) return res.status(400).json({ success: false, error: 'No OTP requested for this number' });

    if (Date.now() > entry.expiresAt) {
      otpStore.delete(to);
      return res.status(400).json({ success: false, error: 'OTP expired' });
    }

    const ok = String(otp).trim() === entry.otp;
    if (ok) {
      otpStore.delete(to);
      return res.json({ success: true, verified: true });
    }

    return res.status(400).json({ success: false, verified: false, error: 'OTP mismatch' });
  } catch (err) {
    return next(err);
  }
};
