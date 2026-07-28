-- Migration 008: Sub counter-proposal amount
-- Allows subs to propose their own negotiated amount from the portal

ALTER TABLE bf_sub_budgets
  ADD COLUMN IF NOT EXISTS sub_proposed_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS sub_proposed_at TIMESTAMPTZ;
