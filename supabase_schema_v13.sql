-- ============================================================
-- Schema v13: Nutrition goals + admin point override
-- Run in Supabase SQL Editor
-- ============================================================

-- Add nutrition goal columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nutrition_goals jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS nutrition_goals_public boolean DEFAULT false;

-- Add goal_met column to sessions for nutrition logs
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS goal_met boolean DEFAULT false;

-- Add admin point override to weekly_submissions (already has admin_override_points)
-- Add override reason/note
ALTER TABLE public.weekly_submissions
  ADD COLUMN IF NOT EXISTS admin_override_reason text,
  ADD COLUMN IF NOT EXISTS admin_override_by uuid references public.profiles(id);
