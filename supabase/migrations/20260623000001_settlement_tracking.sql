-- Settlement Phase 1: Tracking columns, settlement_history table, merchant balance columns

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add settlement tracking columns to transactions table
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS settlement_status TEXT NOT NULL DEFAULT 'unsettled'
    CHECK (settlement_status IN ('unsettled', 'settled', 'excluded')),
  ADD COLUMN IF NOT EXISTS settlement_batch_id UUID NULL,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_settlement_status
  ON public.transactions(settlement_status)
  WHERE settlement_status = 'unsettled';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Create settlement_history table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.settlement_history (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id           UUID NOT NULL REFERENCES public.merchant_profiles(id) ON DELETE CASCADE,
  distributor_id        UUID NOT NULL REFERENCES auth.users(id),
  settlement_batch_ref  TEXT NOT NULL,
  settlement_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  settlement_cycle_days SMALLINT NOT NULL,
  gross_amount          NUMERIC(12,2) NOT NULL,
  mdr_deduction         NUMERIC(12,2) NOT NULL DEFAULT 0,
  rolling_reserve_held  NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_settlement_amount NUMERIC(12,2) NOT NULL,
  transaction_count     INTEGER NOT NULL,
  transaction_refs      JSONB NOT NULL DEFAULT '[]'::jsonb,
  status                TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processed', 'failed')),
  processed_at          TIMESTAMPTZ NULL,
  failure_reason        TEXT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_history_merchant
  ON public.settlement_history(merchant_id);
CREATE INDEX IF NOT EXISTS idx_settlement_history_distributor
  ON public.settlement_history(distributor_id);
CREATE INDEX IF NOT EXISTS idx_settlement_history_date
  ON public.settlement_history(settlement_date DESC);
CREATE INDEX IF NOT EXISTS idx_settlement_history_batch_ref
  ON public.settlement_history(settlement_batch_ref);
CREATE INDEX IF NOT EXISTS idx_settlement_history_status
  ON public.settlement_history(status)
  WHERE status = 'pending';

-- RLS
ALTER TABLE public.settlement_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on settlement_history"
  ON public.settlement_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Distributors can read own settlement history"
  ON public.settlement_history FOR SELECT TO authenticated
  USING (distributor_id = auth.uid());

CREATE POLICY "Authenticated users can read settlement history"
  ON public.settlement_history FOR SELECT TO authenticated
  USING (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_settlement_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_settlement_history_updated_at
  BEFORE UPDATE ON public.settlement_history
  FOR EACH ROW
  EXECUTE FUNCTION update_settlement_history_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Add balance columns to merchant_profiles
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.merchant_profiles
  ADD COLUMN IF NOT EXISTS pending_settlement_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_settled_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_settled_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.merchant_profiles.pending_settlement_amount IS 'Net amount pending settlement (gross - mdr - reserve)';
COMMENT ON COLUMN public.merchant_profiles.total_settled_amount IS 'Lifetime total amount settled to merchant';
COMMENT ON COLUMN public.merchant_profiles.last_settled_at IS 'Timestamp of most recent settlement';
