-- BuildFlow — Add bg_color column to bf_projects
-- Run in Supabase SQL Editor
ALTER TABLE bf_projects ADD COLUMN IF NOT EXISTS bg_color text DEFAULT '#1A2B4A';
