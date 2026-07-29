import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import {
    getOrCreateSession,
    processAnswer,
    getSessionState,
    clearSession,
    getGreeting,
} from '../services/fillState';

const router = Router();
const FILL_SESSION_ID = '_widget_fill_session';
const BUSINESS_STEPS = ['business-details', 'person-kyc', 'bank-details'];

router.post('/fill/start', async (req: Request, res: Response): Promise<void> => {
    try {
        const step = req.body?.step || 'business-details';
        clearSession(FILL_SESSION_ID);
        getOrCreateSession(FILL_SESSION_ID, step);
        res.json({ success: true, session_id: FILL_SESSION_ID, greeting: getGreeting(step) });
    } catch (error) {
        const err = error instanceof Error ? error : new Error('Fill start error');
        logger.error('Fill start error', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/fill/state', async (req: Request, res: Response): Promise<void> => {
    try {
        const state = getSessionState(FILL_SESSION_ID);
        if (!state) {
            res.json({ fields: {}, complete: false });
            return;
        }

        const pendingFields: Record<string, string> = {};
        for (const [key, value] of Object.entries(state.fields)) {
            if (key.startsWith('registeredAddress_') || ['businessName', 'mobileNumber', 'email', 'hasGST', 'gstNumber', 'businessWebsite', 'businessIndustry'].includes(key)) {
                pendingFields[key] = value;
            }
        }

        res.json({ fields: pendingFields, complete: state.complete });
    } catch (error) {
        const err = error instanceof Error ? error : new Error('Fill state error');
        logger.error('Fill state error', err);
        res.status(500).json({ fields: {}, complete: false, error: err.message });
    }
});

router.post('/chat/fill', async (req: Request, res: Response): Promise<void> => {
    try {
        const messages = req.body?.messages as Array<{ role: string; content: string }> | undefined;
        const step = req.body?.step || (req.headers['x-onboarding-step'] as string) || 'business-details';

        getOrCreateSession(FILL_SESSION_ID, step);

        const lastUserMsg = messages
            ?.filter(m => m.role === 'user')
            .slice(-1)[0]?.content?.trim();

        if (!lastUserMsg) {
        res.json({
            choices: [{
                message: { role: 'assistant', content: getGreeting(step) },
            }],
        });
            return;
        }

        const reply = processAnswer(FILL_SESSION_ID, lastUserMsg);
        const state = getSessionState(FILL_SESSION_ID);

        res.json({
            choices: [{
                message: { role: 'assistant', content: reply },
            }],
            _fill: state?.complete ? { fields: state.fields, complete: true } : undefined,
        });

        if (state?.complete) {
            setTimeout(() => clearSession(FILL_SESSION_ID), 5000);
        }
    } catch (error) {
        const err = error instanceof Error ? error : new Error('Fill error');
        logger.error('Fill endpoint error', err);
        res.status(500).json({
            success: false,
            error: { code: 'FILL_ERROR', message: err.message },
        });
    }
});

export default router;
