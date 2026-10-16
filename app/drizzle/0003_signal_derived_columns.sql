ALTER TABLE "signals" ADD COLUMN "topic" text;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "language_confidence" numeric(4, 3);--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "normalized" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "normalized_at" timestamp with time zone;