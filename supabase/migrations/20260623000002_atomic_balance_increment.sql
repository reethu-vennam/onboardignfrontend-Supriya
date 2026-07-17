-- Atomic balance increment function for settlement operations.
-- Eliminates read-then-write race condition on merchant_profiles balances.

CREATE OR REPLACE FUNCTION increment_merchant_balances(
  p_merchant_id UUID,
  p_pending_increment NUMERIC,
  p_total_increment NUMERIC
)
RETURNS void AS $$
BEGIN
  UPDATE merchant_profiles
  SET
    pending_settlement_amount = pending_settlement_amount + p_pending_increment,
    total_settled_amount = total_settled_amount + p_total_increment
  WHERE id = p_merchant_id;
END;
$$ LANGUAGE plpgsql;
