-- Create Google Play Transactions Table
-- This table tracks all Google Play in-app purchase transactions to prevent duplicate processing
-- and provide an audit trail for purchases

CREATE TABLE IF NOT EXISTS google_play_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User who made the purchase
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Google Play transaction identifiers
  order_id TEXT NOT NULL UNIQUE, -- Google's unique order ID
  purchase_token TEXT NOT NULL, -- Google Play purchase token (used for validation)

  -- Product information
  product_id TEXT NOT NULL, -- e.g., com.tossortaste.app.single_credit
  product_type TEXT NOT NULL CHECK (product_type IN ('consumable', 'subscription')),

  -- Purchase details
  purchase_date TIMESTAMPTZ NOT NULL,
  quantity INTEGER DEFAULT 1,

  -- Subscription-specific fields (nullable for consumables)
  subscription_expires_at TIMESTAMPTZ,
  subscription_auto_renew_status BOOLEAN,

  -- Google Play specific fields
  acknowledgement_state INTEGER DEFAULT 0, -- 0 = not acknowledged, 1 = acknowledged

  -- Validation
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'invalid', 'refunded')),

  -- Processing status
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_google_play_transactions_user_id ON google_play_transactions(user_id);
CREATE INDEX idx_google_play_transactions_order_id ON google_play_transactions(order_id);
CREATE INDEX idx_google_play_transactions_purchase_token ON google_play_transactions(purchase_token);
CREATE INDEX idx_google_play_transactions_product_id ON google_play_transactions(product_id);
CREATE INDEX idx_google_play_transactions_purchase_date ON google_play_transactions(purchase_date DESC);

-- Row Level Security (RLS)
ALTER TABLE google_play_transactions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own transactions
CREATE POLICY "Users can view their own transactions"
  ON google_play_transactions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Service role can do everything (for edge functions)
CREATE POLICY "Service role has full access"
  ON google_play_transactions
  FOR ALL
  USING (auth.role() = 'service_role');

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_google_play_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_google_play_transactions_timestamp
  BEFORE UPDATE ON google_play_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_google_play_transactions_updated_at();

-- Comments for documentation
COMMENT ON TABLE google_play_transactions IS 'Tracks all Google Play in-app purchase transactions for validation and audit purposes';
COMMENT ON COLUMN google_play_transactions.order_id IS 'Unique order ID from Google Play - prevents duplicate processing';
COMMENT ON COLUMN google_play_transactions.purchase_token IS 'Google Play purchase token used for validation with Google Play API';
COMMENT ON COLUMN google_play_transactions.acknowledgement_state IS 'Whether the purchase has been acknowledged with Google Play (required by Google)';
COMMENT ON COLUMN google_play_transactions.validation_status IS 'Status of purchase validation with Google Play servers';
