// src/routes/webhook.ts
import { Router } from 'express';
import { webhookController } from '../controllers/webhookController';
import { verifyWebhookSignature, verifyWebhookApiKey } from '../middleware/webhookAuth';

const router = Router();

// Bank webhook (with signature verification)
router.post(
    '/bank',
    verifyWebhookSignature,
    (req, res, next) => webhookController.handleBankWebhook(req, res, next)
);

// Transaction webhook (with API key auth)
router.post(
    '/transaction',
    verifyWebhookApiKey,
    (req, res, next) => webhookController.handleTransactionWebhook(req, res, next)
);

// Test transaction webhook (development only — no auth)
router.post(
    '/transaction/test',
    (req, res, next) => webhookController.testTransactionWebhook(req, res, next)
);

// Test webhook (development only)
router.post(
    '/test',
    (req, res, next) => webhookController.testWebhook(req, res, next)
);

export default router;