-- Migration: Create chargebacks table
-- Stores all chargebacks for merchants

CREATE TABLE IF NOT EXISTS chargebacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchant_profiles(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    reason TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'recovering', 'recovered', 'failed')),
    chargeback_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    recovered_at TIMESTAMPTZ,
    recovery_source TEXT CHECK (recovery_source IN ('rolling_reserve', 'pending_settlement', 'merchant_balance', 'distributor_balance')),
    recovery_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for merchant queries
CREATE INDEX IF NOT EXISTS idx_chargebacks_merchant_id ON chargebacks(merchant_id);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_chargebacks_status ON chargebacks(status);

-- Index for chargeback date
CREATE INDEX IF NOT EXISTS idx_chargebacks_chargeback_date ON chargebacks(chargeback_date DESC);

-- Migration: Create chargeback_history table
-- Audit tracking for all chargeback operations

CREATE TABLE IF NOT EXISTS chargeback_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chargeback_id UUID NOT NULL REFERENCES chargebacks(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchant_profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'recover')),
    event_type TEXT NOT NULL,
    previous_data JSONB,
    current_data JSONB,
    recovered_amount DECIMAL(12,2),
    recovery_source TEXT CHECK (recovery_source IN ('rolling_reserve', 'pending_settlement', 'merchant_balance', 'distributor_balance')),
    recovery_details JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    performed_by TEXT NOT NULL,
    comments TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for chargeback queries
CREATE INDEX IF NOT EXISTS idx_chargeback_history_chargeback_id ON chargeback_history(chargeback_id);

-- Index for event type filtering
CREATE INDEX IF NOT EXISTS idx_chargeback_history_event_type ON chargeback_history(event_type);

-- Index for timestamp
CREATE INDEX IF NOT EXISTS idx_chargeback_history_timestamp ON chargeback_history(timestamp DESC);

-- Migration: Update merchant_profiles to add fields for chargeback tracking

ALTER TABLE merchant_profiles
ADD COLUMN IF NOT EXISTS total_chargeback_amount DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS pending_chargeback_amount DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS chargeback_recovery_available DECIMAL(12,2) DEFAULT 0;

-- Migration: Add recovery_steps column (for installations where chargebacks table already exists)

ALTER TABLE chargebacks
ADD COLUMN IF NOT EXISTS recovery_steps JSONB NOT NULL DEFAULT '[]'::jsonb;
