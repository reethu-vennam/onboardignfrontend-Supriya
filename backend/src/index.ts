// backend/src/index.ts

import dotenv from 'dotenv';
dotenv.config();
console.log('🔍 ENV Check:');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'PRESENT' : 'MISSING');
console.log('SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'PRESENT' : 'MISSING');
console.log('PORT:', process.env.PORT);
import express, { Express, Request, Response, NextFunction } from 'express';

import authRoutes from './routes/auth';
import merchantRoutes from './routes/merchant';
import supportRoutes from './routes/support';
import adminRoutes from './routes/admin';
import webhookRoutes from './routes/webhook';
import productRoutes from './routes/products';
import supabaseRoutes from './routes/supabase';  // ? Added
import bankRoutes from './routes/bank';
import transactionRoutes from './routes/transaction';
import paymentRoutes from './routes/payment';
import whatsappRoutes from './routes/whatsapp';
import invitesRoutes from './routes/invites';
import distributorRoutes from './routes/distributor';
import distributorProfileRoutes from './routes/distributorProfile';
import demoRoutes from './routes/demo';           // ← ADDED
import chatRoutes from './routes/chat';
import sttRoutes from './routes/stt';
import chargebackRoutes from './routes/chargeback';
import settlementRoutes from './routes/settlement';
import distributorOnboardingRoutes from './routes/distributorOnboarding';
import employeeRoutes from './routes/employee';
import fillRoutes from './routes/fill';
import { transbankService } from './services/transbankService';
import { startScheduler } from './services/settlementScheduler';
import { startReserveReleaseScheduler } from './services/reserveReleaseScheduler';
import { logger } from './utils/logger';
import {
    AppError,
    isOperationalError
} from './utils/errors';

// Load environment variables
// dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 8080;

// Handle unhandled rejections and uncaught exceptions
process.on('unhandledRejection', (reason: unknown) => {
    logger.error(
        'Unhandled Promise Rejection',
        reason instanceof Error ? reason : undefined
    );

    if (reason instanceof Error && !isOperationalError(reason)) {
        process.exit(1);
    }
});

process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', error);
    process.exit(1);
});

// Middleware

const DEFAULT_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:8877',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3002',
    'http://127.0.0.1:3003',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:8877',
    'https://onboarding.sabbpe.com',
    'https://bank.sabbpe.com',
    'https://support.sabbpe.com',
];

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
    .split(',')
    .map(origin => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
    .filter((origin, index, origins) => origins.indexOf(origin) === index);

const getRequestOrigin = (originHeader: string | string[] | undefined): string | undefined => {
    if (!originHeader) {
        return undefined;
    }

    const originValue = Array.isArray(originHeader) ? originHeader.join(',') : originHeader;
    const [firstOrigin] = originValue.split(',').map(origin => origin.trim()).filter(Boolean);
    return firstOrigin?.replace(/\/$/, '');
};

app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = getRequestOrigin(req.headers.origin);

    res.removeHeader('Access-Control-Allow-Origin');
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,X-Language,X-Demo-Key');

    if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }
    next();
});

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '50mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.URLENCODED_BODY_LIMIT || '50mb' }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.request(
            req.method,
            req.path,
            res.statusCode,
            duration
        );
    });

    next();
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/merchant', merchantRoutes);
app.use('/api/merchants', merchantRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/supabase', supabaseRoutes);
app.use('/api/bank', bankRoutes);// ? Added
app.use('/api/transaction', transactionRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/products', productRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/invites', invitesRoutes);
app.use('/api/distributor', distributorRoutes);
app.use('/api/distributor/profile', distributorProfileRoutes);
app.use('/api/distributor/onboarding', distributorOnboardingRoutes);
app.use('/api/demo', demoRoutes);                 // ← ADDED
app.use('/api/chat', chatRoutes);
app.use('/api/stt', sttRoutes);
app.use('/api/chargeback', chargebackRoutes);
app.use('/api/settlement', settlementRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api', fillRoutes);

// Direct bank account validation endpoint
app.post('/api/v1/token/generate', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const token = await transbankService.generateToken();
        if (token) res.json({ success: true, data: { token } });
        else res.status(500).json({ success: false, error: { message: 'Failed to generate token' } });
    } catch (error) { next(error); }
});

app.post('/api/bank-account-validation', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { requestId, custName, custIfsc, custAcctNo, trackingRefNo, txnType, token } = req.body;
        if (!custName || !custIfsc || !custAcctNo) {
            res.status(400).json({ success: false, error: { message: 'custName, custIfsc and custAcctNo are required' } });
            return;
        }
        const result = await transbankService.validateBankAccount({
            accountHolderName: custName,
            ifscCode: custIfsc,
            accountNumber: custAcctNo,
            requestId,
            trackingRefNo,
            txnType,
        }, token);
        const payload = {
            isValid: result.isValid,
            accountName: result.accountName || null,
            accountStatus: result.accountStatus || null,
            requestId: result.requestId || null,
            trackingRefNo: result.trackingRefNo || null,
            responseId: result.responseId || null,
            statusCode: result.statusCode || null,
            status: result.status || null,
            message: result.message || null,
            error: result.error || null,
        };
        if (!result.isValid) {
            res.status(200).json({ success: false, data: payload });
            return;
        }
        res.json({ success: true, data: payload });
    } catch (error) { next(error); }
});

app.use((req: Request, res: Response) => {
    logger.warn(`Route not found: ${req.method} ${req.path}`);

    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: `Route ${req.method} ${req.path} not found`
        }
    });
});

// Global error handler
app.use((err: Error | AppError, req: Request, res: Response, next: NextFunction) => {
    const context = {
        method: req.method,
        path: req.path,
        user_id: req.user?.user_id
    };

    if ((err as any).type === 'entity.too.large' || (err as any).status === 413) {
        logger.warn('Request payload too large', {
            ...context,
            limit: (err as any).limit,
            length: (err as any).length,
        });

        res.status(413).json({
            success: false,
            error: {
                code: 'PAYLOAD_TOO_LARGE',
                message: 'Uploaded files are too large. Please reduce the file size and try again.'
            }
        });
        return;
    }

    if (err instanceof AppError) {
        logger.error(
            `Application error: ${err.message}`,
            err,
            {
                ...context,
                statusCode: err.statusCode,
                code: err.code
            }
        );

        res.status(err.statusCode).json(err.toJSON());
        return;
    }

    // Unexpected errors
    logger.error(
        `Unexpected error: ${err.message}`,
        err,
        context
    );

    res.status(500).json({
        success: false,
        error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected error occurred',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        }
    });
});

// Start server
app.listen(PORT, () => {
    logger.info('Server started successfully', {
        port: PORT,
        env: process.env.NODE_ENV || 'development',
        nodeVersion: process.version
    });

    // Start settlement schedulers (daily cron jobs)
    startScheduler();
    startReserveReleaseScheduler();

    console.log('');
    console.log('? SabbPe Backend Server Running');
    console.log('================================');
    console.log(`?? API: http://localhost:${PORT}/api`);
    console.log(`?? Health: http://localhost:${PORT}/health`);
    console.log(`?? Demo Quota: http://localhost:${PORT}/api/demo/quota`);   // ← ADDED
    console.log(`?? Supabase Webhook: http://localhost:${PORT}/api/supabase/merchant-webhook`);  // ? Added
    console.log(`?? Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('================================');
    console.log('');
});

export default app;
