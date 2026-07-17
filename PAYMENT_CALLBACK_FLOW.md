# Payment Callback Flow Reference

## Goal
Store payment callback payloads from SabbPe in `merchant_profiles.txn_details` using `merchant_profiles."Transaction Id"` as the correlation key.

## Database change
- Add column: `txn_details JSONB DEFAULT NULL`
- Table: `merchant_profiles`
- This column stores the raw callback or decrypt-token JSON payload as-is.

## Transaction ID storage API
- Create a backend API that accepts the token-generation response `transaction_id`.
- The API should store that value in `merchant_profiles."Transaction Id"`.
- This update targets the authenticated merchant row, so `merchant_profiles.id` is matched from the signed-in merchant context.
- Frontend wiring: the onboarding dashboard sends the returned `transactionId` to `/api/transaction/store-transaction-id` before redirecting to SabbPe.
- This write happens before the callback payload arrives, so the later callback can be matched to the correct row.
- If `merchant_profiles."Transaction Id"` is already set for that row, the API should skip the write.
- Implemented route group:
	- `POST /api/transaction/store-transaction-id`
	- `POST /api/transaction/update` as backward-compatible alias

## Integration cost lookup API
- Create a backend API that retrieves `total_integration_cost` for the authenticated merchant.
- Request body is not required for lookup; the authenticated merchant from the bearer token is used.
- The API is read-only: it does not calculate or update cost, it only returns the stored `total_integration_cost` from `merchant_profiles`.
- The backend verifies the signed-in merchant context, then resolves `merchant_profiles` by the authenticated `user_id`.
- Implemented route:
	- `POST /api/merchant/integration-cost`

### Integration cost request/response

- Authentication: send the Supabase session token in the `Authorization: Bearer <token>` header.

- Request body: none required.

- Response shape:

```json
{
	"success": true,
	"data": {
		"merchantId": "<merchant_profiles.id>",
		"total_integration_cost": 60000
	}
}
```

### Internal resolution

- `authenticate` validates the bearer token against Supabase Auth.
- `authorize('merchant')` ensures only merchant users can call the endpoint.
- The API looks up `merchant_profiles` by `user_id`.
- The API returns the stored `total_integration_cost` from the matching row.
- If no row exists for that `user_id`, the API returns `404 Merchant profile not found`.

### About this method (server visibility & frontend wiring)

- Purpose: make the frontend contract simple (token-only lookup) while ensuring the backend can reliably read merchant rows regardless of Row-Level Security (RLS) policies.
- Server behaviour: the backend authenticates the incoming bearer token (Supabase session token) to identify the signed-in merchant, but it performs the actual table read using the server-side service-role key (SUPABASE_SERVICE_ROLE_KEY). This ensures the server can read the `merchant_profiles` row even when RLS would otherwise block a non-owner client.
- Frontend obligations:
	- Always include the user's Supabase session token in the `Authorization: Bearer <token>` header when calling `POST /api/merchant/integration-cost` (or other protected API routes).
	- Do not (and must not) include or expose any server/service keys in the frontend.
- Error handling (frontend):
	- 401: invalid or missing session token — prompt the user to re-login.
	- 403: insufficient permissions — rare for merchant-only endpoints; verify the user's role.
	- 404: merchant profile not found — surface a helpful message and provide a retry path (the merchant may need to finish onboarding).
- Example frontend call (fetch):

```js
const res = await fetch(`${import.meta.env.VITE_API_URL}/api/merchant/integration-cost`, {
	method: 'POST',
	headers: {
		'Content-Type': 'application/json',
		'Authorization': `Bearer ${userSessionToken}`
	}
});
const json = await res.json();
if (!res.ok) handleError(json);
// json.data.total_integration_cost contains the value
```

- Notes:
	- The API intentionally requires no request body. The authenticated context identifies the merchant.
	- The server's use of the service-role key is internal only; it does not change the frontend contract or required headers.
	- Keep the front-end simple: call the endpoint with the user's session token, consume `json.data.total_integration_cost`, and render/update UI accordingly.

