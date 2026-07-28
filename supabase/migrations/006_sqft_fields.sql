-- ============================================================
-- 006: Add sqft analysis fields to bf_project_financials
-- Enables KORVIA to calculate construction cost, sale price,
-- and profit margin based on area market rates per square foot.
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE bf_project_financials
  ADD COLUMN IF NOT EXISTS sqft                       numeric(10,2),
  ADD COLUMN IF NOT EXISTS construction_cost_per_sqft numeric(10,2),
  ADD COLUMN IF NOT EXISTS sale_price_per_sqft        numeric(10,2);
