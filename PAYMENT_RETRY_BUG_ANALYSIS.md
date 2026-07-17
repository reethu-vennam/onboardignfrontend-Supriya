# SabbPe payment retry bug analysis

## What happened

During the first payment attempt, the user cancelled the gateway flow and returned to the dashboard. The dashboard showed the expected "Pay with Sabbpe" state again. A second failed attempt behaved the same way. On the third attempt, payment succeeded, but `txn_details` was still not updated in the database, so the dashboard continued to show the pay button instead of transaction details.

## Likely root cause

The payment flow must not use a write-once model for `transaction_id`. The correct rule is:

- every successful `/token` call must replace the stored `Transaction Id` for that merchant
- the latest successful `decrypt-token` response must write `txn_details` for that same row
- the dashboard should show `View txn details` only when the latest attempt succeeded

- The dashboard starts payment by calling `startSabbpeHostedPayment(...)`, then stores the returned transaction id with `storeSabbpeTransactionId(transactionId)`.
- The payment-result page later calls `storeSabbpeTxnDetails(payload)` after decrypting the gateway response.
- On the backend, `storeMerchantTransactionId()` should replace the previous value on every new attempt instead of skipping when `merchant_profiles."Transaction Id"` already exists.
  - `storeTxnDetailsByTransactionId()` only writes when `txn_details` is still null.

That means a failed or cancelled attempt can leave the merchant row pointing at an old transaction id. If the user retries, the new attempt must update the row to the latest `transaction_id` before the decrypt-token response is saved.

## Relevant code paths

- Dashboard payment start: [src/components/onboarding/OnboardingDashboard.tsx](src/components/onboarding/OnboardingDashboard.tsx#L714)
- Token and initiate flow: [src/api/sabbpePaymentApi.ts](src/api/sabbpePaymentApi.ts#L128-L240)
- Payment result decrypt and save: [src/pages/IntegrationPaymentResult.tsx](src/pages/IntegrationPaymentResult.tsx#L130-L190)
- Backend transaction storage logic: [backend/src/services/paymentTransactionService.ts](backend/src/services/paymentTransactionService.ts#L77-L161)
- Dashboard payment state decision: [src/components/onboarding/OnboardingDashboard.tsx](src/components/onboarding/OnboardingDashboard.tsx#L620-L760)

## Why the dashboard still showed "Pay with Sabbpe"

The dashboard only switches to "View txn details" when it sees a successful payment state in `merchantProfile.txn_details` or local completion state. If the successful callback never matched the stored transaction id, `txn_details` stays null or remains tied to the earlier failed attempt, so the UI keeps rendering the pay action.

## What this is not

- It is probably not an env issue.
- It is probably not a `VITE_*` misconfiguration.
- The issue is more likely a transaction correlation / overwrite problem between retries.

## Fix options to discuss

1. Replace the stored `Transaction Id` on every new `/token` attempt.
2. Keep `txn_details` idempotent, but associate it with the latest stored `Transaction Id`.
3. On retry, let the new `transaction_id` override the stale one so the latest success wins.

If the product decision is to trust the most recent payment attempt, option 1 is the direct fix and the backend should be updated accordingly.

## Next step

Implement the replace-on-retry transaction id flow, then verify that a successful retry updates `txn_details` and flips the dashboard to `View txn details`.