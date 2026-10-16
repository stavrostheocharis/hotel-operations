CREATE TYPE "public"."link_decision" AS ENUM('link', 'unlink');--> statement-breakpoint
CREATE TABLE "link_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"signal_a" uuid NOT NULL,
	"signal_b" uuid NOT NULL,
	"decision" "link_decision" NOT NULL,
	"decided_by" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "link_decisions_pair_unique" UNIQUE("property_id","signal_a","signal_b")
);
--> statement-breakpoint
ALTER TABLE "link_decisions" ADD CONSTRAINT "link_decisions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_decisions" ADD CONSTRAINT "link_decisions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_decisions" ADD CONSTRAINT "link_decisions_signal_a_signals_id_fk" FOREIGN KEY ("signal_a") REFERENCES "public"."signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_decisions" ADD CONSTRAINT "link_decisions_signal_b_signals_id_fk" FOREIGN KEY ("signal_b") REFERENCES "public"."signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "link_decisions_property_idx" ON "link_decisions" USING btree ("property_id");--> statement-breakpoint

-- Same tenant isolation as every other property-scoped table (see 0002).
-- Grants arrive through the default privileges set there.
ALTER TABLE public.link_decisions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.link_decisions FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.link_decisions
  USING (group_id = public.app_group_id() AND property_id = ANY (public.app_property_ids()))
  WITH CHECK (group_id = public.app_group_id() AND property_id = ANY (public.app_property_ids()));