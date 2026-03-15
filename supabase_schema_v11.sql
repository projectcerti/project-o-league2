-- ============================================================
-- Schema v11: Proper role-based access control
-- Run in Supabase SQL Editor
-- ============================================================

-- Step 1: Add role column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin', 'owner'));

-- Step 2: Copy existing is_admin flags to role
UPDATE public.profiles SET role = 'admin' WHERE is_admin = true;

-- Step 3: Set the owner
UPDATE public.profiles SET role = 'owner'
WHERE email = 'projectcertii@gmail.com';

-- Step 4: Unique index — only one owner ever
DROP INDEX IF EXISTS one_owner_only;
CREATE UNIQUE INDEX one_owner_only
ON public.profiles ((true))
WHERE role = 'owner';

-- Step 5: Trigger to block client-side role changes
CREATE OR REPLACE FUNCTION prevent_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF current_setting('request.jwt.claim.role', true) = 'authenticated' THEN
      RAISE EXCEPTION 'Role changes are not allowed from the client';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS guard_role_changes ON public.profiles;
CREATE TRIGGER guard_role_changes
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_role_change();

-- Step 6: RLS policies (keep existing, ensure role col is protected)
-- Users can update their own profile but NOT role
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
