-- ---------------------------------------------------------------------------
-- Roles
--
-- app_user      the web app. Row-level security applies to every query.
-- app_migrator  migrations, seeds, loaders. Bypasses RLS. In development the
--               compose superuser (postgres) plays this role too.
-- pii_admin     the only role that can read the pii schema.
--
-- The passwords below are development defaults so a clean clone works. In any
-- shared environment rotate them immediately:
--   ALTER ROLE app_user PASSWORD '...'; ALTER ROLE pii_admin PASSWORD '...';
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_user';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_migrator') THEN
    CREATE ROLE app_migrator LOGIN PASSWORD 'app_migrator' BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pii_admin') THEN
    CREATE ROLE pii_admin LOGIN PASSWORD 'pii_admin';
  END IF;
END
$$;
--> statement-breakpoint

-- public: the app role may read and write (RLS decides which rows); the
-- migrator owns nothing but may do anything.
GRANT USAGE ON SCHEMA public TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
--> statement-breakpoint
GRANT ALL ON SCHEMA public TO app_migrator;
--> statement-breakpoint
GRANT ALL ON ALL TABLES IN SCHEMA public TO app_migrator;
--> statement-breakpoint
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO app_migrator;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO app_migrator;
--> statement-breakpoint

-- pii: nobody but pii_admin (and the migrator, for loaders) can touch it.
REVOKE ALL ON SCHEMA pii FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA pii FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA pii TO pii_admin, app_migrator;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pii TO pii_admin, app_migrator;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA pii GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pii_admin, app_migrator;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Tenant context
--
-- withTenant() sets two transaction-local settings; every policy reads them
-- through these helpers so a missing or empty context yields no rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_group_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.group_id', true), '')::uuid
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.app_property_ids() RETURNS uuid[]
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    string_to_array(NULLIF(current_setting('app.property_ids', true), ''), ',')::uuid[],
    '{}'::uuid[]
  )
$$;
--> statement-breakpoint

-- Property-scoped tables: group must match and the property must be named.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'memberships', 'locations', 'location_links', 'signals', 'issues',
    'issue_signals', 'actions', 'outcomes', 'events', 'ai_suggestions',
    'signal_embeddings', 'occupancy_daily'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I
         USING (group_id = public.app_group_id() AND property_id = ANY (public.app_property_ids()))
         WITH CHECK (group_id = public.app_group_id() AND property_id = ANY (public.app_property_ids()))',
      t
    );
  END LOOP;
END
$$;
--> statement-breakpoint

-- properties: visible when its group matches and it is named in the context.
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.properties FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.properties
  USING (group_id = public.app_group_id() AND id = ANY (public.app_property_ids()))
  WITH CHECK (group_id = public.app_group_id() AND id = ANY (public.app_property_ids()));
--> statement-breakpoint

-- groups and users: group-scoped.
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.groups FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.groups
  USING (id = public.app_group_id())
  WITH CHECK (id = public.app_group_id());
--> statement-breakpoint
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.users
  USING (group_id = public.app_group_id())
  WITH CHECK (group_id = public.app_group_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Immutability
--
-- signals: the observation is immutable; derived columns (language, text_en,
-- location_*, category) may be filled in later by normalisation.
-- events: append-only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.signals_guard_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.group_id IS DISTINCT FROM OLD.group_id
     OR NEW.property_id IS DISTINCT FROM OLD.property_id
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.external_id IS DISTINCT FROM OLD.external_id
     OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
     OR NEW.received_at IS DISTINCT FROM OLD.received_at
     OR NEW.text_original IS DISTINCT FROM OLD.text_original
     OR NEW.stay_ref IS DISTINCT FROM OLD.stay_ref
     OR NEW.raw IS DISTINCT FROM OLD.raw
     OR NEW.ingest_batch_id IS DISTINCT FROM OLD.ingest_batch_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'signals are immutable: only derived columns (language, text_en, location_*, category) may change'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER signals_immutable
  BEFORE UPDATE ON public.signals
  FOR EACH ROW EXECUTE FUNCTION public.signals_guard_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable (% not allowed)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END
$$;
--> statement-breakpoint
CREATE TRIGGER events_append_only
  BEFORE UPDATE OR DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.reject_mutation();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['groups', 'properties', 'users', 'locations', 'issues'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t, t
    );
  END LOOP;
END
$$;
