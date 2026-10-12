ALTER TABLE "checklist_item" ADD COLUMN "requirementType" text;--> statement-breakpoint
ALTER TABLE "checklist_item" ADD COLUMN "applicability" text;--> statement-breakpoint
ALTER TABLE "checklist_item" ADD COLUMN "requirementCondition" text;--> statement-breakpoint
ALTER TABLE "checklist_item" ADD COLUMN "origin" text;--> statement-breakpoint
ALTER TABLE "checklist_item" ADD COLUMN "removedAt" timestamp (3) with time zone;