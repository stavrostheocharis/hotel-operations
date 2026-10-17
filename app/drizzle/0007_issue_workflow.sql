ALTER TABLE "signals" ADD COLUMN "locked_fields" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "mapped" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "derived_status" "issue_status" DEFAULT 'detected' NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "status_source" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "status_changed_by" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "assigned_by" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "verified_by" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "superseded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "superseded_by_issue_id" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "last_rebuild_job_id" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_status_changed_by_users_id_fk" FOREIGN KEY ("status_changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;