-- ============================================================
-- GRANT ADMIN TO CHALLENGE CREATOR
-- Replace the email below with their actual email address
-- Run this in Supabase SQL Editor
-- ============================================================

update public.profiles 
set is_admin = true 
where email = 'REPLACE_WITH_THEIR_EMAIL@email.com';

-- To verify it worked:
select full_name, email, is_admin from public.profiles where is_admin = true;
