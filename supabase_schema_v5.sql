-- Run this in Supabase SQL Editor to add photo support to posts
alter table public.posts
  add column if not exists photo_urls text[] default '{}';
