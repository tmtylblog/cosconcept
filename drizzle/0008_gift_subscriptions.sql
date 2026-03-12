-- Gift subscription columns for admin-granted complimentary service periods
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS gift_expires_at TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS gift_return_plan subscription_plan;
