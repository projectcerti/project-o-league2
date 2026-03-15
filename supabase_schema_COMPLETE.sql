-- ============================================================
-- PROJECT O LEAGUE — COMPLETE SCHEMA (run this all at once)
-- ============================================================


-- ============================================================
-- 1. PROFILES
-- ============================================================

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  username text unique,
  bio text,
  avatar_color text default '#FF6B35',
  lane text check (lane in ('performance', 'momentum', 'foundation', 'return_strong')),
  lane_public boolean default true,
  is_admin boolean default false,
  onboarded boolean default false,
  created_at timestamptz default now(),
  constraint username_format check (username ~ '^[a-z0-9_]{3,20}$')
);

create index if not exists profiles_username_idx on public.profiles(username);

alter table public.profiles enable row level security;

create policy "Profiles viewable by all authenticated users"
  on profiles for select to authenticated using (true);

create policy "Users can update their own profile"
  on profiles for update to authenticated using (auth.uid() = id);

create policy "Users can insert their own profile"
  on profiles for insert to authenticated with check (auth.uid() = id);


-- ============================================================
-- 2. AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================

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


-- ============================================================
-- 3. WEEKLY SUBMISSIONS
-- ============================================================

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


-- ============================================================
-- 4. INDIVIDUAL SESSIONS
-- ============================================================

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


-- ============================================================
-- 5. FRIENDSHIPS (follow system)
-- ============================================================

create table if not exists public.friendships (
  id uuid default gen_random_uuid() primary key,
  follower_id uuid references public.profiles(id) on delete cascade not null,
  following_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(follower_id, following_id),
  check (follower_id != following_id)
);

alter table public.friendships enable row level security;

create policy "Friendships viewable by all authenticated users"
  on friendships for select to authenticated using (true);

create policy "Users can manage their own follows"
  on friendships for insert to authenticated
  with check (auth.uid() = follower_id);

create policy "Users can unfollow"
  on friendships for delete to authenticated
  using (auth.uid() = follower_id);


-- ============================================================
-- 6. POSTS
-- ============================================================

create table if not exists public.posts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text not null check (char_length(content) between 1 and 500),
  session_id uuid references public.sessions(id) on delete set null,
  likes_count integer default 0,
  created_at timestamptz default now()
);

alter table public.posts enable row level security;

create policy "Posts viewable by all authenticated users"
  on posts for select to authenticated using (true);

create policy "Users can create posts"
  on posts for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete own posts"
  on posts for delete to authenticated
  using (auth.uid() = user_id);


-- ============================================================
-- 7. POST LIKES
-- ============================================================

