import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

const router = Router();

const WHISPER_SERVER_URL = process.env.WHISPER_SERVER_URL || 'http://127.0.0.1:9000/transcribe';
const STT_API_URL = process.env.STT_API_URL || 'https://stt.infillion.in/upload';
const AUDIO_BUCKET = 'chat-audio';
const SIGNED_URL_EXPIRY = 3600; // 1 hour

// Supported languages for STT (matches frontend widget)
const SUPPORTED_LANGUAGES = new Set([
    'en', 'hi', 'te', 'bn', 'ta', 'kn', 'ml', 'mr', 'gu', 'pa', 'ne', 'ur', 'sa', 'sd', 'or', 'as'
]);

// Map to STT API expected codes (e.g., en-IN, hi-IN, etc.)
function mapToSttLangCode(lang: string): string {
    const map: Record<string, string> = {
        'en': 'en-IN', 'hi': 'hi-IN', 'te': 'te-IN', 'bn': 'bn-IN',
        'ta': 'ta-IN', 'kn': 'kn-IN', 'ml': 'ml-IN', 'mr': 'mr-IN',
        'gu': 'gu-IN', 'pa': 'pa-IN', 'ne': 'ne-NP', 'ur': 'ur-PK',
        'sa': 'sa-IN', 'sd': 'sd-PK', 'or': 'or-IN', 'as': 'as-IN',
    };
    return map[lang] || 'en-IN';
}

function validateLanguage(lang: string): string {
    if (SUPPORTED_LANGUAGES.has(lang)) return lang;
    logger.warn(`Unsupported language requested: ${lang}, defaulting to English`);
    return 'en';
}

function getStorageSupabaseClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
}

// Transcribe audio using Gemini API (multimodal support - fallback when external STT fails)
async function transcribeWithGemini(audioBuffer: Buffer, langCode: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        logger.warn('Gemini fallback skipped: GEMINI_API_KEY not configured');
        return '';
    }

    try {
        const base64Audio = audioBuffer.toString('base64');
        const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        logger.info(`Gemini fallback: transcribing audio (${audioBuffer.length} bytes), lang=${langCode}`);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            inline_data: {
                                mime_type: 'audio/wav',
                                data: base64Audio,
                            },
                        },
                        {
                            text: `Transcribe this audio exactly as spoken. Language: ${langCode}. Return only the transcribed text, nothing else.`,
                        },
                    ],
                }],
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            logger.warn(`Gemini transcription failed (${response.status}): ${err}`);
            return '';
        }

        const result: any = await response.json();
        const text = result?.candidates?.[0]?.content?.parts?.[0]?.text as string;
        if (text && text.trim()) {
            logger.info(`Gemini fallback success: transcribed ${text.length} chars`);
            return text.trim();
        }

        logger.warn('Gemini transcription returned empty text');
        return '';
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`Gemini transcription error: ${msg}`);
        return '';
    }
}

async function storeChatAudioLog(
    audioBuffer: Buffer,
    transcript: string,
    language: string,
    headers: Record<string, string | string[] | undefined>
): Promise<void> {
    const supabase = getStorageSupabaseClient();
    if (!supabase) return;

    const sessionId = (headers['x-session-id'] as string) || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const onboardingStep = (headers['x-onboarding-step'] as string) || null;
    let userId: string | null = (headers['x-user-id'] as string) || null;

    if (!userId) {
        try {
            const authHeader = headers['authorization'] as string;
            if (authHeader?.startsWith('Bearer ')) {
                const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
                userId = user?.id || null;
            }
        } catch { /* ignore */ }
    }

    const timestamp = Date.now();
    const safeUserId = userId || 'anonymous';
    const storagePath = `${safeUserId}/${sessionId}/${timestamp}.wav`;

    await supabase.storage.createBucket('chat-audio', { public: false }).catch(() => {});

    const { error: uploadError } = await supabase.storage
        .from('chat-audio')
        .upload(storagePath, audioBuffer, { contentType: 'audio/wav', upsert: false });

    if (uploadError) {
        logger.warn(`Chat audio storage upload failed: ${uploadError.message || uploadError}`);
        return;
    }

    const { error: insertError } = await supabase
        .from('chat_audio_logs')
        .insert({
            user_id: userId,
            session_id: sessionId,
            audio_storage_path: storagePath,
            transcript,
            language,
            onboarding_step: onboardingStep,
        });

    if (insertError) {
        logger.warn(`Chat audio log insert failed: ${insertError.message || insertError}`);
    }
}

