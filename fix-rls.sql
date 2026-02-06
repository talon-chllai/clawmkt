-- Fix RLS policies for security

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Agents can insert their own positions" ON positions;

-- Add restrictive delete policies (block all deletes from anon)
CREATE POLICY "No anonymous deletes on agents"
  ON agents FOR DELETE
  USING (false);

CREATE POLICY "No anonymous deletes on positions"
  ON positions FOR DELETE
  USING (false);

CREATE POLICY "No anonymous deletes on markets"
  ON markets FOR DELETE
  USING (false);

-- Block anonymous updates
CREATE POLICY "No anonymous updates on agents"
  ON agents FOR UPDATE
  USING (false);

-- Block subscriptions from anon entirely
DROP POLICY IF EXISTS "Subscriptions readable by owner" ON subscriptions;
CREATE POLICY "Subscriptions are private"
  ON subscriptions FOR ALL
  USING (false);

-- Positions insert should only work via API (service role)
-- No direct inserts from anon key
CREATE POLICY "No anonymous inserts on positions"
  ON positions FOR INSERT
  WITH CHECK (false);
