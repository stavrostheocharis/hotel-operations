-- Sessions end after 90 days whatever happens; sign-in attempts are counted
-- in the database (per email and address, shared by every replica, surviving
-- restarts); the two SECURITY DEFINER functions that act on a user id check
-- that the user is in the caller's group (when a tenant context is set) and
-- is active.

CREATE OR REPLACE FUNCTION public.auth_resolve_session(p_token_hash text)
RETURNS TABLE (
  session_id uuid, user_id uuid, group_id uuid, email text, name text,
  role user_role, department department, locale text, expires_at timestamptz,
  property_ids uuid[], property_roles jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE sessions s SET last_seen_at = now(), expires_at = now() + interval '30 days'
  WHERE s.token_hash = p_token_hash AND s.expires_at > now()
    AND s.created_at > now() - interval '90 days'
    AND s.last_seen_at < now() - interval '15 minutes';
  RETURN QUERY
    SELECT s.id, u.id, u.group_id, u.email, u.name, u.role, u.department, u.locale, s.expires_at,
      CASE WHEN u.role = 'group_admin'
        THEN (SELECT coalesce(array_agg(p.id ORDER BY p.code), '{}'::uuid[]) FROM properties p WHERE p.group_id = u.group_id)
        ELSE (SELECT coalesce(array_agg(m.property_id), '{}'::uuid[]) FROM memberships m WHERE m.user_id = u.id)
      END,
      (SELECT coalesce(jsonb_object_agg(m.property_id, m.role), '{}'::jsonb)
         FROM memberships m WHERE m.user_id = u.id AND m.role IS NOT NULL)
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = p_token_hash AND s.expires_at > now()
      AND s.created_at > now() - interval '90 days' AND u.is_active;
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.auth_create_session(p_user_id uuid, p_token_hash text, p_expires_at timestamptz, p_user_agent text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user_id AND u.is_active) THEN
    RAISE EXCEPTION 'no active user for this session' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO sessions (user_id, token_hash, expires_at, user_agent)
  VALUES (p_user_id, p_token_hash, p_expires_at, p_user_agent)
  RETURNING id INTO v_id;
  UPDATE users SET last_login_at = now() WHERE id = p_user_id;
  RETURN v_id;
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.auth_set_password(p_user_id uuid, p_password_hash text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_group text := current_setting('app.group_id', true);
BEGIN
  IF coalesce(v_group, '') <> '' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user_id AND u.group_id = v_group::uuid) THEN
    RAISE EXCEPTION 'user is not in this group' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO user_credentials (user_id, password_hash) VALUES (p_user_id, p_password_hash)
  ON CONFLICT (user_id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = now();
  DELETE FROM sessions WHERE user_id = p_user_id;
END
$$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.sign_in_attempts (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
ALTER TABLE public.sign_in_attempts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.sign_in_attempts FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON public.sign_in_attempts FROM app_user;--> statement-breakpoint

-- Keys look like 'e:<email>|<ip>' (5 failures per 15 minutes) or 'ip:<ip>'
-- (50 per 15 minutes, against one password sprayed over many accounts).
CREATE OR REPLACE FUNCTION public.auth_sign_in_blocked(p_keys text[])
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM sign_in_attempts a
    WHERE a.key = ANY (p_keys) AND a.window_start > now() - interval '15 minutes'
      AND a.count >= CASE WHEN a.key LIKE 'ip:%' THEN 50 ELSE 5 END
  )
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.auth_sign_in_failed(p_keys text[])
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO sign_in_attempts (key, count, window_start)
  SELECT k, 1, now() FROM unnest(p_keys) AS k
  ON CONFLICT (key) DO UPDATE SET
    count = CASE WHEN sign_in_attempts.window_start > now() - interval '15 minutes' THEN sign_in_attempts.count + 1 ELSE 1 END,
    window_start = CASE WHEN sign_in_attempts.window_start > now() - interval '15 minutes' THEN sign_in_attempts.window_start ELSE now() END;
  DELETE FROM sign_in_attempts WHERE window_start < now() - interval '1 day'
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.auth_sign_in_cleared(p_keys text[])
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM sign_in_attempts WHERE key = ANY (p_keys) AND key NOT LIKE 'ip:%'
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.auth_sign_in_blocked(text[]) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.auth_sign_in_failed(text[]) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.auth_sign_in_cleared(text[]) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.auth_sign_in_blocked(text[]) TO app_user;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.auth_sign_in_failed(text[]) TO app_user;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.auth_sign_in_cleared(text[]) TO app_user;