### Frontend payment wiring (expanded)

- Typical frontend sequence before redirecting the user to SabbPe:
	1. `POST /token` — obtain `{ token, transactionId }` from your backend.
	2. `POST /api/transaction/store-transaction-id` — immediately send `{ transactionId }` (authenticated) so the backend saves it to `merchant_profiles."Transaction Id"`.
	3. `POST /initiate` — call your initiate endpoint with the `token`; receive `payment_url` (or redirectUrl).
	4. Open `payment_url` (e.g. `window.location.href = payment_url`) so the user completes payment at SabbPe.

- Why: storing `transactionId` before redirect ensures the later SabbPe callback or decrypt-token flow can correlate the incoming payload to the correct merchant row and keeps the callback idempotent.

- Note: you may optionally have the backend store `transactionId` when generating the token (step 1) instead of a separate frontend call; both approaches are valid — this doc assumes the frontend explicitly calls `store-transaction-id`.

## SabbPe callback API
- Route: `{baseurl}/api/payment/sabbpe/callback`
- This backend callback endpoint receives the raw payment payload from SabbPe.
- Use `merchant_profiles."Transaction Id"` to find the row.
- If `merchant_profiles.txn_details` is `null`, store the raw JSON payload in that column.
- If `merchant_profiles.txn_details` already has a value, skip the write.
- This callback must be idempotent.
- On success, return HTTP `200`.
- If the row is already processed, also return HTTP `200` so the callback remains idempotent.
- Implemented in backend route group: `POST /api/payment/sabbpe/callback`

## Update API design decision
- Use two separate actions under the same route group instead of one mixed endpoint.
- Action 1: store `transaction_id` into `merchant_profiles."Transaction Id"`.
- Action 2: store the raw `decrypt-token` response into `merchant_profiles.txn_details` for both success and failure results.
- Frontend wiring: the payment-result page sends the decrypted SabbPe response to `/api/transaction/store-txn-details` after every payment check.
- This keeps the request shapes clear and the idempotency rules simple.
- Implemented route group:
	- `POST /api/transaction/store-transaction-id`
	- `POST /api/transaction/store-txn-details`

### Payloads and internal resolution

This is the actual request/data path the app follows end to end:

| Step | Request payload | Internal resolution | Database effect |
| --- | --- | --- | --- |
| Store transaction id | `POST /api/transaction/store-transaction-id` with `{ "transactionId": "<transaction_id-from-token-generation>" }` | `authenticate` reads the bearer token, resolves the Supabase user, looks up `merchant_profiles.id` by `user_id`, and sets `req.user.merchantId` | Updates `merchant_profiles."Transaction Id"` for that merchant row if it is still `NULL` |
| Redirect to payment | SabbPe initiate payload includes the saved `sabbpe_token`, amount, product info, customer info, and `frontend_url` | SabbPe returns `payment_url`; the browser navigates there | No DB write yet |
| Return to payment-result | Browser loads `payment-result?status=...&txnid=...` | `IntegrationPaymentResult` reads `txnid` from the URL and the saved SabbPe token from session storage | No DB write yet |
| Decrypt payment | `POST https://pymntsuat.sabbpe.com/api/v1/decrypt-token` with `{ "sabbpe_token": "...", "txnid": "..." }` | SabbPe resolves the payment reference internally and returns the decrypted JSON payload | No DB write yet |
| Store transaction details | `POST /api/transaction/store-txn-details` with the decrypted JSON payload | Backend middleware authenticates the merchant session, then `storeTxnDetailsByTransactionId()` extracts `master_transaction_id` / `txnid` / `transaction_id` and matches `merchant_profiles."Transaction Id"` | Writes `txn_details` only when `txn_details IS NULL` |

### Example payloads

- Store transaction id request:

