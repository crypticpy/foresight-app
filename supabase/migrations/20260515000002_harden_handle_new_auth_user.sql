-- Re-apply public.handle_new_auth_user() with two corrections that landed
-- after 20260515000001 was already applied to prod:
--
--   1. NULL-email guard. public.users.email is NOT NULL, so a NULL-email
--      auth row would abort the auth.users INSERT. The original migration
--      file was edited post-apply to include the guard but the function
--      body in prod still reflects the original (no-guard) version. This
--      CREATE OR REPLACE reconciles prod with the file.
--   2. REVOKE EXECUTE ... FROM PUBLIC. Per 20260512000004 the codebase
--      treats every SECURITY DEFINER function — trigger functions included
--      — as defense-in-depth: even though Postgres fires triggers regardless
--      of EXECUTE grants, we don't leave the function callable by PUBLIC.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.users (id, email, account_type)
  VALUES (NEW.id, NEW.email, 'paid')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;
