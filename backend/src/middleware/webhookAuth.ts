// src/middleware/webhookAuth.ts
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { UnauthorizedError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Verify webhook signature from bank API
 */
export const verifyWebhookSignature = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    try {
        const signature = req.headers['x-webhook-signature'] as string | undefined;
        const timestamp = req.headers['x-webhook-timestamp'] as string | undefined;

        if (!signature || !timestamp) {
            logger.warn('Webhook missing signature or timestamp', {
                path: req.path,
                hasSignature: !!signature,
                hasTimestamp: !!timestamp
            });

            throw new UnauthorizedError(
                'Webhook signature or timestamp missing',
                'MISSING_WEBHOOK_AUTH'
            );
        }

        // Verify timestamp is recent (within 5 minutes)
        const timestampMs = parseInt(timestamp, 10);
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;

        if (Math.abs(now - timestampMs) > fiveMinutes) {
            logger.warn('Webhook timestamp expired', {
                timestamp: timestampMs,
                now,
                difference: Math.abs(now - timestampMs)
            });

            throw new UnauthorizedError(
                'Webhook timestamp expired',
                'WEBHOOK_TIMESTAMP_EXPIRED'
            );
        }

        // Verify signature
        const webhookSecret = process.env.WEBHOOK_SECRET || 'default-webhook-secret';
        const payload = JSON.stringify(req.body);
        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(`${timestamp}.${payload}`)
            .digest('hex');

        if (signature !== expectedSignature) {
            logger.warn('Invalid webhook signature', {
                path: req.path,
                expectedSignature: expectedSignature.substring(0, 10) + '...',
                receivedSignature: signature.substring(0, 10) + '...'
            });

            throw new UnauthorizedError(
                'Invalid webhook signature',
                'INVALID_WEBHOOK_SIGNATURE'
            );
        }

        logger.debug('Webhook signature verified successfully', {
            path: req.path,
            timestamp: timestampMs
        });

        next();
    } catch (error) {
        if (error instanceof UnauthorizedError) {
            res.status(error.statusCode).json(error.toJSON());
            return;
        }

        logger.error('Webhook authentication error', error instanceof Error ? error : undefined);
        res.status(500).json({
            success: false,
            error: {
                code: 'WEBHOOK_AUTH_ERROR',
                message: 'Webhook authentication failed'
            }
        });
    }
};

/**
 * Optional: API key authentication for webhooks
 */
export const verifyWebhookApiKey = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    try {
        const apiKey = req.headers['x-api-key'] as string | undefined;
        const expectedApiKey = process.env.WEBHOOK_API_KEY;

        if (!apiKey) {
            throw new UnauthorizedError(
                'API key required',
                'MISSING_API_KEY'
            );
        }

        if (apiKey !== expectedApiKey) {
            logger.warn('Invalid webhook API key', {
                path: req.path
            });

            throw new UnauthorizedError(
                'Invalid API key',
                'INVALID_API_KEY'
            );
        }

        next();
    } catch (error) {
        if (error instanceof UnauthorizedError) {
            res.status(error.statusCode).json(error.toJSON());
            return;
        }

        res.status(500).json({
            success: false,
            error: {
                code: 'WEBHOOK_AUTH_ERROR',
                message: 'Webhook authentication failed'
            }
        });
    }
};