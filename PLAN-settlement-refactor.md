# Plan: Refactor settlementService.ts for Testability + Fix Production Risks

## Context

`backend/src/services/settlementService.ts` (681 lines) implements Phase 1 of the Settlement Execution Layer. All 7 required functions exist, but:

1. **Not testable** — calculation logic is buried inside `calculateSettlement()` as a monolith. Individual steps (gross, MDR, reserve, net) can't be tested independently.
2. **Production risks** — non-atomic balance updates, silent error swallowing, non-fatal ledger insert failure.

This plan refactors for testability and fixes critical/high production risks.

---

## Part 1: Refactor for Testability

### 1A. Extract calculation functions from `calculateSettlement()`

Break the monolithic function into 4 exposed pure functions:

```
getGrossSettlement(transactions: MariaDBTransaction[]): number
getMDRDeduction(transactions: MariaDBTransaction[]): number
getRollingReserve(grossAmount: number, config: MerchantSettlementConfig): number
getNetSettlement(grossAmount: number, mdrDeduction: number, reserveAmount: number): number
```

Keep `calculateSettlement()` as a composite that calls these 4 functions. Backward compatible — no caller changes needed.

**File:** `backend/src/services/settlementService.ts`

### 1B. Make helper functions public + rename

| Current (private) | New (public) | Change |
|---|---|---|
| `getEligibleTransactions()` | `getPendingTransactions(merchantId)` | Rename, make public, change signature to accept `merchantId` directly (it resolves clientId internally) |
| Inline in `processSettlementForMerchant` | `lockSettlementTerms(merchantId)` | Extract to standalone public function |
| Inline in `processSettlementForMerchant` | `createReserveLedgerEntry(params)` | Extract to standalone public function |

**File:** `backend/src/services/settlementService.ts`

### 1C. Update `processSettlementForMerchant` to use extracted functions

Refactor to call `getPendingTransactions()`, `createReserveLedgerEntry()`, `lockSettlementTerms()` instead of inline code. This also makes the main function a readable orchestration of named steps.

**File:** `backend/src/services/settlementService.ts`

---

## Part 2: Fix Production Risks

### 2A. Atomic balance increments (C2/C3 — Critical)

**Problem:** Both `processSettlementForMerchant` (line 366) and `releaseReserve` (line 643) use read-then-write for `pending_settlement_amount` and `total_settled_amount`. Concurrent executions overwrite each other.

**Solution:** Create a Supabase SQL RPC function and call it from the service.

**New migration:** `supabase/migrations/20260623000002_atomic_balance_increment.sql`

```sql
CREATE OR REPLACE FUNCTION increment_merchant_balances(
  p_merchant_id UUID,
  p_pending_increment NUMERIC,
  p_total_increment NUMERIC
)
RETURNS void AS $$
BEGIN
  UPDATE merchant_profiles
  SET
    pending_settlement_amount = pending_settlement_amount + p_pending_increment,
    total_settled_amount = total_settled_amount + p_total_increment
  WHERE id = p_merchant_id;
END;
$$ LANGUAGE plpgsql;
```

**In settlementService.ts:** Replace the read-then-write pattern with:
```ts
await admin.rpc('increment_merchant_balances', {
  p_merchant_id: merchantId,
  p_pending_increment: amount,
  p_total_increment: amount,
});
```

Apply to both `processSettlementForMerchant` (line 366) and `releaseReserve` (line 643).

### 2B. Error propagation in `getSettledTransactionIds` (H2 — High)

**Problem:** Line 163 — `if (error || !data) return new Set()` silently swallows Supabase errors, causing already-settled transactions to be re-settled.

**Fix:** Throw on error instead of returning empty set:
```ts
if (error) throw new Error(`Failed to fetch settled transactions: ${error.message}`);
```

### 2C. Make ledger insert failure fatal (H3 — High)

**Problem:** Lines 358-362 — `rolling_reserve_ledger` insert failure is caught and logged but settlement continues. Reserve is permanently lost.

**Fix:** In the refactored `createReserveLedgerEntry()`, throw on error. In `processSettlementForMerchant`, if `createReserveLedgerEntry` throws, the `settlement_history` insert hasn't happened yet (reorder: do ledger insert BEFORE history insert when reserve > 0, or wrap in a transaction-like pattern).

**Actual fix:** Reorder the DB writes:
1. If reserve > 0: call `createReserveLedgerEntry()` — throws on failure, no data committed yet
2. Insert `settlement_history` record
3. Call `lockSettlementTerms()` — locks terms + updates balances atomically via RPC

This ensures the ledger entry exists before the settlement history is committed.

### 2D. Admin-override validation (H1 — High)

**Problem:** `distributor.ts` admin-override endpoint (line 1720) skips `rolling_reserve_percentage` range (0.01–50) and `rolling_reserve_fixed_inr` > 0 validation.

**Fix:** Add the same validation from the regular PATCH to the admin-override endpoint.

**File:** `backend/src/routes/distributor.ts` (lines 1720-1729)

---

## Files Modified

| File | Change |
|---|---|
| `backend/src/services/settlementService.ts` | Refactor: extract functions, fix error handling, use RPC for atomic increments |
| `backend/src/routes/distributor.ts` | Add validation to admin-override endpoint |
| `supabase/migrations/20260623000002_atomic_balance_increment.sql` | **NEW** — SQL function for atomic balance increment |

---

## What Does NOT Change

- `settlement.ts` routes — no changes needed (they call the same exported functions)
- `settlementScheduler.ts` — no changes (out of scope per requirements)
- `mariadb.ts` — no changes
- `index.ts` — no changes
- Frontend — no changes
- Existing transaction ingestion — untouched

---

## Verification

1. `npx tsc --noEmit` in `backend/` — must compile clean
2. Verify `calculateSettlement()` still returns identical output (backward compat)
3. Verify each extracted function (`getGrossSettlement`, `getMDRDeduction`, `getRollingReserve`, `getNetSettlement`) produces correct results for edge cases (empty transactions, zero reserve, percentage vs fixed, cap at gross-MDR)
4. Verify admin-override rejects out-of-range values
5. Verify `getSettledTransactionIds` throws on Supabase error
6. Verify `createReserveLedgerEntry` throws on insert failure
7. Run migration in Supabase Dashboard SQL Editor
