-- Fix session_type check constraint to allow 'nutrition'
alter table public.sessions
  drop constraint if exists sessions_session_type_check;

alter table public.sessions
  add constraint sessions_session_type_check
  check (session_type in ('workout', 'recovery', 'social', 'nutrition'));
