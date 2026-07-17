-- Chargeback Recovery: chargebacks table, chargeback_history audit table, merchant balance columns

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Create chargebacks table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chargebacks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id           UUID NOT NULL REFERENCES public.merchant_profiles(id) ON DELETE CASCADE,
  amount                NUMERIC(12,2) NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'INR',
  reason                TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'recovering', 'recovered', 'failed')),
  chargeback_date       TIMESTAMPTZ NOT NULL DEFAULT now(),
  recovered_at          TIMESTAMPTZ NULL,
  recovery_source       TEXT NULL
    CHECK (recovery_source IN ('rolling_reserve', 'pending_settlement', 'merchant_balance')),
  recovery_steps        JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chargebacks_merchant_id
  ON public.chargebacks(merchant_id);
CREATE INDEX IF NOT EXISTS idx_chargebacks_status
  ON public.chargebacks(status);
CREATE INDEX IF NOT EXISTS idx_chargebacks_date
  ON public.chargebacks(chargeback_date DESC);

-- RLS
ALTER TABLE public.chargebacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on chargebacks"
  ON public.chargebacks FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read chargebacks"
  ON public.chargebacks FOR SELECT TO authenticated
  USING (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_chargebacks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_chargebacks_updated_at
  BEFORE UPDATE ON public.chargebacks
  FOR EACH ROW
  EXECUTE FUNCTION update_chargebacks_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Create chargeback_history audit table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chargeback_history (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chargeback_id         UUID NOT NULL REFERENCES public.chargebacks(id) ON DELETE CASCADE,
  merchant_id           UUID NOT NULL REFERENCES public.merchant_profiles(id) ON DELETE CASCADE,
  action                TEXT NOT NULL CHECK (action IN ('create', 'update', 'recover')),
  event_type            TEXT NOT NULL,
  previous_data         JSONB NULL,
  current_data          JSONB NULL,
  recovered_amount      NUMERIC(12,2) NULL,
  recovery_source       TEXT NULL
    CHECK (recovery_source IN ('rolling_reserve', 'pending_settlement', 'merchant_balance')),
  recovery_details      JSONB NULL,
  timestamp             TIMESTAMPTZ NOT NULL DEFAULT now(),
  performed_by          TEXT NOT NULL,
  comments              TEXT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chargeback_history_chargeback_id
  ON public.chargeback_history(chargeback_id);
CREATE INDEX IF NOT EXISTS idx_chargeback_history_merchant_id
  ON public.chargeback_history(merchant_id);
CREATE INDEX IF NOT EXISTS idx_chargeback_history_event_type
  ON public.chargeback_history(event_type);
CREATE INDEX IF NOT EXISTS idx_chargeback_history_timestamp
  ON public.chargeback_history(timestamp DESC);

-- RLS
ALTER TABLE public.chargeback_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on chargeback_history"
  ON public.chargeback_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read chargeback_history"
  ON public.chargeback_history FOR SELECT TO authenticated
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Add chargeback tracking columns to merchant_profiles
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.merchant_profiles
  ADD COLUMN IF NOT EXISTS total_chargeback_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_chargeback_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chargeback_recovery_available NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.merchant_profiles.total_chargeback_amount IS 'Lifetime total chargeback amount';
COMMENT ON COLUMN public.merchant_profiles.pending_chargeback_amount IS 'Sum of unresolved chargeback amounts';
COMMENT ON COLUMN public.merchant_profiles.chargeback_recovery_available IS 'Amount recovered from chargebacks (used to offset future chargebacks)';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Atomic chargeback balance update function
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_chargeback_balances(
  p_merchant_id UUID,
  p_chargeback_amount NUMERIC,
  p_recovered_amount NUMERIC
)
RETURNS void AS $$
BEGIN
  UPDATE merchant_profiles
  SET
    total_chargeback_amount = total_chargeback_amount + p_chargeback_amount,
    pending_chargeback_amount = pending_chargeback_amount + p_chargeback_amount - p_recovered_amount,
    chargeback_recovery_available = chargeback_recovery_available + p_recovered_amount
  WHERE id = p_merchant_id;
END;
$$ LANGUAGE plpgsql;
