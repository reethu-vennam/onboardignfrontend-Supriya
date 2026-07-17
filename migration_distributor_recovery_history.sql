SET FOREIGN_KEY_CHECKS=0;

INSERT INTO `distributor_recovery_history` (`id`, `distributor_id`, `chargeback_id`, `merchant_id`, `amount`, `created_at`) VALUES ('41402dc1-a3ff-490d-b0b1-7751e3a8e95f', '1e7483b1-6adb-4f3b-a827-bf700765af17', '4af5a4ea-23e6-44f2-af48-92f822e9e3cf', 'b56ccc9b-b9e8-4177-8c93-7508f30b67fd', 5000.00, '2026-06-25 07:21:34') ON DUPLICATE KEY UPDATE `distributor_id`=VALUES(`distributor_id`), `chargeback_id`=VALUES(`chargeback_id`), `merchant_id`=VALUES(`merchant_id`), `amount`=VALUES(`amount`), `created_at`=VALUES(`created_at`);

SET FOREIGN_KEY_CHECKS=1;