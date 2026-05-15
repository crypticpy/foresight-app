-- Mirror auth.users -> public.users on signup, and backfill any pre-existing gaps.
--
-- Background:
--   public.users.id has FK references auth.users(id) ON DELETE CASCADE, but
--   nothing was auto-creating the public.users row when an auth user signed up.
--   As a result, three live beta accounts (betauser001/002/003) sat in
--   auth.users with no matching public.users row, which broke any code path
--   that inserts a workstream / clone / portfolio row using user.id (those
--   tables FK -> public.users(id)).
--
-- Safety model:
--   * INSERT ... ON CONFLICT (id) DO NOTHING — never overwrite an existing
--     public.users row. Triggers and backfill are strictly additive.
--   * Function is SECURITY DEFINER with a pinned search_path so it can write
--     to public.users from the auth schema without depending on the caller's
--     search_path (matches the convention in 20260512000003).
--   * Trigger drops and re-creates idempotently.
--   * public.users.email is NOT NULL. The trigger skips auth rows with a NULL
--     email rather than crashing the auth.users INSERT — this matches the
--     backfill's `au.email IS NOT NULL` filter so legacy and new behavior agree.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Skip auth rows without an email. public.users.email is NOT NULL, so
  -- attempting the insert would abort the surrounding auth.users INSERT.
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.users (id, email, account_type)
  VALUES (NEW.id, NEW.email, 'paid')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_auth_user() IS
  'Mirrors a newly-created auth.users row into public.users so application FKs (workstreams, portfolios, clones) resolve. ON CONFLICT DO NOTHING — never updates an existing row.';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- One-time backfill for auth users created before this trigger existed.
-- ON CONFLICT DO NOTHING preserves any hand-curated public.users data.
INSERT INTO public.users (id, email, account_type)
SELECT au.id, au.email, 'paid'
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL
  AND au.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;
