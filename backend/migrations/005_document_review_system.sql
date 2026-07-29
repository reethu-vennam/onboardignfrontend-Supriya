-- Document Review & Score Card System
-- Migration 005

-- 1. Add validation_status to merchant_documents
ALTER TABLE merchant_documents
ADD COLUMN IF NOT EXISTS validation_status VARCHAR(20) DEFAULT 'unchecked'
CHECK (validation_status IN ('unchecked', 'passed', 'failed', 'pending'));

-- 2. Add verified_by to merchant_documents (for tracking who verified)
ALTER TABLE merchant_documents
ADD COLUMN IF NOT EXISTS verified_by VARCHAR(255);

-- 3. Add onboarding_score to merchant_profiles
ALTER TABLE merchant_profiles
ADD COLUMN IF NOT EXISTS onboarding_score INTEGER DEFAULT 0
CHECK (onboarding_score BETWEEN 0 AND 100);

-- 4. Create document_validations table
CREATE TABLE IF NOT EXISTS document_validations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_document_id UUID NOT NULL REFERENCES merchant_documents(id) ON DELETE CASCADE,
    merchant_profile_id UUID NOT NULL REFERENCES merchant_profiles(id),
    check_type VARCHAR(50) NOT NULL,
    check_result VARCHAR(10) NOT NULL CHECK (check_result IN ('pass', 'fail')),
    checked_value TEXT,
    expected_value TEXT,
    validated_by VARCHAR(255) DEFAULT 'system',
    validated_at TIMESTAMPTZ DEFAULT NOW(),
    overridden_by VARCHAR(100),
    overridden_at TIMESTAMPTZ,
    override_reason TEXT
);

-- 5. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_validations_doc_id ON document_validations(merchant_document_id);
CREATE INDEX IF NOT EXISTS idx_document_validations_profile_id ON document_validations(merchant_profile_id);
CREATE INDEX IF NOT EXISTS idx_merchant_documents_validation_status ON merchant_documents(validation_status);
CREATE INDEX IF NOT EXISTS idx_merchant_profiles_onboarding_score ON merchant_profiles(onboarding_score);
