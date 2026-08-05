-- Fix integration cost for all products and existing merchants
-- Run this SQL on your database

-- 1. Set price_integration_fee for products that only have monthly pricing
--    This ensures new selections default to 'integration' pricing_type
UPDATE product_catalog SET price_integration_fee = 99.00 WHERE product_code = 'PROD_002' AND price_integration_fee IS NULL;
UPDATE product_catalog SET price_integration_fee = 450.00 WHERE product_code = 'PROD_003' AND price_integration_fee IS NULL;
UPDATE product_catalog SET price_integration_fee = 599.00 WHERE product_code = 'PROD_005' AND price_integration_fee IS NULL;
UPDATE product_catalog SET price_integration_fee = 99.00 WHERE product_code = 'PROD_006' AND price_integration_fee IS NULL;
UPDATE product_catalog SET price_integration_fee = 599.00 WHERE product_code = 'PROD_008' AND price_integration_fee IS NULL;
UPDATE product_catalog SET price_integration_fee = 599.00 WHERE product_code = 'PROD_009' AND price_integration_fee IS NULL;

-- 2. Fix all existing merchants: change pricing_type from 'monthly' to 'integration' in selected_products JSON
--    and recalculate costs
UPDATE merchant_profiles
SET selected_products = REPLACE(selected_products, '"pricing_type":"monthly"', '"pricing_type":"integration"')
WHERE selected_products IS NOT NULL
  AND selected_products LIKE '%PROD_002%'
  AND selected_products LIKE '%"pricing_type":"monthly"%';

UPDATE merchant_profiles
SET selected_products = REPLACE(selected_products, '"pricing_type":"monthly"', '"pricing_type":"integration"')
WHERE selected_products IS NOT NULL
  AND selected_products LIKE '%PROD_003%'
  AND selected_products LIKE '%"pricing_type":"monthly"%';

UPDATE merchant_profiles
SET selected_products = REPLACE(selected_products, '"pricing_type":"monthly"', '"pricing_type":"integration"')
WHERE selected_products IS NOT NULL
  AND selected_products LIKE '%PROD_005%'
  AND selected_products LIKE '%"pricing_type":"monthly"%';

UPDATE merchant_profiles
SET selected_products = REPLACE(selected_products, '"pricing_type":"monthly"', '"pricing_type":"integration"')
WHERE selected_products IS NOT NULL
  AND selected_products LIKE '%PROD_006%'
  AND selected_products LIKE '%"pricing_type":"monthly"%';

UPDATE merchant_profiles
SET selected_products = REPLACE(selected_products, '"pricing_type":"monthly"', '"pricing_type":"integration"')
WHERE selected_products IS NOT NULL
  AND selected_products LIKE '%PROD_008%'
  AND selected_products LIKE '%"pricing_type":"monthly"%';

UPDATE merchant_profiles
SET selected_products = REPLACE(selected_products, '"pricing_type":"monthly"', '"pricing_type":"integration"')
WHERE selected_products IS NOT NULL
  AND selected_products LIKE '%PROD_009%'
  AND selected_products LIKE '%"pricing_type":"monthly"%';

-- 3. Recalculate costs: move monthly cost to integration cost for all merchants
UPDATE merchant_profiles
SET total_integration_cost = total_monthly_cost,
    total_monthly_cost = 0.00
WHERE total_monthly_cost > 0
  AND total_integration_cost = 0
  AND selected_products IS NOT NULL;
