-- Update RLS policies for merchant_documents to allow distributors/employees to manage documents for their merchants

DROP POLICY IF EXISTS "Users can view their own documents" ON public.merchant_documents;
CREATE POLICY "Users can view their own documents"
ON public.merchant_documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.merchant_profiles
    WHERE id = merchant_documents.merchant_id
    AND (user_id = auth.uid() OR distributor_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can create their own documents" ON public.merchant_documents;
CREATE POLICY "Users can create their own documents"
ON public.merchant_documents
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.merchant_profiles
    WHERE id = merchant_documents.merchant_id
    AND (user_id = auth.uid() OR distributor_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can update their own documents" ON public.merchant_documents;
CREATE POLICY "Users can update their own documents"
ON public.merchant_documents
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.merchant_profiles
    WHERE id = merchant_documents.merchant_id
    AND (user_id = auth.uid() OR distributor_id = auth.uid())
  )
);

-- Update RLS policies for merchant_bank_details to allow distributors/employees

DROP POLICY IF EXISTS "Users can view their own bank details" ON public.merchant_bank_details;
CREATE POLICY "Users can view their own bank details"
ON public.merchant_bank_details
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.merchant_profiles
    WHERE id = merchant_bank_details.merchant_id
    AND (user_id = auth.uid() OR distributor_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can create their own bank details" ON public.merchant_bank_details;
CREATE POLICY "Users can create their own bank details"
ON public.merchant_bank_details
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.merchant_profiles
    WHERE id = merchant_bank_details.merchant_id
    AND (user_id = auth.uid() OR distributor_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can update their own bank details" ON public.merchant_bank_details;
CREATE POLICY "Users can update their own bank details"
ON public.merchant_bank_details
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.merchant_profiles
    WHERE id = merchant_bank_details.merchant_id
    AND (user_id = auth.uid() OR distributor_id = auth.uid())
  )
);

-- Update RLS policies for merchant_kyc to allow distributors/employees

DROP POLICY IF EXISTS "Users can view their own KYC" ON public.merchant_kyc;
CREATE POLICY "Users can view their own KYC"
ON public.merchant_kyc
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.merchant_profiles
    WHERE id = merchant_kyc.merchant_id
    AND (user_id = auth.uid() OR distributor_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can create their own KYC" ON public.merchant_kyc;
CREATE POLICY "Users can create their own KYC"
ON public.merchant_kyc
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.merchant_profiles
    WHERE id = merchant_kyc.merchant_id
    AND (user_id = auth.uid() OR distributor_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can update their own KYC" ON public.merchant_kyc;
CREATE POLICY "Users can update their own KYC"
ON public.merchant_kyc
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.merchant_profiles
    WHERE id = merchant_kyc.merchant_id
    AND (user_id = auth.uid() OR distributor_id = auth.uid())
  )
);

-- Update RLS policies for merchant_profiles to allow distributors/employees to view/update their merchants

DROP POLICY IF EXISTS "Users can view their own profile" ON public.merchant_profiles;
CREATE POLICY "Users can view their own profile"
ON public.merchant_profiles
FOR SELECT
USING (
  user_id = auth.uid() OR distributor_id = auth.uid()
);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.merchant_profiles;
CREATE POLICY "Users can update their own profile"
ON public.merchant_profiles
FOR UPDATE
USING (
  user_id = auth.uid() OR distributor_id = auth.uid()
);
