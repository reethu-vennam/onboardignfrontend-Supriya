-- Add missing columns to merchant_profiles table
ALTER TABLE public.merchant_profiles
ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'proprietorship',
ADD COLUMN IF NOT EXISTS distributor_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS business_name TEXT,
ADD COLUMN IF NOT EXISTS pan_number TEXT,
ADD COLUMN IF NOT EXISTS gst_number TEXT;

-- Add check constraint for entity_type
ALTER TABLE public.merchant_profiles
ADD CONSTRAINT merchant_profiles_entity_type_check
CHECK (entity_type IN ('proprietorship', 'partnership', 'pvt_ltd_llp', 'government_psu'));

-- Update RLS policies to allow distributors to create merchant profiles
CREATE POLICY "Distributors can create merchant profiles"
ON public.merchant_profiles
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'distributor'
  )
);

-- Allow distributors to view merchant profiles they created
CREATE POLICY "Distributors can view their merchants"
ON public.merchant_profiles
FOR SELECT
TO authenticated
USING (
  distributor_id = auth.uid() OR
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);