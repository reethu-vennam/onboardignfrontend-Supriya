-- Production Integrity Constraints
--
-- Adds UNIQUE constraints and financial integrity checks
-- to settlement, reserve, and recovery tables.
-- These prevent duplicate processing and detect inconsistent state.

-- ─── 1. settlement_history: prevent duplicate settlement batches ────────────
-- Each merchant can have only one settlement per batch ref.
-- Prevents double-processing from concurrent requests or scheduler overlap.
CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_history_batch
    ON public.settlement_history(merchant_id, settlement_batch_ref);

-- ─── 2. rolling_reserve_ledger: prevent duplicate reserve entries ────────────
-- Each settlement batch creates exactly one reserve entry per merchant.
-- Prevents duplicate reserve deductions for the same settlement.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rolling_reserve_ledger_batch
    ON public.rolling_reserve_ledger(merchant_id, transaction_ref);

-- ─── 3. distributor_recovery_history: prevent duplicate recovery records ─────
-- A chargeback can be recovered from a distributor only once.
-- Prevents double-debit of distributor balance for the same chargeback.
CREATE UNIQUE INDEX IF NOT EXISTS uq_distributor_recovery_chargeback
    ON public.distributor_recovery_history(distributor_id, chargeback_id);

-- ─── 4. Financial integrity CHECK on merchant_profiles ──────────────────────
-- Ensure recoveries don't exceed total chargeback amounts.
-- This is a sanity check — violations indicate a bug.
ALTER TABLE public.merchant_profiles
    ADD CONSTRAINT ck_chargeback_recovery_not_excessive
    CHECK (chargeback_recovery_available >= 0 AND chargeback_recovery_available <= total_chargeback_amount + 0.01)
    NOT VALID;
-- NOT VALID: only catches NEW violations, doesn't fail on existing data.
-- Run `ALTER TABLE ... VALIDATE CONSTRAINT ck_chargeback_recovery_not_excessive`
-- after verifying existing data is consistent.

-- ─── 5. Rolling reserve amount sanity check ─────────────────────────────────
-- Reserve amount can never exceed the gross settlement amount for an entry.
ALTER TABLE public.rolling_reserve_ledger
    ADD CONSTRAINT ck_reserve_not_exceeding_gross
    CHECK (reserve_amount >= 0 AND reserve_amount <= gross_settlement_amount + 0.01)
    NOT VALID;

-- ─── 6. Settlement amounts sanity check ─────────────────────────────────────
-- Net settlement must be >= 0 and <= gross amount.
ALTER TABLE public.settlement_history
    ADD CONSTRAINT ck_settlement_amounts_consistent
    CHECK (
        gross_amount >= 0
        AND mdr_deduction >= 0
        AND rolling_reserve_held >= 0
        AND net_settlement_amount >= 0
        AND ABS(gross_amount - mdr_deduction - rolling_reserve_held - net_settlement_amount) <= 0.02
    )
    NOT VALID;

-- ─── 7. Transaction count sanity check ──────────────────────────────────────
-- Settlement with zero transactions is invalid.
ALTER TABLE public.settlement_history
    ADD CONSTRAINT ck_settlement_requires_transactions
    CHECK (transaction_count > 0)
    NOT VALID;

COMMENT ON INDEX uq_settlement_history_batch IS 'Prevents duplicate settlement batches per merchant';
COMMENT ON INDEX uq_rolling_reserve_ledger_batch IS 'Prevents duplicate reserve entries per settlement batch';
COMMENT ON INDEX uq_distributor_recovery_chargeback IS 'Prevents double-recovery of same chargeback from same distributor';
COMMENT ON CONSTRAINT ck_chargeback_recovery_not_excessive ON public.merchant_profiles IS 'Sanity check: recovered amount cannot exceed total chargebacks';
COMMENT ON CONSTRAINT ck_reserve_not_exceeding_gross ON public.rolling_reserve_ledger IS 'Sanity check: reserve <= gross for each entry';
COMMENT ON CONSTRAINT ck_settlement_amounts_consistent ON public.settlement_history IS 'Sanity check: gross - mdr - reserve = net';
COMMENT ON CONSTRAINT ck_settlement_requires_transactions ON public.settlement_history IS 'Settlement must include at least one transaction';
