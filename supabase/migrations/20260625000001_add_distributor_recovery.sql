-- Distributor Recovery: add recovery balance fields to distributor_profiles
-- and create distributor_recovery_history audit table.
-- Extends recovery source to include distributor_balance as 4th priority.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add recovery balance columns to distributor_profiles
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.distributor_profiles
  ADD COLUMN IF NOT EXISTS security_deposit NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available_recovery_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_recovered_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.distributor_profiles.security_deposit IS 'Security deposit held from distributor';
COMMENT ON COLUMN public.distributor_profiles.available_recovery_balance IS 'Available balance that can be debited for chargeback recovery';
COMMENT ON COLUMN public.distributor_profiles.total_recovered_amount IS 'Lifetime total amount recovered from this distributor';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Create distributor_recovery_history table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.distributor_recovery_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id  UUID NOT NULL REFERENCES public.distributor_profiles(id) ON DELETE CASCADE,
  chargeback_id   UUID NOT NULL REFERENCES public.chargebacks(id) ON DELETE CASCADE,
  merchant_id     UUID NOT NULL REFERENCES public.merchant_profiles(id) ON DELETE CASCADE,
  amount          NUMERIC(12,2) NOT NULL,
  recovery_source TEXT NOT NULL DEFAULT 'distributor_balance',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_distributor_recovery_history_distributor
  ON public.distributor_recovery_history(distributor_id);
CREATE INDEX IF NOT EXISTS idx_distributor_recovery_history_chargeback
  ON public.distributor_recovery_history(chargeback_id);
CREATE INDEX IF NOT EXISTS idx_distributor_recovery_history_created
  ON public.distributor_recovery_history(created_at DESC);

-- RLS
ALTER TABLE public.distributor_recovery_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on distributor_recovery_history"
  ON public.distributor_recovery_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read distributor_recovery_history"
  ON public.distributor_recovery_history FOR SELECT TO authenticated
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Extend recovery_source CHECK constraint on chargebacks table
--    to allow 'distributor_balance'
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.chargebacks
    DROP CONSTRAINT IF EXISTS chargebacks_recovery_source_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.chargebacks
  ADD CONSTRAINT chargebacks_recovery_source_check
  CHECK (recovery_source IN ('rolling_reserve', 'pending_settlement', 'merchant_balance', 'distributor_balance'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Extend recovery_source CHECK constraint on chargeback_history table
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.chargeback_history
    DROP CONSTRAINT IF EXISTS chargeback_history_recovery_source_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.chargeback_history
  ADD CONSTRAINT chargeback_history_recovery_source_check
  CHECK (recovery_source IN ('rolling_reserve', 'pending_settlement', 'merchant_balance', 'distributor_balance'));
