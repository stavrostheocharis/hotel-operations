CREATE TYPE "public"."import_source" AS ENUM('upload', 'folder');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('uploaded', 'checked', 'loading', 'loaded', 'failed', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."job_kind" AS ENUM('normalize', 'link', 'embed', 'import', 'audit');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"source" "import_source" NOT NULL,
	"dir" text NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bytes" bigint DEFAULT 0 NOT NULL,
	"status" "import_status" DEFAULT 'uploaded' NOT NULL,
	"verdict" text,
	"reality_report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"job_id" uuid,
	"error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"kind" "job_kind" NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"log" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"requested_by" uuid,
	"pid" integer,
	"heartbeat_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batches_property_created_idx" ON "import_batches" USING btree ("property_id","created_at");--> statement-breakpoint
CREATE INDEX "jobs_property_created_idx" ON "jobs" USING btree ("property_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_one_active_per_kind" ON "jobs" USING btree ("property_id","kind") WHERE status in ('queued', 'running');--> statement-breakpoint

-- Same tenant isolation as every other property-scoped table (see 0002).
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.jobs FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.jobs
  USING (group_id = public.app_group_id() AND property_id = ANY (public.app_property_ids()))
  WITH CHECK (group_id = public.app_group_id() AND property_id = ANY (public.app_property_ids()));--> statement-breakpoint
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.import_batches FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.import_batches
  USING (group_id = public.app_group_id() AND property_id = ANY (public.app_property_ids()))
  WITH CHECK (group_id = public.app_group_id() AND property_id = ANY (public.app_property_ids()));
