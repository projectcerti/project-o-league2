-- ============================================================
-- Schema v9: Nutrition logging
-- Run in Supabase SQL Editor
-- ============================================================

-- Add nutrition-specific columns to sessions table
alter table public.sessions
  add column if not exists meal_type text,         -- 'breakfast','lunch','dinner','snack','all'
  add column if not exists photo_urls text[],      -- up to 3 photos
  add column if not exists tracking_link text;     -- link to MyFitnessPal etc

-- nutrition_days is now auto-calculated from distinct days with nutrition sessions
-- Update the sync function to count distinct dates instead of manual entry
