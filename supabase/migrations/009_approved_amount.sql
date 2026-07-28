-- Migration 009: Add missing negotiation columns to bf_sub_budgets
-- approved_amount and payment_status were missing from the production table
-- (migration 003 created the real table but only included quoted_amount)

ALTER TABLE bf_sub_budgets
  ADD COLUMN IF NOT EXISTS approved_amount   NUMERIC,
  ADD COLUMN IF NOT EXISTS payment_status    TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending','partial','paid')),
  ADD COLUMN IF NOT EXISTS builder_notes     TEXT;
