CREATE TABLE "review_job" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"applicantId" text NOT NULL,
	"userId" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"recoveryCount" integer DEFAULT 0 NOT NULL,
	"claimToken" text,
	"leaseUntil" timestamp (3) with time zone,
	"evaluationId" text,
	"error" text,
	"metrics" jsonb,
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"startedAt" timestamp (3) with time zone,
	"finishedAt" timestamp (3) with time zone
);
--> statement-breakpoint
ALTER TABLE "review_job" ADD CONSTRAINT "review_job_applicationId_visa_application_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."visa_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_job" ADD CONSTRAINT "review_job_applicantId_applicant_id_fk" FOREIGN KEY ("applicantId") REFERENCES "public"."applicant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_job" ADD CONSTRAINT "review_job_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_job" ADD CONSTRAINT "review_job_evaluationId_document_evaluation_id_fk" FOREIGN KEY ("evaluationId") REFERENCES "public"."document_evaluation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_job_active_applicant_idx" ON "review_job" USING btree ("applicantId") WHERE "review_job"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "review_job_lookup_idx" ON "review_job" USING btree ("applicationId","applicantId","createdAt");--> statement-breakpoint
CREATE INDEX "review_job_recovery_idx" ON "review_job" USING btree ("status","updatedAt");