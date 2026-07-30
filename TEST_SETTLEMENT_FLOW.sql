-- =============================================
-- TEST SETUP: Distributor + Merchant + Transaction + Settlement + Chargeback
-- Run this in MariaDB: sabbpeonboarding
-- =============================================

-- STEP 1: Find your distributor and merchant
-- =============================================
SELECT id, user_id, full_name, email, mobile_number, distributor_id, onboarding_status
FROM merchant_profiles
WHERE email LIKE '%fosil%' OR mobile_number LIKE '%8185058845%' OR full_name LIKE '%abcv%';

-- Note down the merchant_id and distributor_id from above

-- STEP 2: Check distributor profile
-- =============================================
SELECT dp.id, dp.user_id, dp.business_name, dp.email, dp.available_recovery_balance, dp.total_recovered_amount, dp.security_deposit
FROM distributor_profiles dp
WHERE dp.email LIKE '%96x8ndpf%' OR dp.user_id IN (SELECT id FROM users WHERE email LIKE '%96x8ndpf%');

-- STEP 3: Add test transactions for the merchant
-- =============================================
-- Replace 'MERCHANT_ID_HERE' with actual merchant ID from Step 1

INSERT INTO transactions (id, merchant_id, transaction_id, amount, currency, status, payment_method, customer_name, customer_email, customer_mobile, settlement_status, created_at, updated_at)
VALUES
(UUID(), 'MERCHANT_ID_HERE', 'TXN-TEST-001', 5000.00, 'INR', 'completed', 'upi', 'Test Customer 1', 'cust1@test.com', '9000000001', 'unsettled', NOW(), NOW()),
(UUID(), 'MERCHANT_ID_HERE', 'TXN-TEST-002', 3500.00, 'INR', 'completed', 'card', 'Test Customer 2', 'cust2@test.com', '9000000002', 'unsettled', NOW(), NOW()),
(UUID(), 'MERCHANT_ID_HERE', 'TXN-TEST-003', 7500.00, 'INR', 'completed', 'netbanking', 'Test Customer 3', 'cust3@test.com', '9000000003', 'unsettled', NOW(), NOW()),
(UUID(), 'MERCHANT_ID_HERE', 'TXN-TEST-004', 2000.00, 'INR', 'completed', 'upi', 'Test Customer 4', 'cust4@test.com', '9000000004', 'unsettled', NOW(), NOW()),
(UUID(), 'MERCHANT_ID_HERE', 'TXN-TEST-005', 12000.00, 'INR', 'completed', 'card', 'Test Customer 5', 'cust5@test.com', '9000000005', 'unsettled', NOW(), NOW());

-- STEP 4: Verify transactions were added
-- =============================================
SELECT id, transaction_id, amount, status, settlement_status, created_at
FROM transactions
WHERE merchant_id = 'MERCHANT_ID_HERE' AND settlement_status = 'unsettled'
ORDER BY created_at DESC;

-- STEP 5: Check merchant settlement config (rolling reserve settings)
-- =============================================
SELECT id, business_name, rolling_reserve_enabled, rolling_reserve_percentage,
       rolling_reserve_fixed_inr, settlement_cycle_days, settlement_terms_locked,
       pending_settlement_amount, total_settled_amount, last_settled_at
FROM merchant_profiles
WHERE id = 'MERCHANT_ID_HERE';

-- STEP 6: After running settlement via UI, check settlement_history
-- =============================================
SELECT id, settlement_batch_ref, settlement_date, gross_amount, mdr_deduction,
       rolling_reserve_held, net_settlement_amount, transaction_count, status, processed_at
FROM settlement_history
WHERE merchant_id = 'MERCHANT_ID_HERE'
ORDER BY settlement_date DESC;

-- STEP 7: Check rolling reserve ledger
-- =============================================
SELECT id, transaction_ref, gross_settlement_amount, reserve_amount,
       reserve_date, release_date, status, released_at, debited_at, debit_reason
