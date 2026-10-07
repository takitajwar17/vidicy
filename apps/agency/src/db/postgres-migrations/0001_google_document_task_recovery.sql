ALTER TABLE "uploaded_document" ADD COLUMN "processingRecoveryCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "uploaded_document" ADD COLUMN "processingRecoveryBucket" text;