CREATE TABLE "agency" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"ownerUserId" text,
	"name" text NOT NULL,
	CONSTRAINT "agency_ownerUserId_unique" UNIQUE("ownerUserId")
);
--> statement-breakpoint
ALTER TABLE "visa_application" ADD COLUMN "agencyId" text;--> statement-breakpoint
ALTER TABLE "agency_client" ADD COLUMN "agencyId" text;--> statement-breakpoint
ALTER TABLE "agency_team_member" ADD COLUMN "agencyId" text;--> statement-breakpoint
ALTER TABLE "agency" ADD CONSTRAINT "agency_ownerUserId_user_id_fk" FOREIGN KEY ("ownerUserId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agency_owner_idx" ON "agency" USING btree ("ownerUserId");--> statement-breakpoint
ALTER TABLE "visa_application" ADD CONSTRAINT "visa_application_agencyId_agency_id_fk" FOREIGN KEY ("agencyId") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_client" ADD CONSTRAINT "agency_client_agencyId_agency_id_fk" FOREIGN KEY ("agencyId") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_team_member" ADD CONSTRAINT "agency_team_member_agencyId_agency_id_fk" FOREIGN KEY ("agencyId") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visa_app_agency_idx" ON "visa_application" USING btree ("agencyId");--> statement-breakpoint
CREATE INDEX "agency_client_agency_idx" ON "agency_client" USING btree ("agencyId");--> statement-breakpoint
CREATE INDEX "agency_team_member_agency_idx" ON "agency_team_member" USING btree ("agencyId");