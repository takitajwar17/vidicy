CREATE TABLE "agency_invitation" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"agencyId" text NOT NULL,
	"codeHash" text NOT NULL,
	"recipientEmail" text,
	"createdById" text,
	"expiresAt" timestamp (3) with time zone NOT NULL,
	"redeemedAt" timestamp (3) with time zone,
	"redeemedById" text,
	"revokedAt" timestamp (3) with time zone,
	"deliveryStatus" text DEFAULT 'not_sent' NOT NULL,
	"deliveryAttempts" integer DEFAULT 0 NOT NULL,
	"deliveryKey" text,
	"deliveryRequest" jsonb,
	"deliveryStartedAt" timestamp (3) with time zone,
	"sentAt" timestamp (3) with time zone,
	"providerMessageId" text,
	"lastDeliveryError" text,
	CONSTRAINT "agency_invitation_codeHash_unique" UNIQUE("codeHash")
);
--> statement-breakpoint
ALTER TABLE "agency_invitation" ADD CONSTRAINT "agency_invitation_agencyId_agency_id_fk" FOREIGN KEY ("agencyId") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_invitation" ADD CONSTRAINT "agency_invitation_createdById_user_id_fk" FOREIGN KEY ("createdById") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_invitation" ADD CONSTRAINT "agency_invitation_redeemedById_user_id_fk" FOREIGN KEY ("redeemedById") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agency_invitation_agency_idx" ON "agency_invitation" USING btree ("agencyId");--> statement-breakpoint
CREATE INDEX "agency_invitation_expiry_idx" ON "agency_invitation" USING btree ("expiresAt");