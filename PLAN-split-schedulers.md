# Plan: Split Schedulers + Add Dry-Run Mode

## Changes

### 1. Create `backend/src/services/reserveReleaseScheduler.ts`
- Extract `runReserveRelease()` and overlap flag from `settlementScheduler.ts`
- Import `releaseReserve` from `settlementService`
- Export `startReserveReleaseScheduler()` function

### 2. Update `backend/src/services/settlementScheduler.ts`
- Remove `reserveReleaseRunning` flag and `runReserveRelease()`
- Remove reserve release cron schedule from `startScheduler()`
- Add `dryRun` parameter to `runSettlementBatch()` — reads `SETTLEMENT_DRY_RUN` env var
- Pass `dryRun` through to `processSettlementBatch()`

### 3. Update `backend/src/services/settlementService.ts`
- Add `dryRun` parameter to `processSettlementBatch()` — passes through to `processSettlementForMerchant()`

### 4. Update `backend/src/index.ts`
- Import `startReserveReleaseScheduler` from `reserveReleaseScheduler`
- Call both `startScheduler()` and `startReserveReleaseScheduler()` in `app.listen()`

### 5. Add `SETTLEMENT_DRY_RUN` env var support
- When `SETTLEMENT_DRY_RUN=true`, scheduler runs but passes `dryRun=true`
- Logs clearly indicate dry-run mode
- No DB writes occur

## Files Modified
| File | Change |
|---|---|
| `backend/src/services/reserveReleaseScheduler.ts` | **NEW** — extracted reserve release scheduler |
| `backend/src/services/settlementScheduler.ts` | Remove reserve release, add dry-run support |
| `backend/src/services/settlementService.ts` | Add `dryRun` param to `processSettlementBatch()` |
| `backend/src/index.ts` | Import and start both schedulers |
