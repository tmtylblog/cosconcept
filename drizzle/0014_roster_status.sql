-- Add roster_status column to expert_profiles for categorizing team members
-- Values: "active" (default), "prior" (former team), "incorrect" (bad data)
ALTER TABLE expert_profiles ADD COLUMN IF NOT EXISTS roster_status text NOT NULL DEFAULT 'active';