// Transcribe audio using external STT API (Infillion)
async function transcribeWithExternal(audioBuffer: Buffer, sttLangCode: string): Promise<string> {
    try {
        const boundary = '----SabbPeBoundary' + Date.now();
        const crlf = '\r\n';

        const parts: Buffer[] = [];
        parts.push(Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="text"${crlf}${crlf}${sttLangCode}${crlf}`));
        parts.push(Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="language"${crlf}${crlf}${sttLangCode}${crlf}`));
        parts.push(Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="audio"; filename="recording.wav"${crlf}Content-Type: audio/wav${crlf}${crlf}`));
        parts.push(audioBuffer);
        parts.push(Buffer.from(`${crlf}--${boundary}--${crlf}`));

        const body = Buffer.concat(parts);

        const resp = await axios.post(STT_API_URL, body, {
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
            timeout: 30000,
            maxRedirects: 0,
            responseType: 'text',
            transformResponse: [(data) => data],
        });

        if (resp.status < 200 || resp.status >= 300) {
            logger.warn(`External STT error: ${resp.status}`);
            return '';
        }

        const responseText = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
        let parsed: unknown;
        try { parsed = JSON.parse(responseText); } catch { return responseText.trim(); }

        const extractTranscript = (input: unknown): string => {
            if (!input) return '';
            if (typeof input === 'string') {
                const trimmed = input.trim();
                if (trimmed.startsWith('{')) {
                    try { const p = JSON.parse(trimmed); const n = extractTranscript(p); if (n) return n; } catch { return trimmed; }
                    return '';
                }
                return trimmed;
            }
            if (Array.isArray(input)) { for (const item of input) { const r = extractTranscript(item); if (r) return r; } return ''; }
            if (typeof input === 'object') {
                const obj = input as Record<string, unknown>;
                for (const key of ['translated text', 'translated_text', 'transcript', 'text', 'transcription', 'output_text', 'result', 'results', 'speech', 'utterance', 'message']) {
                    const v = obj[key]; if (typeof v === 'string' && v.trim()) return v.trim();
                    const n = extractTranscript(v); if (n) return n;
                }
                if ('data' in obj) { const n = extractTranscript(obj.data); if (n) return n; }
                if ('result' in obj) { const n = extractTranscript(obj.result); if (n) return n; }
                if ('alternatives' in obj) return extractTranscript(obj.alternatives);
            }
            return '';
        };

        const transcript = extractTranscript(parsed);
        return transcript;
    } catch (err: any) {
        logger.warn(`External STT error: ${err.message || err}`);
        return '';
    }
}

// Parse raw binary body for audio uploads (up to 10MB)
router.post('/', express.raw({ type: 'audio/*', limit: '10mb' }), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startedAt = Date.now();
    let source = '';

    try {
        const audioBuffer = req.body as Buffer;

        if (!audioBuffer || !Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
            res.status(400).json({
                success: false,
                error: { code: 'MISSING_AUDIO', message: 'audio body is required' },
            });
            return;
        }

        const rawLang = (req.headers['x-language'] as string) || 'en';
        const lang = validateLanguage(rawLang);
        const sttLangCode = mapToSttLangCode(lang);

        logger.info(`STT proxy: received ${audioBuffer.length} bytes, lang=${lang}, sttLang=${sttLangCode}`);

        // 1. Try local Whisper server
        let transcript = '';

        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                logger.info(`Whisper STT attempt ${attempt}: calling ${WHISPER_SERVER_URL}`);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000);

                const whisperResp = await fetch(WHISPER_SERVER_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'audio/wav', 'x-language': lang },
                    body: audioBuffer,
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                if (whisperResp.ok) {
                    const whisperJson = await whisperResp.json() as Record<string, unknown>;
                    logger.info(`Whisper STT attempt ${attempt}: success`);
                    source = 'whisper_local';

                    if (whisperJson?.data && typeof whisperJson.data === 'object') {
                        const d = whisperJson.data as Record<string, unknown>;
                        transcript = (typeof d.transcript === 'string' ? d.transcript : '').trim();
                    }
                    if (!transcript && typeof whisperJson.transcript === 'string') {
                        transcript = whisperJson.transcript.trim();
                    }
                    if (transcript) break;
                } else {
                    const errText = await whisperResp.text();
                    logger.warn(`Whisper STT attempt ${attempt}: HTTP ${whisperResp.status} - ${errText}`);
                }
            } catch (fetchErr: any) {
                logger.warn(`Whisper STT attempt ${attempt} error: ${fetchErr.message || fetchErr}`);
            }

            if (attempt === 1) {
                logger.info('Whisper attempt 1 failed, retrying...');
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        // 2. Fallback to external STT API (Infillion)
        if (!transcript) {
            logger.info('Whisper unavailable, trying external STT API');
            const externalTranscript = await transcribeWithExternal(audioBuffer, sttLangCode);
            if (externalTranscript) {
                transcript = externalTranscript;
                source = 'external_api';
                logger.info('External STT fallback succeeded');
            }
        }

        // 3. Final fallback to Gemini
        if (!transcript) {
            logger.info('External STT unavailable, trying Gemini fallback');
            const geminiTranscript = await transcribeWithGemini(audioBuffer, sttLangCode);
            if (geminiTranscript) {
                transcript = geminiTranscript;
                source = 'gemini_fallback';
                logger.info('Gemini fallback succeeded');
            }
        }

        if (!transcript) {
            logger.warn('STT failed - all backends returned empty');
            res.status(502).json({
                success: false,
                error: { code: 'STT_NO_TRANSCRIPT', message: 'Speech recognition could not produce a transcript' },
            });
            return;
        }

        res.json({
            success: true,
            data: { transcript, language: lang, source },
        });

        // Fire-and-forget: store in Supabase for testing (never blocks the response)
        storeChatAudioLog(audioBuffer, transcript, lang, req.headers).catch((err: unknown) => {
            logger.warn(`Chat audio log storage failed (non-critical): ${err instanceof Error ? err.message : err}`);
        });
    } catch (error) {
        const err = error instanceof Error ? error : new Error('STT proxy failed');
        logger.error('STT proxy error', err);
        res.status(500).json({
            success: false,
            error: {
                code: 'STT_PROXY_ERROR',
                message: err.message,
                stack: err.stack,
            },
        });
    }
});

// GET /api/stt/logs - List audio logs (for admin/debugging)
router.get('/logs', async (req: Request, res: Response): Promise<void> => {
    try {
        const supabase = getStorageSupabaseClient();
        if (!supabase) {
            res.status(500).json({ success: false, error: 'Supabase not configured' });
            return;
        }

        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const userId = req.query.user_id as string;
        const sessionId = req.query.session_id as string;
        const fromDate = req.query.from as string;
        const toDate = req.query.to as string;

        let query = supabase
            .from('chat_audio_logs')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range((page - 1) * limit, page * limit - 1);

        if (userId) query = query.eq('user_id', userId);
        if (sessionId) query = query.eq('session_id', sessionId);
        if (fromDate) query = query.gte('created_at', fromDate);
        if (toDate) query = query.lte('created_at', toDate);

        const { data, error, count } = await query;

        if (error) {
            logger.error('Failed to fetch audio logs', error);
            res.status(500).json({ success: false, error: error.message });
            return;
        }

        res.json({
            success: true,
            data: data || [],
            pagination: {
                page,
                limit,
                total: count || 0,
                totalPages: Math.ceil((count || 0) / limit),
            },
        });
    } catch (error) {
        const err = error instanceof Error ? error : new Error('Failed to fetch logs');
        logger.error('Audio logs fetch error', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/stt/audio/:logId - Get signed URL to play audio
router.get('/audio/:logId', async (req: Request, res: Response): Promise<void> => {
    try {
        const supabase = getStorageSupabaseClient();
        if (!supabase) {
            res.status(500).json({ success: false, error: 'Supabase not configured' });
            return;
        }

        const logId = req.params.logId;
        
        // Fetch the log entry to get storage path
        const { data: log, error: logError } = await supabase
            .from('chat_audio_logs')
            .select('audio_storage_path, transcript, language, created_at')
            .eq('id', logId)
            .single();

        if (logError || !log) {
            res.status(404).json({ success: false, error: 'Audio log not found' });
            return;
        }

        if (!log.audio_storage_path) {
            res.status(404).json({ success: false, error: 'No audio file for this log' });
            return;
        }

        // Generate signed URL (valid for 1 hour)
        const { data: urlData, error: urlError } = await supabase.storage
            .from(AUDIO_BUCKET)
            .createSignedUrl(log.audio_storage_path, SIGNED_URL_EXPIRY);

        if (urlError || !urlData?.signedUrl) {
            logger.error('Failed to create signed URL', urlError as Error);
            res.status(500).json({ success: false, error: 'Could not generate audio URL' });
            return;
        }

        res.json({
            success: true,
            data: {
                signed_url: urlData.signedUrl,
                expires_in: SIGNED_URL_EXPIRY,
                transcript: log.transcript,
                language: log.language,
                created_at: log.created_at,
            },
        });
    } catch (error) {
        const err = error instanceof Error ? error : new Error('Failed to get audio URL');
        logger.error('Audio signed URL error', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/stt/audio/play/:logId - Direct audio streaming (for <audio> tag)
router.get('/audio/play/:logId', async (req: Request, res: Response): Promise<void> => {
    try {
        const supabase = getStorageSupabaseClient();
        if (!supabase) {
            res.status(500).json({ success: false, error: 'Supabase not configured' });
            return;
        }

        const logId = req.params.logId;
        
        const { data: log, error: logError } = await supabase
            .from('chat_audio_logs')
            .select('audio_storage_path')
            .eq('id', logId)
            .single();

        if (logError || !log?.audio_storage_path) {
            res.status(404).send('Audio not found');
            return;
        }

        // Create short-lived signed URL and redirect
        const { data: urlData, error: urlError } = await supabase.storage
            .from(AUDIO_BUCKET)
            .createSignedUrl(log.audio_storage_path, 300); // 5 min

        if (urlError || !urlData?.signedUrl) {
            res.status(500).send('Could not generate audio URL');
            return;
        }

        // Redirect to the signed URL for direct playback
        res.redirect(urlData.signedUrl);
    } catch (error) {
        logger.error('Audio playback redirect error', error instanceof Error ? error : new Error('Unknown'));
        res.status(500).send('Playback error');
    }
});

export default router;
