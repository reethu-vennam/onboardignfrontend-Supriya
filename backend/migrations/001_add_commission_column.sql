-- Migration: Add commission column to merchant_profiles
-- This must be run before the distributor create-merchant feature will work

ALTER TABLE merchant_profiles
ADD COLUMN IF NOT EXISTS commission DECIMAL(5,2);
