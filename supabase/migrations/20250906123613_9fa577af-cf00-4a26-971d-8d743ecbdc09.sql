-- Create merchant onboarding tables with proper schema
CREATE TYPE public.onboarding_status AS ENUM ('pending', 'in_progress', 'verified', 'rejected');
CREATE TYPE public.kyc_status AS ENUM ('pending', 'uploaded', 'verified', 'rejected');
CREATE TYPE public.document_type AS ENUM ('pan_card', 'aadhaar_card', 'business_proof', 'bank_statement', 'cancelled_cheque', 'video_kyc', 'selfie');

-- Merchant profiles table
CREATE TABLE public.merchant_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  mobile_number TEXT NOT NULL,
  email TEXT NOT NULL,
  pan_number TEXT,
  aadhaar_number TEXT,
  business_name TEXT,
  gst_number TEXT,
  onboarding_status onboarding_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Bank details table
CREATE TABLE public.merchant_bank_details (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES public.merchant_profiles(id) ON DELETE CASCADE,
  account_number TEXT NOT NULL,
  ifsc_code TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_holder_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(merchant_id)
);

-- Documents table
CREATE TABLE public.merchant_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES public.merchant_profiles(id) ON DELETE CASCADE,
  document_type document_type NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  status kyc_status NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  verified_at TIMESTAMP WITH TIME ZONE,
  verified_by UUID REFERENCES auth.users(id)
);

-- KYC verification table
CREATE TABLE public.merchant_kyc (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES public.merchant_profiles(id) ON DELETE CASCADE,
  video_kyc_completed BOOLEAN DEFAULT FALSE,
  location_captured BOOLEAN DEFAULT FALSE,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  video_kyc_file_path TEXT,
  selfie_file_path TEXT,
  kyc_status kyc_status NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMP WITH TIME ZONE,
  verified_at TIMESTAMP WITH TIME ZONE,
  verified_by UUID REFERENCES auth.users(id),
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(merchant_id)
);

-- Onboarding audit trail
CREATE TABLE public.onboarding_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES public.merchant_profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  performed_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.merchant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_bank_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_kyc ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for merchant_profiles
CREATE POLICY "Users can view their own profile" 
ON public.merchant_profiles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own profile" 
ON public.merchant_profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.merchant_profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

-- RLS Policies for merchant_bank_details
CREATE POLICY "Users can view their own bank details" 
ON public.merchant_bank_details 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.merchant_profiles 
    WHERE id = merchant_bank_details.merchant_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can create their own bank details" 
ON public.merchant_bank_details 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.merchant_profiles 
    WHERE id = merchant_bank_details.merchant_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own bank details" 
ON public.merchant_bank_details 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.merchant_profiles 
    WHERE id = merchant_bank_details.merchant_id 
    AND user_id = auth.uid()
  )
);

-- RLS Policies for merchant_documents
CREATE POLICY "Users can view their own documents" 
ON public.merchant_documents 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.merchant_profiles 
    WHERE id = merchant_documents.merchant_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can create their own documents" 
ON public.merchant_documents 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.merchant_profiles 
    WHERE id = merchant_documents.merchant_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own documents" 
ON public.merchant_documents 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.merchant_profiles 
    WHERE id = merchant_documents.merchant_id 
    AND user_id = auth.uid()
  )
);

-- RLS Policies for merchant_kyc
CREATE POLICY "Users can view their own KYC" 
ON public.merchant_kyc 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.merchant_profiles 
    WHERE id = merchant_kyc.merchant_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can create their own KYC" 
ON public.merchant_kyc 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.merchant_profiles 
    WHERE id = merchant_kyc.merchant_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own KYC" 
ON public.merchant_kyc 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.merchant_profiles 
    WHERE id = merchant_kyc.merchant_id 
    AND user_id = auth.uid()
  )
);

-- RLS Policies for onboarding_audit_log  
CREATE POLICY "Users can view their own audit logs" 
ON public.onboarding_audit_log 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.merchant_profiles 
    WHERE id = onboarding_audit_log.merchant_id 
    AND user_id = auth.uid()
  )
);

-- Storage buckets for document uploads
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('merchant-documents', 'merchant-documents', false),
  ('kyc-videos', 'kyc-videos', false),
  ('profile-images', 'profile-images', false);

-- Storage policies for merchant documents
CREATE POLICY "Users can upload their own documents" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'merchant-documents' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own documents" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'merchant-documents' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own documents" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'merchant-documents' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Storage policies for KYC videos
CREATE POLICY "Users can upload their own KYC videos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'kyc-videos' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own KYC videos" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'kyc-videos' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Storage policies for profile images
CREATE POLICY "Users can upload their own profile images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'profile-images' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own profile images" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'profile-images' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Create triggers for updating timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_merchant_profiles_updated_at
  BEFORE UPDATE ON public.merchant_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_merchant_bank_details_updated_at
  BEFORE UPDATE ON public.merchant_bank_details
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_merchant_kyc_updated_at
  BEFORE UPDATE ON public.merchant_kyc
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();