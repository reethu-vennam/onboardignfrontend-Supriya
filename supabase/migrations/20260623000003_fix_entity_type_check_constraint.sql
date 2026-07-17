-- Fix entity_type CHECK constraint to match backend ALLOWED_ENTITY_TYPES.
-- Old constraint only allowed 4 values; backend normalises to 11.

-- Migrate existing data: pvt_ltd_llp → pvt_ltd (backend maps this value)
UPDATE public.merchant_profiles
SET entity_type = 'pvt_ltd'
WHERE entity_type = 'pvt_ltd_llp';

-- Migrate any other stale values to the closest valid type
UPDATE public.merchant_profiles
SET entity_type = 'proprietorship'
WHERE entity_type NOT IN (
    'proprietorship', 'individual', 'partnership', 'llp',
    'pvt_ltd', 'public_ltd', 'trust', 'society', 'huf',
    'government_psu', 'education'
);

-- Drop old constraint
ALTER TABLE public.merchant_profiles
DROP CONSTRAINT IF EXISTS merchant_profiles_entity_type_check;

-- Add new constraint matching backend ALLOWED_ENTITY_TYPES
ALTER TABLE public.merchant_profiles
ADD CONSTRAINT merchant_profiles_entity_type_check
CHECK (entity_type IN (
    'proprietorship',
    'individual',
    'partnership',
    'llp',
    'pvt_ltd',
    'public_ltd',
    'trust',
    'society',
    'huf',
    'government_psu',
    'education'
));
