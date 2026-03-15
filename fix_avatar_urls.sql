-- Clean up avatar URLs - remove any query string parameters
update public.profiles
set avatar_url = split_part(avatar_url, '?', 1)
where avatar_url is not null and avatar_url like '%?%';

-- Verify - should show clean URLs with no ? in them
select id, full_name, avatar_url from public.profiles where avatar_url is not null;
