-- Create chat_audio_logs table for storing Sahil chatbot STT recordings
-- This is for testing/debugging purposes only and may be removed later.
CREATE TABLE IF NOT EXISTS chat_audio_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    session_id      TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    audio_storage_path TEXT,
    transcript      TEXT NOT NULL DEFAULT '',
    language        TEXT NOT NULL DEFAULT 'en',
    onboarding_step TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying by user
CREATE INDEX IF NOT EXISTS idx_chat_audio_logs_user_id ON chat_audio_logs(user_id);

-- Index for querying by session
CREATE INDEX IF NOT EXISTS idx_chat_audio_logs_session_id ON chat_audio_logs(session_id);

-- Enable RLS
ALTER TABLE chat_audio_logs ENABLE ROW LEVEL SECURITY;

-- Users can insert their own logs (service role will also insert via backend)
CREATE POLICY "Users can insert their own chat audio logs"
    ON chat_audio_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Users can read their own logs
CREATE POLICY "Users can read their own chat audio logs"
    ON chat_audio_logs
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Admins can read all logs (via service role key)
CREATE POLICY "Service role can read all chat audio logs"
    ON chat_audio_logs
    FOR SELECT
    TO service_role
    USING (true);

-- Service role can insert all chat audio logs
CREATE POLICY "Service role can insert all chat audio logs"
    ON chat_audio_logs
    FOR INSERT
    TO service_role
    WITH CHECK (true);