CREATE TYPE "public"."verification_status" AS ENUM('open', 'done', 'skipped');--> statement-breakpoint
CREATE TABLE "verification_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"location_id" uuid,
	"due_at" timestamp with time zone NOT NULL,
	"instructions" text,
	"assignee_user_id" uuid,
	"assignee_department" "department",
	"status" "verification_status" DEFAULT 'open' NOT NULL,
	"result" text,
	"outcome_id" uuid,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone,
	"done_by" uuid
);
--> statement-breakpoint
ALTER TABLE "verification_tasks" ADD CONSTRAINT "verification_tasks_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tasks" ADD CONSTRAINT "verification_tasks_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tasks" ADD CONSTRAINT "verification_tasks_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tasks" ADD CONSTRAINT "verification_tasks_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tasks" ADD CONSTRAINT "verification_tasks_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tasks" ADD CONSTRAINT "verification_tasks_outcome_id_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."outcomes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tasks" ADD CONSTRAINT "verification_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tasks" ADD CONSTRAINT "verification_tasks_done_by_users_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verification_tasks_property_status_due_idx" ON "verification_tasks" USING btree ("property_id","status","due_at");--> statement-breakpoint
CREATE INDEX "verification_tasks_issue_idx" ON "verification_tasks" USING btree ("issue_id");--> statement-breakpoint

-- Same tenant isolation as every other property-scoped table (see 0002).
ALTER TABLE public.verification_tasks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.verification_tasks FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.verification_tasks
  USING (group_id = public.app_group_id() AND property_id = ANY (public.app_property_ids()))
  WITH CHECK (group_id = public.app_group_id() AND property_id = ANY (public.app_property_ids()));
