-- ============================================================
-- ADD THIS TO YOUR SUPABASE SQL EDITOR
-- (Run this as a second query after the original schema)
-- ============================================================

-- Individual sessions table
create table if not exists public.sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  week_number integer not null check (week_number between 1 and 6),
  session_type text not null check (session_type in ('workout', 'recovery', 'social')),
  activity_name text,
  duration_minutes integer not null check (duration_minutes >= 0),
  rpe integer check (rpe between 1 and 10),
  proof_url text,
  notes text,
  logged_at timestamptz default now()
);

alter table public.sessions enable row level security;

create policy "Sessions viewable by all authenticated users"
  on sessions for select to authenticated using (true);

create policy "Users can insert their own sessions"
  on sessions for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete their own sessions"
  on sessions for delete to authenticated
  using (auth.uid() = user_id);