```json
{
	"transactionId": "4ede2326-1123-4505-96e6-1dd7c57501fc"
}
```

- Decrypt-token request sent to SabbPe:

```json
{
	"sabbpe_token": "bijEWw+li10dvv0jW0/DVBw74QJxopZ16Sl6SqJIWiLcFkkQMtwCWo50uxU09stvSI0s3eqSAxCwG+sSVv5cxA==",
	"txnid": "KNR4gqsMtyBAYN%2BUdhPhI7MN8I41E8id5dXC9Zl7FdxH2ZXuR3AE5l5VfGtcLjvQ"
}
```

- Store transaction details request to the backend:

```json
{
	"gateway": "SABBPE",
	"master_transaction_id": "4ede2326-1123-4505-96e6-1dd7c57501fc",
	"merchant_order_ref": "ORDER-727",
	"status": "SUCCESS",
	"amount": "1500.00",
	"currency": "INR",
	"payment_method": "NB",
	"payment_completed_at": "2026-05-23T16:00:25"
}
```

### Backend resolution details

- Authentication happens first on every protected backend route.
- The bearer token is validated against Supabase Auth.
- The authenticated user id is then mapped to `merchant_profiles.id` through `merchant_profiles.user_id`.
- That merchant row is the only row allowed to receive the stored `transactionId` and the later `txn_details` payload.
- The details lookup does not guess a merchant from the payment payload alone; it uses the authenticated merchant context plus the transaction reference from the payload.
- For decrypt-token payload storage, the backend normalizes the payment JSON enough to extract a transaction reference, then updates the matching `merchant_profiles` row.

### Payment-result page behavior

- On page load, `src/pages/IntegrationPaymentResult.tsx` immediately runs `processPayment()` inside `useEffect`.
- The page first reads `txnid` from the callback URL and reads the saved SabbPe token from session storage with `getSabbpePaymentToken()`.
- If either value is missing, the page stops and renders an error state instead of calling the payment APIs.
- If both values exist, the page calls `decryptSabbpePaymentToken({ sabbpeToken, txnid })`.
- `decryptSabbpePaymentToken()` sends a `POST` request to `${VITE_PAYMENT_API_URL}/decrypt-token` with this body:

```json
{
	"sabbpe_token": "<saved-token>",
	"txnid": "<txnid-from-callback-url>"
}
```

- After the decrypt response returns, the page renders the decrypted JSON fields in the UI and stores the full payload in component state as `paymentResult`.
- The page then calls `storeSabbpeTxnDetails(decryptedResponse)`, which sends `POST /api/transaction/store-txn-details` through `apiClient`.
- `apiClient` adds the authenticated bearer token and prefixes the request with `VITE_API_URL`, so the real backend call is `POST {VITE_API_URL}/api/transaction/store-txn-details`.
- The UI shows a loading spinner while this sequence runs, then shows the decrypted payment data and either a success or failure state.
- The page no longer auto-redirects; the only navigation control is the `Dashboard` button.

- External decrypt-token request:
	- URL: use a configured payments-module base URL from environment or app config, for example `PAYMENTS_MODULE_BASE_URL + /api/v1/decrypt-token`
	- Body:
		```json
		{
			"sabbpe_token": "<sabbpe-token-from-payment-flow>",
			"txnid": "<txnid-from-query-params>"
		}
		```

- Expected payment-result sequence:
	1. Read `status` and `txnid` from the query string.
	2. Call the payments module `decrypt-token` API with the `txnid` from query params and the `sabbpe_token` from the payment flow.
	3. Render the JSON response from `decrypt-token` in the UI as the payment-result details card.
	4. POST the exact same JSON payload to `POST /api/transaction/store-txn-details` so the backend writes `merchant_profiles.txn_details`.
	5. Show a `Dashboard` button on the `payment-result` page.
	6. When the user clicks `Dashboard`, navigate them back to the merchant dashboard.

