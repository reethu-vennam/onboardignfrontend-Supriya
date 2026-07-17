ALTER TABLE merchant_profiles DROP COLUMN IF EXISTS Transaction Id; ALTER TABLE merchant_profiles ADD COLUMN IF NOT EXISTS legacy_transaction_id VARCHAR(100);
