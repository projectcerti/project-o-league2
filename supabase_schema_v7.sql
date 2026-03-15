-- ============================================================
-- Schema v7: Fix leaderboard cache to include avatar_url
-- Run in Supabase SQL Editor
-- ============================================================

-- Add avatar_url to leaderboard cache
alter table public.leaderboard_cache
  add column if not exists avatar_url text;

-- Update the refresh function to pull avatar_url
create or replace function refresh_leaderboard()
returns void language plpgsql security definer as $$
begin
  delete from public.leaderboard_cache;
  insert into public.leaderboard_cache (
    user_id, full_name, username, avatar_color, avatar_url,
    total_points, weeks_submitted, rank, previous_rank, last_refreshed
  )
  select
    p.id,
    p.full_name,
    p.username,
    p.avatar_color,
    p.avatar_url,
    coalesce(sum(coalesce(ws.admin_override_points, ws.calculated_points, 0))
      filter (where ws.status != 'rejected'), 0)::integer as total_points,
    count(ws.id) filter (where ws.status != 'rejected')::integer as weeks_submitted,
    row_number() over (
      order by coalesce(sum(coalesce(ws.admin_override_points, ws.calculated_points, 0))
      filter (where ws.status != 'rejected'), 0) desc
    )::integer as rank,
    0 as previous_rank,
    now()
  from public.profiles p
  left join public.weekly_submissions ws on ws.user_id = p.id
  group by p.id, p.full_name, p.username, p.avatar_color, p.avatar_url;
end;
$$;

-- Refresh immediately
select refresh_leaderboard();
