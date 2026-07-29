import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

const router = Router();

type ChatRole = 'user' | 'assistant' | 'system';

interface ChatMessage {
    role: ChatRole;
    content: string;
}

interface GeminiPart {
    text?: string;
}

interface GeminiContent {
    role?: 'user' | 'model';
    parts?: GeminiPart[];
}

interface GeminiResponse {
    candidates?: Array<{
        content?: GeminiContent;
        finishReason?: string;
    }>;
    error?: {
        message?: string;
        status?: string;
    };
}

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

const SAHIL_SYSTEM_PROMPT = [
    'You are Sahil, a friendly SabbPe onboarding guide.',
    'Act like a helpful friend sitting beside the merchant, not like a manual.',
    'On the first message for any step, only greet, mention the current step, and ask how you can help.',
    'Do not list all instructions unless the merchant asks for help or asks what to choose.',
    'When the merchant asks for guidance, ask one simple question if needed, then suggest the next best action.',
    'Use plain text only. Do not use Markdown, bold text, asterisks, tables, or long lists.',
    'Use Indian English context. Keep replies under 55 words by default.',
    'Only answer questions related to SabbPe onboarding, KYC, documents, products, bank verification, agreement signing, payment gateway activation, and general support handoff.',
    'If a question needs account-specific or legal approval, ask the merchant to contact SabbPe support instead of guessing.',
    'Never ask for full Aadhaar, OTP, passwords, card PINs, API secrets, or other sensitive credentials.',
].join(' ');

function normalizeMessages(value: unknown): ChatMessage[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item): ChatMessage | null => {
            if (!item || typeof item !== 'object') {
                return null;
            }

            const raw = item as { role?: unknown; content?: unknown };
            if (typeof raw.content !== 'string' || !raw.content.trim()) {
                return null;
            }

            const role = raw.role === 'assistant' || raw.role === 'system' ? raw.role : 'user';
            return {
                role,
                content: raw.content.trim(),
            };
        })
        .filter((item): item is ChatMessage => Boolean(item))
        .slice(-12);
}

function toGeminiContents(messages: ChatMessage[]): GeminiContent[] {
    return messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }],
        }));
}

function getGeminiText(data: GeminiResponse): string {
    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts
        .map((part) => part.text || '')
        .join('')
        .trim();

    return text || 'Sorry, I could not generate a response. Please try again.';
}

function getMaxOutputTokens(value: unknown): number {
    const requested = Number(value);
    if (!Number.isFinite(requested) || requested <= 0) {
        return 120;
    }

    return Math.min(requested, 140);
}

function getFallbackModels(): string[] {
    const configured = process.env.GEMINI_FALLBACK_MODELS
        ?.split(',')
        .map((model) => model.trim())
        .filter(Boolean);

    return configured && configured.length > 0 ? configured : DEFAULT_FALLBACK_MODELS;
}

function shouldTryFallback(statusCode: number, status?: string): boolean {
    return statusCode === 404 ||
        statusCode === 429 ||
        statusCode === 503 ||
        status === 'NOT_FOUND' ||
        status === 'RESOURCE_EXHAUSTED' ||
        status === 'UNAVAILABLE';
}

router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startedAt = Date.now();

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            res.status(500).json({
                success: false,
                error: {
                    code: 'GEMINI_API_KEY_MISSING',
                    message: 'Gemini API key is not configured on the server',
                },
            });
            return;
        }

        const messages = normalizeMessages(req.body?.messages);
        if (messages.length === 0) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_CHAT_MESSAGES',
                    message: 'messages must include at least one user message',
                },
            });
            return;
        }

        const requestedModel = typeof req.body?.model === 'string' ? req.body.model.trim() : '';
        const primaryModel = requestedModel && requestedModel.startsWith('gemini-')
            ? requestedModel
            : process.env.GEMINI_MODEL || DEFAULT_MODEL;
        const modelsToTry = Array.from(new Set([primaryModel, ...getFallbackModels()]));

        const systemMessages = messages
            .filter((message) => message.role === 'system')
            .map((message) => message.content);

        let lastError: { statusCode: number; data: GeminiResponse; model: string } | null = null;

        for (const model of modelsToTry) {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
            const geminiResponse = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    systemInstruction: {
                        parts: [{ text: [SAHIL_SYSTEM_PROMPT, ...systemMessages].join('\n\n') }],
                    },
                    contents: toGeminiContents(messages),
                    generationConfig: {
                        temperature: 0.4,
                        maxOutputTokens: getMaxOutputTokens(req.body?.max_tokens),
                    },
                }),
            });

            const data = await geminiResponse.json() as GeminiResponse;
            logger.externalApi('Gemini', `/v1beta/models/${model}:generateContent`, Date.now() - startedAt, geminiResponse.status);

            if (geminiResponse.ok) {
                const reply = getGeminiText(data);
                res.json({
                    choices: [
                        {
                            message: {
                                role: 'assistant',
                                content: reply,
                            },
                        },
                    ],
                    model,
                });
                return;
            }

            lastError = { statusCode: geminiResponse.status, data, model };

            if (!shouldTryFallback(geminiResponse.status, data.error?.status)) {
                break;
            }

            logger.warn('Gemini model failed; trying fallback model', {
                model,
                statusCode: geminiResponse.status,
                status: data.error?.status,
            });
        }

        res.status(502).json({
            success: false,
            error: {
                code: lastError?.data.error?.status || 'GEMINI_REQUEST_FAILED',
                message: lastError?.data.error?.message || 'Gemini request failed',
                model: lastError?.model,
            },
        });
        return;
    } catch (error) {
        const errorToLog = error instanceof Error ? error : new Error('Sahil chat failed');
        logger.error('Sahil chat error', errorToLog);
        next(errorToLog);
    }
});

export default router;
