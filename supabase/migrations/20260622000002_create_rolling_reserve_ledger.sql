-- Rolling Reserve Ledger table
-- Phase 1B: Tracks every reserve deduction and release for audit/reconciliation

CREATE TABLE IF NOT EXISTS public.rolling_reserve_ledger (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id             UUID NOT NULL REFERENCES public.merchant_profiles(id) ON DELETE CASCADE,
    distributor_id          UUID NOT NULL REFERENCES auth.users(id),
    transaction_ref         TEXT NOT NULL,
    gross_settlement_amount NUMERIC(12,2) NOT NULL,
    reserve_amount          NUMERIC(12,2) NOT NULL,
    reserve_date            DATE NOT NULL DEFAULT CURRENT_DATE,
    release_date            DATE NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'released', 'debited')),
    debit_reason            TEXT NULL,
    settlement_cycle_days   SMALLINT NOT NULL,
    released_at             TIMESTAMPTZ NULL,
    debited_at              TIMESTAMPTZ NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for settlement processing
CREATE INDEX IF NOT EXISTS idx_rrl_merchant_id ON public.rolling_reserve_ledger(merchant_id);
CREATE INDEX IF NOT EXISTS idx_rrl_distributor_id ON public.rolling_reserve_ledger(distributor_id);
CREATE INDEX IF NOT EXISTS idx_rrl_status ON public.rolling_reserve_ledger(status) WHERE status = 'held';
CREATE INDEX IF NOT EXISTS idx_rrl_release_date ON public.rolling_reserve_ledger(release_date) WHERE status = 'held';
CREATE INDEX IF NOT EXISTS idx_rrl_merchant_status ON public.rolling_reserve_ledger(merchant_id, status);

-- Enable RLS
ALTER TABLE public.rolling_reserve_ledger ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (backend inserts/updates via service key)
CREATE POLICY "Service role full access on rolling_reserve_ledger"
    ON public.rolling_reserve_ledger
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Distributors can read their own merchants' ledger entries
CREATE POLICY "Distributors can read own merchant ledger"
    ON public.rolling_reserve_ledger
    FOR SELECT
    TO authenticated
    USING (distributor_id = auth.uid());

-- Admins can read all (via service role)
CREATE POLICY "Authenticated users can read ledger"
    ON public.rolling_reserve_ledger
    FOR SELECT
    TO authenticated
    USING (true);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_rrl_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_rrl_updated_at
    BEFORE UPDATE ON public.rolling_reserve_ledger
    FOR EACH ROW
    EXECUTE FUNCTION update_rrl_updated_at();

COMMENT ON TABLE public.rolling_reserve_ledger IS 'Tracks rolling reserve deductions and releases for settlement audit and reconciliation';
COMMENT ON COLUMN public.rolling_reserve_ledger.status IS 'held = reserve withheld, released = returned to merchant after 15 days, debited = used to cover shortfall';
COMMENT ON COLUMN public.rolling_reserve_ledger.release_date IS 'Scheduled release date = reserve_date + 15 business days';