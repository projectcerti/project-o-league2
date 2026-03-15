-- ============================================================
-- Schema v6: Profile pictures
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add avatar_url to profiles
alter table public.profiles
  add column if not exists avatar_url text;

-- Add a permissive storage policy for avatar uploads
-- (the proofs bucket already exists from earlier schemas)
drop policy if exists "Allow avatar uploads" on storage.objects;
create policy "Allow avatar uploads"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs');

drop policy if exists "Allow avatar updates" on storage.objects;
create policy "Allow avatar updates"
  on storage.objects for update to authenticated
  using (bucket_id = 'proofs');