create table if not exists public.post_likes (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references public.posts(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(post_id, user_id)
);

alter table public.post_likes enable row level security;

create policy "Likes viewable by all authenticated users"
  on post_likes for select to authenticated using (true);

create policy "Users can like posts"
  on post_likes for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can unlike"
  on post_likes for delete to authenticated
  using (auth.uid() = user_id);

create or replace function update_likes_count()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    update posts set likes_count = likes_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update posts set likes_count = likes_count - 1 where id = OLD.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists on_like_change on post_likes;
create trigger on_like_change
  after insert or delete on post_likes
  for each row execute function update_likes_count();


-- ============================================================
-- 8. STORAGE BUCKET FOR PROOF PHOTOS
-- ============================================================

insert into storage.buckets (id, name, public)
values ('proofs', 'proofs', true)
on conflict (id) do nothing;

drop policy if exists "Allow authenticated uploads" on storage.objects;
drop policy if exists "Allow public reads" on storage.objects;
drop policy if exists "Allow users to delete own files" on storage.objects;

create policy "Allow authenticated uploads"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs');

create policy "Allow public reads"
  on storage.objects for select
  using (bucket_id = 'proofs');

create policy "Allow users to delete own files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'proofs' and auth.uid()::text = (storage.foldername(name))[1]);


-- ============================================================
-- 9. LEADERBOARD CACHE
-- ============================================================

create table if not exists public.leaderboard_cache (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null unique,
  full_name text,
  username text,
  avatar_color text,
  total_points integer default 0,
  weeks_submitted integer default 0,
  rank integer,
  previous_rank integer,
  last_refreshed timestamptz default now()
);

alter table public.leaderboard_cache enable row level security;

create policy "Leaderboard cache viewable by all authenticated users"
  on leaderboard_cache for select to authenticated using (true);


-- ============================================================
-- 10. LEADERBOARD REFRESH FUNCTION
-- ============================================================

create or replace function refresh_leaderboard()
returns void language plpgsql security definer as $$
begin
  delete from public.leaderboard_cache;
  insert into public.leaderboard_cache (user_id, full_name, username, avatar_color, total_points, weeks_submitted, rank, previous_rank, last_refreshed)
  select
    p.id,
    p.full_name,
    p.username,
    p.avatar_color,
    coalesce(sum(coalesce(ws.admin_override_points, ws.calculated_points, 0)) filter (where ws.status != 'rejected'), 0)::integer as total_points,
    count(ws.id) filter (where ws.status != 'rejected')::integer as weeks_submitted,
    row_number() over (order by coalesce(sum(coalesce(ws.admin_override_points, ws.calculated_points, 0)) filter (where ws.status != 'rejected'), 0) desc)::integer as rank,
    0 as previous_rank,
    now()
  from public.profiles p
  left join public.weekly_submissions ws on ws.user_id = p.id
  group by p.id, p.full_name, p.username, p.avatar_color;
end;
$$;

select refresh_leaderboard();


-- ============================================================
-- 11. LEADERBOARD TOTALS VIEW
-- ============================================================

drop view if exists public.leaderboard_totals;

create view public.leaderboard_totals as
select
  p.id as user_id,
  p.full_name,
  p.username,
  p.avatar_color,
  coalesce(sum(coalesce(ws.admin_override_points, ws.calculated_points, 0)), 0)::integer as total_points,
  count(ws.id)::integer as weeks_submitted
from public.profiles p
left join public.weekly_submissions ws on ws.user_id = p.id
group by p.id, p.full_name, p.username, p.avatar_color;


-- ============================================================
-- 12. PRIZE ELIGIBILITY VIEW
-- ============================================================

create or replace view public.prize_eligibility as
with week_data as (
  select
    p.id as user_id,
    p.full_name,
    p.username,
    p.avatar_color,
    p.lane,
    p.lane_public,
    count(ws.id) filter (where ws.status != 'rejected') as weeks_submitted,
    count(ws.id) filter (where ws.recovery_sessions >= 1 and ws.status != 'rejected') as recovery_weeks,
    count(ws.id) filter (where ws.nutrition_days >= 5 and ws.status != 'rejected') as nutrition_weeks,
    count(ws.id) filter (where ws.status = 'rejected') as rejected_weeks,
    coalesce(sum(coalesce(ws.admin_override_points, ws.calculated_points, 0)) filter (where ws.status != 'rejected'), 0)::integer as total_points
  from public.profiles p
  left join public.weekly_submissions ws on ws.user_id = p.id
  group by p.id, p.full_name, p.username, p.avatar_color, p.lane, p.lane_public
),
current_week as (
  select least(
    greatest(
      floor(extract(epoch from (now() - '2026-03-16 00:00:00'::timestamptz)) / (7 * 86400)) + 1,
      1
    ),
    6
  )::integer as week_num
)
select
  wd.user_id,
  wd.full_name,
  wd.username,
  wd.avatar_color,
  wd.lane,
  wd.lane_public,
  wd.weeks_submitted,
  wd.recovery_weeks,
  wd.nutrition_weeks,
  wd.rejected_weeks,
  wd.total_points,
  cw.week_num as current_week,
  greatest(cw.week_num - wd.weeks_submitted - wd.rejected_weeks, 0) as weeks_missed,
  case
    when greatest(cw.week_num - wd.weeks_submitted - wd.rejected_weeks, 0) >= 2 then false
    else true
  end as prize_eligible,
  case
    when greatest(cw.week_num - wd.weeks_submitted - wd.rejected_weeks, 0) = 0
      and wd.recovery_weeks >= least(cw.week_num, 4)
      and wd.nutrition_weeks >= least(cw.week_num, 4)
    then true
    else false
  end as flawless_on_track
from week_data wd
cross join current_week cw;


-- ============================================================
-- 13. MIDNIGHT LEADERBOARD REFRESH (pg_cron)
-- Only runs if you enabled pg_cron in Database > Extensions
-- If you skipped that, just delete this section
-- ============================================================

select cron.schedule(
  'refresh-leaderboard-midnight',
  '0 0 * * *',
  'select refresh_leaderboard()'
);


-- ============================================================
-- DONE
-- After signing up in the app, run this to make yourself admin:
-- update public.profiles set is_admin = true where email = 'YOUR@EMAIL.COM';
-- ============================================================


-- ============================================================
-- SCHEMA ADDITION: Post photo support
-- Run this in Supabase SQL Editor
-- ============================================================

alter table public.posts
  add column if not exists photo_urls text[] default '{}';
