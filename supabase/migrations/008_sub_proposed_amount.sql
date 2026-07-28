-- Migration 008: Sub negotiation columns
-- Adds sub counter-proposal + final agreed amount to bf_sub_budgets

ALTER TABLE bf_sub_budgets
  ADD COLUMN IF NOT EXISTS sub_proposed_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS sub_proposed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_agreed_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS final_agreed_at     TIMESTAMPTZ;
