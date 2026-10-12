ALTER TABLE "client_report" ADD COLUMN "kind" text DEFAULT 'review' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_report" ADD COLUMN "reviewContextHash" text;