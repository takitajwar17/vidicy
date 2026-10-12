CREATE TABLE "checklist_job" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"applicantId" text NOT NULL,
	"userId" text NOT NULL,
	"refreshResearch" boolean DEFAULT false NOT NULL,
	"contextHash" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"recoveryCount" integer DEFAULT 0 NOT NULL,
	"claimToken" text,
	"leaseUntil" timestamp (3) with time zone,
	"error" text,
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"startedAt" timestamp (3) with time zone,
	"finishedAt" timestamp (3) with time zone
);
--> statement-breakpoint
ALTER TABLE "checklist_job" ADD CONSTRAINT "checklist_job_applicationId_visa_application_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."visa_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_job" ADD CONSTRAINT "checklist_job_applicantId_applicant_id_fk" FOREIGN KEY ("applicantId") REFERENCES "public"."applicant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_job" ADD CONSTRAINT "checklist_job_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_job_active_applicant_idx" ON "checklist_job" USING btree ("applicantId") WHERE "checklist_job"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "checklist_job_lookup_idx" ON "checklist_job" USING btree ("applicationId","applicantId","createdAt");--> statement-breakpoint
CREATE INDEX "checklist_job_recovery_idx" ON "checklist_job" USING btree ("status","updatedAt");