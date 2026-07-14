-- Migration 004: Rename sender value 'sofia' → 'korvia' in bf_portal_messages
-- Run this in Supabase SQL Editor after deploying the Korvia code rename.

-- 1. Drop the existing check constraint
ALTER TABLE bf_portal_messages DROP CONSTRAINT IF EXISTS bf_portal_messages_sender_check;

-- 2. Update existing rows (historical messages sent as 'sofia')
UPDATE bf_portal_messages SET sender = 'korvia' WHERE sender = 'sofia';

-- 3. Add new constraint accepting 'korvia'
ALTER TABLE bf_portal_messages
  ADD CONSTRAINT bf_portal_messages_sender_check
  CHECK (sender IN ('sub', 'korvia'));
