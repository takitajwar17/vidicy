ALTER TABLE "client_report" ADD COLUMN "deliveryKey" text;--> statement-breakpoint
ALTER TABLE "client_report" ADD COLUMN "deliveryPayload" jsonb;--> statement-breakpoint
ALTER TABLE "client_report" ADD COLUMN "deliveryStartedAt" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "client_report" ADD COLUMN "providerMessageId" text;