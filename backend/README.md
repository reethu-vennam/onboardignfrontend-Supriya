# sabbpe-backend (Spring Boot) — Phase 0

Spring Boot port of `backend/` (the Node/Express service, `package.json` name
`sabbpe-backend`). This is **Phase 0 only**: a runnable skeleton proving the
security filter, dual datasource, and error handling wire together correctly
end to end — not a full port of every route yet.

## What's implemented in this phase

- `GET /health` — matches the Node response shape exactly.
- `GET /api/merchant/profile` — full round trip: Supabase JWT verified →
  role resolved from `user_roles` → merchant looked up in Postgres via JPA →
  same JSON shape as the Node controller (`kyc` is hardcoded `null` for now
  — see the TODO in `MerchantController`, joining `merchant_kyc` is Phase 1).
- Supabase JWT verification (local, via `SUPABASE_JWT_SECRET`) replacing the
  per-request network call to `supabase.auth.getUser()`.
- Dual datasource config: primary Postgres (Supabase) via JPA, secondary
  MariaDB via `JdbcTemplate` (bean name `mariaDbJdbcTemplate`) — no MariaDB
  queries ported yet, that starts in Phase 2 with settlement.
- Exception → JSON shape parity: `{ success: false, error: { code, message } }`,
  including the 413 payload-too-large special case.
- CORS allowlist copied verbatim from `backend/src/index.ts`.

## Phase 1 — added on top of Phase 0

Ports the merchant self-service lifecycle actually used by
`src/hooks/useMerchant.ts` (confirmed via grep across `src/`, not assumed):

- `GET /api/merchants/profile` — now with a real `merchant_kyc` join (was
  hardcoded `null` in Phase 0).
- `POST /api/merchants/profile` — create-or-update draft.
- `POST /api/merchants/submit` — draft/rejected → submitted, with an
  `onboarding_audit_log` row written on every transition.
- `GET /api/merchants/status`
- `GET /api/merchants/status-history`

Three deliberate deviations from the literal Node code, flagged rather than
silently replicated:

1. **Real persistence, not in-memory.** `merchantService.ts`'s
   `createMerchant`/`updateMerchant`/`updateStatus` write to an in-memory
   `Map` — meaning today, saved/submitted profile data isn't actually
   durable. This port persists everything via JPA to the real
   `merchant_profiles` table instead. Flag this with whoever owns production
   behavior if there's a reason that was intentional.
2. **Validation rewritten against real columns.** `validationService.ts`
   checks fields (`businessType`, `addressLine1`, `taxId`, etc.) that
   `types/merchant.ts` itself labels "legacy/compatibility" — they were
   never real Supabase columns. Submission validation here checks
   `business_name`, `pan_number`, `aadhaar_number` instead, since those are
   what actually persist. Document-count validation is deferred to Phase 1b
   once `merchant_documents` is ported.
3. **The `/status` and `/status-history` route collision is fixed by
   construction.** In Express, `GET /:merchantId` is registered before these
   two routes, so `GET /api/merchants/status` likely gets swallowed by the
   `:merchantId` handler today. Spring resolves literal path segments before
   `@PathVariable` ones automatically — no special-case code was needed to
   avoid this, it just doesn't happen.

**Base path note**: the Node app mounts the merchant router at both
`/api/merchant` (singular) and `/api/merchants` (plural). This port only
implements `/api/merchants`, since that's what `api-client.ts` (the real,
actively-used client) calls. Add a duplicate mapping for the singular path
if something turns out to depend on it specifically.

**Explicitly out of scope for Phase 1** (confirmed to exist in
`routes/merchant.ts` but not part of the self-service lifecycle above):
`validate-bank-account`, `integration-cost`, `split-config`/`save-split-config`,
`sign-pg-agreement`, `submit-cpv`, `restart-onboarding`,
`confirm-agreement-signed`, `accept-pg-commercials`, and the five admin
routes (`/all`, `/:id/validate`, `/:id/submit-to-bank`, `/:id/approve`,
`/:id/reject`).

## Deliberately excluded from this port

- **`routes/auth.ts`** — confirmed via grep that `/api/auth` has zero
  references in `src/` (the real frontend authenticates directly against
  Supabase, per `AuthProvider.tsx`). The Node route stores users in an
  in-memory `Map` with a hardcoded demo password — it's dead/demo code, not
  something to carry forward. If it turns out something *does* depend on it,
  flag it and it can be added back deliberately.
- Everything else in `backend/` (settlement, chargebacks, distributor
  onboarding, bank validation, notifications, OCR/STT, schedulers) — these
  come in Phases 1–4 per the plan we agreed on.

## Known behavior change to confirm before Phase 2

`getEligibleMerchants()` in the Node `settlementService.ts` filters on
`settlement_terms_locked = false`, and `processSettlementForMerchant` sets
that flag to `true` after the *first* settlement — meaning, read literally,
a merchant may never be picked up by the batch scheduler again after their
first settlement. Confirm the intended behavior before this is ported,
since it directly affects the `@Scheduled` settlement job's correctness.

## Required environment variables

| Variable | Purpose |
|---|---|
| `PORT` | defaults to 8888, same as Node |
| `SUPABASE_DB_URL` | JDBC URL for Supabase's **direct** Postgres connection (not the pgbouncer pooler, unless you tune `SUPABASE_DB_POOL_SIZE` down) |
| `SUPABASE_DB_USER` / `SUPABASE_DB_PASSWORD` | Postgres credentials |
| `SUPABASE_JWT_SECRET` | Dashboard > Project Settings > API > JWT Secret — **different** from `APP_JWT_SECRET` below |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | kept for later phases (e.g. Supabase Storage access), unused by Phase 0 code paths |
| `MARIADB_URL` / `MARIADB_USER` / `MARIADB_PASSWORD` | transaction ledger, unused until Phase 2 |
| `APP_JWT_SECRET` | this backend's own signing secret for bank-staff/support-staff logins (Phase 3) — unrelated to Supabase auth |

## Running locally

```bash
mvn spring-boot:run
```

## Note on this sandbox

This project was written and reviewed carefully but **not compiled here** —
this environment only has network access to npm/PyPI/crates registries, not
Maven Central, so `mvn compile` can't run in this sandbox. Please run
`mvn compile` (or open it in an IDE) as the first step on your machine to
catch anything a compiler would catch that manual review didn't.
