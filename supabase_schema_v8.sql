-- ============================================================
-- Schema v8: Delete account support + avatar_url fix
-- Run in Supabase SQL Editor
-- ============================================================

-- Make sure avatar_url exists
alter table public.profiles
  add column if not exists avatar_url text;

-- Function to fully delete a user (storage, submissions, posts, profile, auth)
create or replace function delete_user_account(user_id_to_delete uuid)
returns void language plpgsql security definer as $$
begin
  -- Delete all their data (cascades handle most of it)
  delete from public.posts where user_id = user_id_to_delete;
  delete from public.sessions where user_id = user_id_to_delete;
  delete from public.weekly_submissions where user_id = user_id_to_delete;
  delete from public.friendships where follower_id = user_id_to_delete or following_id = user_id_to_delete;
  delete from public.post_likes where user_id = user_id_to_delete;
  delete from public.leaderboard_cache where user_id = user_id_to_delete;
  delete from public.profiles where id = user_id_to_delete;
  -- Delete auth user
  delete from auth.users where id = user_id_to_delete;
end;
$$;

-- Allow users to call this function
grant execute on function delete_user_account(uuid) to authenticated;

-- Fix email field for existing users who may have null email in profiles
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;
