-- Add distributor profile management columns.
-- These support the new Distributor Profile Management section in Settings.
-- Safe to run multiple times (idempotent).

ALTER TABLE public.distributor_profiles
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS pincode TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_holder TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_ifsc TEXT,
  ADD COLUMN IF NOT EXISTS pan_number TEXT,
  ADD COLUMN IF NOT EXISTS aadhaar_last4 TEXT,
  ADD COLUMN IF NOT EXISTS pan_document_path TEXT,
  ADD COLUMN IF NOT EXISTS aadhaar_document_path TEXT,
  ADD COLUMN IF NOT EXISTS profile_photo_path TEXT,
  ADD COLUMN IF NOT EXISTS default_commission_rate NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS payout_cycle TEXT DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS pan_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS aadhaar_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bank_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS kyc_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bank_updated_at TIMESTAMPTZ;

-- CHECK constraint for payout_cycle (idempotent)
DO $$ BEGIN
  ALTER TABLE public.distributor_profiles
    ADD CONSTRAINT distributor_profiles_payout_cycle_check
    CHECK (payout_cycle IN ('daily', 'weekly', 'biweekly', 'monthly'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Storage policies for profile-images UPDATE (idempotent)
DO $$ BEGIN
  CREATE POLICY "Users can update their own profile images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'profile-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Storage policies for profile-images DELETE (idempotent)
DO $$ BEGIN
  CREATE POLICY "Users can delete their own profile images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'profile-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
