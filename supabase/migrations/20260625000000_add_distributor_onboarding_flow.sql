-- Add distributor agreement onboarding flow columns to distributor_profiles.
-- Safe to run multiple times (idempotent).

ALTER TABLE public.distributor_profiles
  ADD COLUMN IF NOT EXISTS agreement_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS agreement_file_path TEXT,
  ADD COLUMN IF NOT EXISTS agreement_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agreement_sent_by UUID,
  ADD COLUMN IF NOT EXISTS signed_agreement_path TEXT,
  ADD COLUMN IF NOT EXISTS agreement_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agreement_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agreement_approved_by UUID,
  ADD COLUMN IF NOT EXISTS agreement_rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS credentials_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS credentials_sent_by UUID,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_token TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_token_used_at TIMESTAMPTZ;

-- CHECK constraint for agreement_status (idempotent)
DO $$ BEGIN
  ALTER TABLE public.distributor_profiles
    ADD CONSTRAINT distributor_profiles_agreement_status_check
    CHECK (agreement_status IN ('pending','sent','uploaded','approved','rejected','credentials_sent','onboarding_completed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create storage bucket for distributor agreements (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('distributor-agreements', 'distributor-agreements', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for distributor-agreements bucket
DO $$ BEGIN
  CREATE POLICY "Distributors can upload their own agreements"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'distributor-agreements' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Distributors can read their own agreements"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'distributor-agreements' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Distributors can update their own agreements"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'distributor-agreements' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Distributors can delete their own agreements"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'distributor-agreements' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Allow admin service role access (via backend admin client) via bucket-level
-- policy: service_role users bypass RLS, so only anon/authenticated need policies.
-- Authenticated non-owner users (other distributors/admins via anon key) are blocked by the
-- USING clause above. Admins go through the backend (service_role), which bypasses RLS entirely.

-- ─── KYC columns ────────────────────────────────────────────────────────────

ALTER TABLE public.distributor_profiles
  ADD COLUMN IF NOT EXISTS kyc_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS kyc_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kyc_verified_by UUID;

DO $$ BEGIN
  ALTER TABLE public.distributor_profiles
    ADD CONSTRAINT distributor_profiles_kyc_status_check
    CHECK (kyc_status IN ('pending','submitted','approved','rejected'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
