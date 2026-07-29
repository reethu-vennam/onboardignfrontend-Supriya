-- Migration: Add distributor recovery support
-- Adds distributor as 4th recovery source for chargebacks

ALTER TABLE distributor_profiles
ADD COLUMN IF NOT EXISTS security_deposit NUMERIC(12,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS available_recovery_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_recovered_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS distributor_recovery_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    distributor_id UUID NOT NULL REFERENCES distributor_profiles(id) ON DELETE CASCADE,
    chargeback_id UUID NOT NULL REFERENCES chargebacks(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchant_profiles(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    recovery_source TEXT NOT NULL DEFAULT 'distributor_balance',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dist_recovery_hist_distributor ON distributor_recovery_history(distributor_id);
CREATE INDEX IF NOT EXISTS idx_dist_recovery_hist_chargeback ON distributor_recovery_history(chargeback_id);
