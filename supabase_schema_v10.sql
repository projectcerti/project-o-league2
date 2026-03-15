-- ============================================================
-- Schema v10: Admin feedback + metrics
-- Run in Supabase SQL Editor
-- ============================================================

-- Admin feedback table (private notes from admin to user)
create table if not exists public.admin_feedback (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  message text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Only the recipient can read their own feedback
alter table public.admin_feedback enable row level security;

create policy "Admins can manage all feedback"
  on public.admin_feedback for all to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

create policy "Users can read their own feedback"
  on public.admin_feedback for select to authenticated
  using (user_id = auth.uid());
