-- Migration: Create transactions table
-- This table stores all payment transactions for merchants

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchant_profiles(id) ON DELETE CASCADE,
    transaction_id TEXT NOT NULL UNIQUE,
    amount DECIMAL(12,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL CHECK (status IN ('success', 'completed', 'pending', 'failed', 'cancelled')),
    payment_method TEXT,
    customer_name TEXT,
    customer_email TEXT,
    customer_mobile TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for distributor queries (get transactions by merchant_ids)
CREATE INDEX IF NOT EXISTS idx_transactions_merchant_id ON transactions(merchant_id);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);

-- Index for transaction_id lookups (webhook dedup)
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_id ON transactions(transaction_id);
