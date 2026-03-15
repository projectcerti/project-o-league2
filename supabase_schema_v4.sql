-- ============================================================
-- PROJECT O LEAGUE - Schema v4
-- Run this in Supabase SQL editor after v1, v2, v3
-- ============================================================

-- 1. ADD LANE FIELDS TO PROFILES
alter table public.profiles
  add column if not exists lane text check (lane in ('performance', 'momentum', 'foundation', 'return_strong')),
  add column if not exists lane_public boolean default true;


-- 2. PRIZE ELIGIBILITY VIEW
-- Rules:
--   - Miss 2+ weeks = OUT of prize draw
--   - Need at least 4 recovery weeks (recovery_sessions >= 1)
--   - Need at least 4 nutrition weeks (nutrition_days >= 5)
--   - Flawless: 0 missed weeks + 4+ recovery + 4+ nutrition + all submitted before deadline

create or replace view public.prize_eligibility as
with week_data as (
  select
    p.id as user_id,
    p.full_name,
    p.username,
    p.avatar_color,
    p.lane,
    p.lane_public,
    -- Count of weeks that have an approved/submitted submission
    count(ws.id) filter (where ws.status != 'rejected') as weeks_submitted,
    -- Weeks with recovery
    count(ws.id) filter (where ws.recovery_sessions >= 1 and ws.status != 'rejected') as recovery_weeks,
    -- Weeks with nutrition
    count(ws.id) filter (where ws.nutrition_days >= 5 and ws.status != 'rejected') as nutrition_weeks,
    -- Any rejected weeks count as missed
    count(ws.id) filter (where ws.status = 'rejected') as rejected_weeks,
    -- Total points
    coalesce(sum(coalesce(ws.admin_override_points, ws.calculated_points, 0)) filter (where ws.status != 'rejected'), 0)::integer as total_points
  from public.profiles p
  left join public.weekly_submissions ws on ws.user_id = p.id
  group by p.id, p.full_name, p.username, p.avatar_color, p.lane, p.lane_public
),
current_week as (
  -- How many weeks have elapsed (weeks missed = elapsed - submitted)
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
  -- Weeks missed = weeks elapsed minus weeks actually submitted (not rejected)
  greatest(cw.week_num - wd.weeks_submitted - wd.rejected_weeks, 0) as weeks_missed,
  -- Prize eligibility
  case
    when greatest(cw.week_num - wd.weeks_submitted - wd.rejected_weeks, 0) >= 2 then false
    else true
  end as prize_eligible,
  -- Flawless eligibility
  case
    when greatest(cw.week_num - wd.weeks_submitted - wd.rejected_weeks, 0) = 0
      and wd.recovery_weeks >= least(cw.week_num, 4)
      and wd.nutrition_weeks >= least(cw.week_num, 4)
    then true
    else false
  end as flawless_on_track
from week_data wd
cross join current_week cw;


-- 3. UPDATE LEADERBOARD REFRESH FUNCTION to include eligibility
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

-- Refresh immediately
select refresh_leaderboard();

-- Add onboarded flag to profiles (also run this)
alter table public.profiles
  add column if not exists onboarded boolean default false;
