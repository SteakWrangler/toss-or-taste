-- Create Apple IAP Transactions Table
-- This table tracks all Apple in-app purchase transactions to prevent duplicate processing
-- and provide an audit trail for purchases

CREATE TABLE IF NOT EXISTS apple_iap_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User who made the purchase
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Apple transaction identifiers
  transaction_id TEXT NOT NULL UNIQUE, -- Apple's unique transaction ID
  original_transaction_id TEXT, -- For subscriptions, tracks the original purchase

  -- Product information
  product_id TEXT NOT NULL, -- e.g., com.linksmarttech.tossortaste.single_credit
  product_type TEXT NOT NULL CHECK (product_type IN ('consumable', 'subscription')),

  -- Purchase details
  purchase_date TIMESTAMPTZ NOT NULL,
  quantity INTEGER DEFAULT 1,

  -- Subscription-specific fields (nullable for consumables)
  subscription_expires_at TIMESTAMPTZ,
  subscription_auto_renew_status BOOLEAN,

  -- Receipt validation
  receipt_data TEXT, -- Store receipt for potential re-validation
  environment TEXT CHECK (environment IN ('Production', 'Sandbox')), -- Which Apple environment
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'invalid', 'refunded')),

  -- Processing status
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_apple_iap_transactions_user_id ON apple_iap_transactions(user_id);
CREATE INDEX idx_apple_iap_transactions_transaction_id ON apple_iap_transactions(transaction_id);
CREATE INDEX idx_apple_iap_transactions_original_transaction_id ON apple_iap_transactions(original_transaction_id);
CREATE INDEX idx_apple_iap_transactions_product_id ON apple_iap_transactions(product_id);
CREATE INDEX idx_apple_iap_transactions_purchase_date ON apple_iap_transactions(purchase_date DESC);

-- Row Level Security (RLS)
ALTER TABLE apple_iap_transactions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own transactions
CREATE POLICY "Users can view their own transactions"
  ON apple_iap_transactions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Service role can do everything (for edge functions)
CREATE POLICY "Service role has full access"
  ON apple_iap_transactions
  FOR ALL
  USING (auth.role() = 'service_role');

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_apple_iap_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_apple_iap_transactions_timestamp
  BEFORE UPDATE ON apple_iap_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_apple_iap_transactions_updated_at();

-- Comments for documentation
COMMENT ON TABLE apple_iap_transactions IS 'Tracks all Apple in-app purchase transactions for validation and audit purposes';
COMMENT ON COLUMN apple_iap_transactions.transaction_id IS 'Unique transaction ID from Apple - prevents duplicate processing';
COMMENT ON COLUMN apple_iap_transactions.original_transaction_id IS 'For subscriptions, the original transaction ID that started the subscription';
COMMENT ON COLUMN apple_iap_transactions.environment IS 'Apple environment that validated the receipt (Production or Sandbox)';
COMMENT ON COLUMN apple_iap_transactions.validation_status IS 'Status of receipt validation with Apple servers';
