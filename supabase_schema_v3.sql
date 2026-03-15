-- ============================================================
-- PROJECT O LEAGUE - Schema v3
-- Run this in your Supabase SQL editor AFTER v1 and v2
-- ============================================================

-- 1. ADD USERNAME TO PROFILES
alter table public.profiles
  add column if not exists username text unique,
  add column if not exists bio text,
  add column if not exists avatar_color text default '#FF6B35';

-- Username must be lowercase letters, numbers, underscores only
alter table public.profiles
  add constraint username_format check (username ~ '^[a-z0-9_]{3,20}$');

-- Index for fast @username lookups
create index if not exists profiles_username_idx on public.profiles(username);


-- 2. FRIENDSHIPS TABLE (follow system)
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


-- 3. POSTS TABLE
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


-- 4. POST LIKES TABLE
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

-- Auto-update likes count
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


-- 5. LEADERBOARD CACHE TABLE (updated nightly at midnight)
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


-- 6. FUNCTION TO REFRESH LEADERBOARD
create or replace function refresh_leaderboard()
returns void language plpgsql security definer as $$
begin
  -- Clear and rebuild cache
  delete from public.leaderboard_cache;

  insert into public.leaderboard_cache (user_id, full_name, username, avatar_color, total_points, weeks_submitted, rank, previous_rank, last_refreshed)
  select
    p.id,
    p.full_name,
    p.username,
    p.avatar_color,
    coalesce(sum(coalesce(ws.admin_override_points, ws.calculated_points, 0)), 0)::integer as total_points,
    count(ws.id)::integer as weeks_submitted,
    row_number() over (order by coalesce(sum(coalesce(ws.admin_override_points, ws.calculated_points, 0)), 0) desc)::integer as rank,
    0 as previous_rank,
    now()
  from public.profiles p
  left join public.weekly_submissions ws on ws.user_id = p.id and ws.status != 'rejected'
  group by p.id, p.full_name, p.username, p.avatar_color;
end;
$$;

-- Run once immediately to populate
select refresh_leaderboard();


-- 7. SCHEDULE MIDNIGHT REFRESH (uses pg_cron - enabled by default on Supabase)
-- This runs at midnight UTC every day
select cron.schedule(
  'refresh-leaderboard-midnight',
  '0 0 * * *',
  'select refresh_leaderboard()'
);


-- 8. UPDATE leaderboard_totals VIEW to also include username/avatar
create or replace view public.leaderboard_totals as
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
