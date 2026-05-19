-- Atomic single-key merge into ``discovery_runs.summary_report``.
--
-- ``discovery_progress.update_progress`` previously did a SELECT then a
-- merge-in-Python then an UPDATE. Several other writers (lifecycle
-- terminal update, worker stage flip, quality-stats writers in
-- discovery_service / discovery_triage) write to ``summary_report`` on
-- the same row over the lifetime of a run, so any of them firing
-- between our SELECT and UPDATE clobbers our progress key. Production
-- effect: stalled-looking progress bars right after a phase boundary.
--
-- This RPC pushes the merge into a single transactional ``jsonb_set``
-- so there is no read-modify-write window. Callers pass the key they
-- want to patch and a JSONB value; the function COALESCEs the column
-- (handles JSONB null) and returns whether the row matched.

CREATE OR REPLACE FUNCTION public.set_discovery_run_summary_key(
    p_run_id uuid,
    p_key text,
    p_value jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    updated_count int;
BEGIN
    IF p_key IS NULL OR length(p_key) = 0 THEN
        RAISE EXCEPTION 'set_discovery_run_summary_key: p_key must be a non-empty string';
    END IF;

    UPDATE public.discovery_runs
    SET summary_report = jsonb_set(
        COALESCE(summary_report, '{}'::jsonb),
        ARRAY[p_key],
        p_value,
        true  -- create_missing: insert the key if it isn't already there
    )
    WHERE id = p_run_id;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_discovery_run_summary_key(uuid, text, jsonb)
    TO authenticated, service_role;