- The backend must still enforce `txn_details IS NULL` and return HTTP 200 when the row is already processed (idempotent behavior). The frontend-stored path is supplemental; backend-to-backend callback remains the source of truth.

### When the user is redirected to `payment-result`

- Typical query when SabbPe redirects back after payment success/failure:
	- `https://yourfrontend/payment-result?status=success&txnid=<encodedTxnId>`

- Recommended client flow on `payment-result`:
	1. Parse query params (`status`, `txnid`). Keep `txnid` encoded in the URL — do not expose raw secrets.
	2. Call the payments module directly at `POST https://pymntsuat.sabbpe.com/api/v1/decrypt-token` with the SabbPe token and `txnid`.
	3. Use this exact body shape:
		```json
		{
			"sabbpe_token": "<sabbpe_token-from-session-or-return-state>",
			"txnid": "<txnid-from-query-params>"
		}
		```
	4. If `decrypt-token` returns a payload, render any safe fields in the UI and then POST the exact JSON payload to `POST /api/transaction/store-txn-details` (authenticated). This is the same JSON shape the backend would receive via callback.
	5. If `decrypt-token` fails or the backend indicates the payload isn't available yet, show a "processing" state and optionally poll a status endpoint (e.g. `GET /api/transaction/status?txnid=`) which checks whether `merchant_profiles.txn_details` has been written by the callback.
	6. If `store-txn-details` returns 200 (stored or already-present), show the final success/failure UI. If it returns an error, surface a friendly message and log for reconciliation.

- Fallbacks and UX:
	- If polling takes too long, provide a clear message and a manual retry button that re-calls `decrypt-token` and `store-txn-details`.
	- The backend callback from SabbPe remains authoritative — if the frontend cannot store the payload, the callback will still arrive and write `txn_details`.

- Security & idempotency reminders:
	- Always call `decrypt-token` server-side; never expose SabbPe credentials to the browser.
	- Do not hardcode environment-specific URLs in code. Use env vars or app config for the payments module base URL and any API origins.
	- Keep `store-txn-details` idempotent and only write when `txn_details IS NULL`; return HTTP 200 if already processed.
	- Use encoded/encrypted `txnid` in the URL, validate on the server, and authenticate all store/decrypt endpoints.

