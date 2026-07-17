-- Rolling Reserve & Settlement Cycle columns for merchant_profiles
-- Phase 1A: Add settlement config columns

ALTER TABLE public.merchant_profiles
  ADD COLUMN IF NOT EXISTS rolling_reserve_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rolling_reserve_percentage NUMERIC(5,2) NULL,
  ADD COLUMN IF NOT EXISTS rolling_reserve_fixed_inr NUMERIC(12,2) NULL,
  ADD COLUMN IF NOT EXISTS settlement_cycle_days SMALLINT NOT NULL DEFAULT 1
    CHECK (settlement_cycle_days IN (1, 2, 3)),
  ADD COLUMN IF NOT EXISTS settlement_terms_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS settlement_config_overridden_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS settlement_config_overridden_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS settlement_config_overridden_by UUID NULL REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS settlement_config_override_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS undertaking_pdf_url TEXT NULL;

-- Index for settlement processing queries
CREATE INDEX IF NOT EXISTS idx_merchant_profiles_settlement_locked
  ON public.merchant_profiles(settlement_terms_locked)
  WHERE settlement_terms_locked = FALSE;

-- Index for distributor's merchant portfolio
CREATE INDEX IF NOT EXISTS idx_merchant_profiles_distributor_id
  ON public.merchant_profiles(distributor_id)
  WHERE distributor_id IS NOT NULL;

COMMENT ON COLUMN public.merchant_profiles.rolling_reserve_enabled IS 'Whether rolling reserve applies to this merchant';
COMMENT ON COLUMN public.merchant_profiles.rolling_reserve_percentage IS 'Reserve % per settlement (e.g. 5.00 = 5%). Null if fixed INR used';
COMMENT ON COLUMN public.merchant_profiles.rolling_reserve_fixed_inr IS 'Alternative: fixed INR reserve amount. Null if % used';
COMMENT ON COLUMN public.merchant_profiles.settlement_cycle_days IS 'Settlement delay: 1=T+1, 2=T+2, 3=T+3';
COMMENT ON COLUMN public.merchant_profiles.settlement_terms_locked IS 'Set to TRUE automatically when first settlement runs. Blocks further edits';
COMMENT ON COLUMN public.merchant_profiles.settlement_config_overridden_by_admin IS 'True if admin overrode distributor-set settlement config';
COMMENT ON COLUMN public.merchant_profiles.undertaking_pdf_url IS 'URL of auto-generated Rolling Reserve Undertaking PDF';