FROM rolling_reserve_ledger
WHERE merchant_id = 'MERCHANT_ID_HERE'
ORDER BY reserve_date DESC;

-- STEP 8: Check merchant balances after settlement
-- =============================================
SELECT id, business_name, pending_settlement_amount, total_settled_amount,
       last_settled_at, total_chargeback_amount, pending_chargeback_amount,
       chargeback_recovery_available
FROM merchant_profiles
WHERE id = 'MERCHANT_ID_HERE';

-- STEP 9: Create a test chargeback
-- =============================================
SET @cb_id = UUID();
SET @merchant_id = 'MERCHANT_ID_HERE';
SET @chargeback_amount = 3000.00;

INSERT INTO chargebacks (id, merchant_id, amount, currency, reason, status, chargeback_date, created_at)
VALUES (@cb_id, @merchant_id, @chargeback_amount, 'INR', 'Test chargeback - customer dispute', 'pending', CURDATE(), NOW());

-- Update merchant chargeback tracking
UPDATE merchant_profiles
SET total_chargeback_amount = total_chargeback_amount + @chargeback_amount,
    pending_chargeback_amount = pending_chargeback_amount + @chargeback_amount
WHERE id = @merchant_id;

-- Add chargeback history entry
INSERT INTO chargeback_history (id, chargeback_id, merchant_id, action, event_type, recovered_amount, recovery_source, event_timestamp, comments)
VALUES (UUID(), @cb_id, @merchant_id, 'create', 'CHARGEBACK_CREATED', @chargeback_amount, NULL, NOW(), 'Chargeback created for test');

-- STEP 10: Verify chargeback was created
-- =============================================
SELECT id, merchant_id, amount, reason, status, chargeback_date
FROM chargebacks
WHERE merchant_id = 'MERCHANT_ID_HERE'
ORDER BY chargeback_date DESC;

-- STEP 11: After running recovery via UI, check chargeback status
-- =============================================
SELECT id, amount, status, recovered_at, recovery_source, recovery_steps
FROM chargebacks
WHERE id = @cb_id;

-- STEP 12: Check chargeback audit trail
-- =============================================
SELECT id, action, event_type, recovered_amount, recovery_source, event_timestamp, comments
FROM chargeback_history
WHERE chargeback_id = @cb_id
ORDER BY event_timestamp DESC;

-- STEP 13: Check distributor recovery (if chargeback went to distributor balance)
-- =============================================
SELECT drh.id, drh.distributor_id, drh.chargeback_id, drh.merchant_id, drh.amount, drh.created_at
FROM distributor_recovery_history drh
WHERE drh.merchant_id = 'MERCHANT_ID_HERE'
ORDER BY drh.created_at DESC;

-- STEP 14: Check distributor balance after recovery
-- =============================================
SELECT dp.id, dp.business_name, dp.available_recovery_balance, dp.total_recovered_amount
FROM distributor_profiles dp
WHERE dp.user_id IN (
    SELECT distributor_id FROM merchant_profiles WHERE id = 'MERCHANT_ID_HERE'
);

-- =============================================
-- QUICK HEALTH CHECK: All balances in one query
-- =============================================
SELECT
    mp.id,
    mp.full_name,
    mp.business_name,
    mp.pending_settlement_amount,
    mp.total_settled_amount,
    mp.total_chargeback_amount,
    mp.pending_chargeback_amount,
    mp.chargeback_recovery_available,
    (SELECT COUNT(*) FROM transactions t WHERE t.merchant_id = mp.id AND t.settlement_status = 'unsettled') AS unsettled_txns,
    (SELECT COUNT(*) FROM chargebacks cb WHERE cb.merchant_id = mp.id AND cb.status = 'pending') AS pending_chargebacks,
    (SELECT COALESCE(SUM(rrl.reserve_amount), 0) FROM rolling_reserve_ledger rrl WHERE rrl.merchant_id = mp.id AND rrl.status = 'held') AS held_reserves
FROM merchant_profiles mp
WHERE mp.id = 'MERCHANT_ID_HERE';