- Minimal client snippet for `payment-result`:
```ts
async function onPaymentResultPage() {
	const params = new URLSearchParams(window.location.search);
	const txnid = params.get('txnid');
	const sabbpeToken = params.get('sabbpe_token');
	if (!txnid) return; // show error
	if (!sabbpeToken) return; // show error
	const paymentsModuleBaseUrl = import.meta.env.VITE_PAYMENTS_MODULE_BASE_URL;
	if (!paymentsModuleBaseUrl) return; // show config error

	// 1: ask the payments module to decrypt
	const decRes = await fetch(`${paymentsModuleBaseUrl}/api/v1/decrypt-token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ sabbpe_token: sabbpeToken, txnid })
	});
	if (!decRes.ok) {
		// show processing UI or poll status
		return;
	}
	const decryptPayload = await decRes.json();

	// 2: render the payload in the UI
	// renderPayload(decryptPayload);

	// 3: store the same payload
	await fetch('/api/transaction/store-txn-details', {
		method: 'POST',
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ txn_details: decryptPayload })
	});
}
```

### Dashboard behavior after payment

- After the payment-result page stores the decrypted payload, the merchant can click a `Dashboard` button to return to the application dashboard.
- In the dashboard, the relevant order should show a `View transaction details` dropdown or expandable section inside the `application_status` component.

### Current scope status

- The main payment lifecycle is now the current implementation scope and is considered end-to-end:
	1. `Pay with SabbPe`
	2. `/token`
	3. store `transactionId`
	4. `/initiate`
	5. SabbPe payment completion
	6. `payment-result` decrypt + render + store payload
	7. `Dashboard` button return path
	8. replace the paid-order action with `Payment completed` or `View transaction details`
- The authenticated `/api/transaction/details` flow and dashboard dropdown fetch are explicitly deferred to a later phase.

### Dashboard button state

- Before payment is completed, the dashboard should show `Pay with SabbPe` for that order.
- After payment is completed and the user returns to the dashboard, that same order should no longer show `Pay with SabbPe`.
- Instead, the order should show `View transaction details` or a completed state such as `Payment completed`.
- If multiple orders exist, each order row/card should manage its own button state independently.
- The `Pay with SabbPe` action is only for unpaid orders; once the payment flow is complete, the action must switch to viewing the stored transaction details.

### `/details` flow decision

- Mark this as a later phase.
- We will implement the full `POST /api/transaction/details` read flow end-to-end only after the main flow is complete:
	1. `/token`
	2. store `transactionId`
	3. `/initiate`
	4. `payment-result` decrypt + store txn payload
	5. `Dashboard` button return path
- After that flow is stable, we will add the authenticated `/details` endpoint and the dashboard dropdown that fetches `merchant_profiles.txn_details` for the matching order.
- At that later stage, the frontend should use the transaction/order identifier already present in the loaded dashboard row, and the backend should read `merchant_profiles.txn_details` for the signed-in merchant.
- For now, the dashboard only needs the current payment flow and the `Dashboard` return button; the expandable transaction-details UI is deferred.

### Suggested read flow for `View transaction details`

1. User opens the dashboard and sees the order row in `application_status`.
2. User clicks `View transaction details`.
3. Frontend calls authenticated `POST /api/transaction/details` with `{ transaction_id }` or `{ txnid }`.
4. Backend verifies the current merchant session, queries `merchant_profiles` by `"Transaction Id"`, and returns `txn_details`.
5. Frontend expands the dropdown and renders the JSON response.
6. If `txn_details` is still `null`, show a `No transaction details available yet` state and let the user retry later.

## Agreed rules
- The backend will expose a callback API for payment payloads.
- The incoming payload will be stored as raw JSON only.
- The same column will be used for both payment callback paths, if needed later.
- `txnid` is the payment reference we store in `merchant_profiles."Transaction Id"`.
- `merchant_profiles."Transaction Id"` is used to find the correct row.
- Insert/write is allowed only when `txn_details` is `null`.
- If `txn_details` already has a value for that `txnid`, the write is skipped.
- This makes the operation idempotent.
- For the first implementation pass, only the backend-to-backend callback flow is required.

## Storage rule
- Table: `merchant_profiles`
- Correlation key column: `"Transaction Id"`
- Target column: `txn_details`
- Write condition: `txn_details IS NULL`

## Payload handling
- Store the payload exactly as received.
- Do not normalize or reshape the JSON for the first version.
- Do not rely on frontend state as the source of truth for this callback flow.

## Implementation order
1. Add the backend API that stores `transaction_id` into `merchant_profiles."Transaction Id"`.
2. Add the backend API that stores the raw `decrypt-token` response into `merchant_profiles.txn_details`.
3. Add the backend callback API at `{baseurl}/api/payment/sabbpe/callback`.
4. Use `merchant_profiles."Transaction Id"` to locate the merchant row.
5. Write raw payload only if `txn_details` is empty.
6. Return a success response even when the payload is already present, so the callback stays idempotent.

## Remaining implementation checklist
- Add the `txn_details` column in Supabase if it is not already present. ✅
- Implement the backend API that saves `transaction_id` into `merchant_profiles."Transaction Id"`. ✅
- Implement the backend callback API at `{baseurl}/api/payment/sabbpe/callback`. ✅
- Make the callback API return `200` on success and on already-processed requests. ✅
- Ensure both APIs use `merchant_profiles."Transaction Id"` to identify the row. ✅
- Ensure both APIs only write when `txn_details` is `null`. ✅
- Keep raw JSON storage unchanged. ✅

## Current decision
- Raw payload only.
- No source envelope.
- No frontend-driven update for the first pass.
