INSERT IGNORE INTO product_catalog (id, product_code, product_name, product_description, price, price_type, display_price, display_price_type, category, is_active, display_order) VALUES
(UUID(), 'PROD_SWIPE', 'Swipe Machine', 'Physical POS machine for card payments', 4999, 'One-Time', 4999, 'One-Time', 'hardware', TRUE, 1),
(UUID(), 'PROD_QR', 'QR Code Payment', 'Static and dynamic QR code payments', 0, 'Monthly', 0, 'Free', 'software', TRUE, 2),
(UUID(), 'PROD_GATEWAY', 'Payment Gateway', 'Online payment gateway for websites', 999, 'Monthly', 999, 'Monthly', 'software', TRUE, 3),
(UUID(), 'PROD_LINK', 'Payment Link', 'Generate payment links to share with customers', 199, 'Monthly', 199, 'Monthly', 'software', TRUE, 4),
(UUID(), 'PROD_SUB', 'Subscription Billing', 'Recurring payment and subscription management', 1499, 'Monthly', 1499, 'Monthly', 'software', TRUE, 5),
(UUID(), 'PROD_UPPI', 'UPI AutoPay', 'UPI mandate and recurring payments', 299, 'Monthly', 299, 'Monthly', 'software', TRUE, 6);
