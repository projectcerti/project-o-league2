-- ============================================================
-- Schema v12: Comments, Notifications, Profile follows
-- Run in Supabase SQL Editor
-- ============================================================

-- Comments on posts
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) <= 300),
  created_at timestamptz default now()
);
alter table public.post_comments enable row level security;
create policy "Authenticated can read comments" on public.post_comments for select to authenticated using (true);
create policy "Users can insert own comments" on public.post_comments for insert to authenticated with check (user_id = auth.uid());
create policy "Users can delete own comments" on public.post_comments for delete to authenticated using (user_id = auth.uid());

-- Notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,  -- recipient
  actor_id uuid references public.profiles(id) on delete cascade, -- who triggered it
  type text not null check (type in ('like','comment','follow','post','log','overtaken')),
  post_id uuid references public.posts(id) on delete cascade,
  message text,
  read boolean default false,
  created_at timestamptz default now()
);
alter table public.notifications enable row level security;
create policy "Users see own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "Authenticated can insert notifications" on public.notifications for insert to authenticated with check (true);
create policy "Users can update own notifications" on public.notifications for update to authenticated using (user_id = auth.uid());

-- Profile follows (for bell notifications on new posts)
-- Already have friendships table, add notify column
alter table public.friendships add column if not exists notify boolean default false;

-- Add comment_count to posts for display
alter table public.posts add column if not exists comment_count int default 0;

-- Function to increment comment count
create or replace function increment_comment_count()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update public.posts set comment_count = greatest(0, comment_count - 1) where id = OLD.post_id;
  end if;
  return null;
end;
$$;
drop trigger if exists update_comment_count on public.post_comments;
create trigger update_comment_count after insert or delete on public.post_comments
  for each row execute function increment_comment_count();

-- Function to send overtaken notifications when leaderboard refreshes
create or replace function notify_overtaken()
returns void language plpgsql security definer as $$
declare
  r record;
begin
  -- Find users whose rank got worse compared to previous_rank
  for r in
    select lc.user_id, lc.rank, lc.previous_rank, p.full_name, p.username,
           overtaker.user_id as overtaker_id, overtaker.full_name as overtaker_name,
           overtaker.username as overtaker_username
    from public.leaderboard_cache lc
    join public.profiles p on p.id = lc.user_id
    join public.leaderboard_cache overtaker on overtaker.rank = lc.rank - 1
    join public.profiles op on op.id = overtaker.user_id
    where lc.previous_rank is not null
      and lc.rank > lc.previous_rank
  loop
    insert into public.notifications (user_id, actor_id, type, message)
    values (
      r.user_id,
      r.overtaker_id,
      'overtaken',
      'You''ve just been overtaken by @' || coalesce(r.overtaker_username, r.overtaker_name)
    )
    on conflict do nothing;
  end loop;
end;
$$;
