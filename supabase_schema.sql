-- ============================================================
-- PROJECT O LEAGUE - Supabase Schema
-- Run this entire file in your Supabase SQL editor
-- ============================================================

-- 1. PROFILES TABLE
-- Extends Supabase auth.users with extra fields

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by all authenticated users"
  on profiles for select to authenticated using (true);

create policy "Users can update their own profile"
  on profiles for update to authenticated using (auth.uid() = id);

create policy "Users can insert their own profile"
  on profiles for insert to authenticated with check (auth.uid() = id);


-- 2. WEEKLY SUBMISSIONS TABLE

create table if not exists public.weekly_submissions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  week_number integer not null check (week_number between 1 and 6),
  workouts integer default 0 check (workouts >= 0),
  recovery_sessions integer default 0 check (recovery_sessions >= 0),
  social_sessions integer default 0 check (social_sessions >= 0),
  nutrition_days integer default 0 check (nutrition_days between 0 and 7),
  proof_urls text[] default '{}',
  notes text,
  status text default 'submitted' check (status in ('submitted', 'approved', 'rejected')),
  calculated_points integer default 0,
  admin_override_points integer,
  submitted_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, week_number)
);

alter table public.weekly_submissions enable row level security;

create policy "Submissions viewable by all authenticated users"
  on weekly_submissions for select to authenticated using (true);

create policy "Users can insert their own submissions"
  on weekly_submissions for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own non-approved submissions"
  on weekly_submissions for update to authenticated
  using (auth.uid() = user_id and status != 'approved');

create policy "Admins can update any submission"
  on weekly_submissions for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );


-- 3. LEADERBOARD VIEW

create or replace view public.leaderboard_totals as
select
  p.id as user_id,
  p.full_name,
  coalesce(sum(
    coalesce(ws.admin_override_points, ws.calculated_points, 0)
  ), 0)::integer as total_points,
  count(ws.id)::integer as weeks_submitted,
  bool_and(ws.status != 'rejected') as all_clean
from public.profiles p
left join public.weekly_submissions ws on ws.user_id = p.id
group by p.id, p.full_name;


-- 4. AUTO-CREATE PROFILE ON SIGNUP

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- 5. STORAGE BUCKET FOR PROOF PHOTOS
-- Run this separately if the bucket doesn't exist:

insert into storage.buckets (id, name, public)
values ('proofs', 'proofs', true)
on conflict (id) do nothing;

create policy "Allow authenticated uploads"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs');

create policy "Allow public reads"
  on storage.objects for select
  using (bucket_id = 'proofs');

create policy "Allow users to delete own files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'proofs' and auth.uid()::text = (storage.foldername(name))[1]);


-- 6. MAKE YOURSELF ADMIN
-- After signing up, run this with your email address:
-- update public.profiles set is_admin = true where email = 'your@email.com';
