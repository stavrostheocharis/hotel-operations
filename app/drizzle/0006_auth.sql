CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "user_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Sign-in tables are off limits to the app role. Row-level security is forced
-- with no policy, so only bypass roles (the migrator, the compose superuser)
-- read them directly; the web app goes through the functions below, which
-- run as their owner (SECURITY DEFINER).
-- ---------------------------------------------------------------------------
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.sessions FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.user_credentials FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON public.sessions FROM app_user;--> statement-breakpoint
REVOKE ALL ON public.user_credentials FROM app_user;--> statement-breakpoint

-- Email → credentials, for the sign-in action only.
CREATE OR REPLACE FUNCTION public.auth_credentials(p_email text)
RETURNS TABLE (user_id uuid, group_id uuid, is_active boolean, password_hash text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.group_id, u.is_active, c.password_hash
  FROM users u JOIN user_credentials c ON c.user_id = u.id
  WHERE lower(u.email) = lower(p_email)
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.auth_create_session(p_user_id uuid, p_token_hash text, p_expires_at timestamptz, p_user_agent text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO sessions (user_id, token_hash, expires_at, user_agent)
  VALUES (p_user_id, p_token_hash, p_expires_at, p_user_agent)
  RETURNING id INTO v_id;
  UPDATE users SET last_login_at = now() WHERE id = p_user_id;
  RETURN v_id;
END
$$;--> statement-breakpoint

-- The session behind a cookie, with everything the tenant context needs.
-- property_ids: every property of the group for a group_admin, else the
-- user's memberships. Expiry slides when a session is seen again after
-- fifteen minutes.
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
    WHERE s.token_hash = p_token_hash AND s.expires_at > now() AND u.is_active;
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.auth_delete_session(p_token_hash text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM sessions WHERE token_hash = p_token_hash
$$;--> statement-breakpoint

-- Set or replace a password and end every session of that user. The caller
-- (seed, or the settings action after its own authorization check) decides who.
CREATE OR REPLACE FUNCTION public.auth_set_password(p_user_id uuid, p_password_hash text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO user_credentials (user_id, password_hash) VALUES (p_user_id, p_password_hash)
  ON CONFLICT (user_id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = now();
  DELETE FROM sessions WHERE user_id = p_user_id
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.auth_credentials(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.auth_create_session(uuid, text, timestamptz, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.auth_resolve_session(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.auth_delete_session(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.auth_set_password(uuid, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.auth_credentials(text) TO app_user;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.auth_create_session(uuid, text, timestamptz, text) TO app_user;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.auth_resolve_session(text) TO app_user;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.auth_delete_session(text) TO app_user;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.auth_set_password(uuid, text) TO app_user;
