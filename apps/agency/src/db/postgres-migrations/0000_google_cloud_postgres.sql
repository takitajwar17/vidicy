CREATE TABLE "user" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"firstName" text,
	"lastName" text,
	"email" text,
	"passwordHash" text,
	"role" text DEFAULT 'user' NOT NULL,
	"emailVerified" timestamp (3) with time zone,
	"signUpIpAddress" text,
	"googleAccountId" text,
	"avatar" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "visa_application" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"homeCountry" text NOT NULL,
	"currentCountry" text NOT NULL,
	"destinationCountry" text NOT NULL,
	"visaType" text NOT NULL,
	"embassy" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"riskLevel" text,
	"readinessScore" integer,
	"trashedAt" timestamp (3) with time zone,
	"name" text DEFAULT '' NOT NULL,
	"settings" text DEFAULT '{}' NOT NULL,
	"checklistSource" text,
	"checklistGeneratedAt" timestamp (3) with time zone,
	"checklistCitations" jsonb,
	"actualOutcome" text,
	"outcomeDate" timestamp (3) with time zone,
	"outcomeNotes" text,
	"caseNumber" text,
	"clientId" text,
	"clientName" text,
	"clientEmail" text,
	"clientPhone" text,
	"agencyStatus" text DEFAULT 'intake' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"assignedReviewerId" text,
	"intakeSource" text DEFAULT 'manual' NOT NULL,
	"submittedAt" timestamp (3) with time zone,
	"dueAt" timestamp (3) with time zone,
	"reviewCompletedAt" timestamp (3) with time zone,
	"finalSubmissionAt" timestamp (3) with time zone,
	"clientReportStatus" text DEFAULT 'not_started' NOT NULL,
	CONSTRAINT "visa_application_caseNumber_unique" UNIQUE("caseNumber")
);
--> statement-breakpoint
CREATE TABLE "marketing_contact" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"email" text NOT NULL,
	"resendContactId" text,
	"subscribedOnboarding" boolean DEFAULT true NOT NULL,
	"subscribedPostPurchase" boolean DEFAULT true NOT NULL,
	"subscribedWinback" boolean DEFAULT true NOT NULL,
	"lastSyncedAt" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "marketing_email_send" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"enrollmentId" text NOT NULL,
	"sequence" text NOT NULL,
	"stepKey" text NOT NULL,
	"resendBroadcastId" text,
	"resendSegmentId" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"sentAt" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "marketing_event" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"applicationId" text,
	"type" text NOT NULL,
	"payload" jsonb,
	"occurredAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_sequence_enrollment" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"applicationId" text,
	"sequence" text NOT NULL,
	"stepKey" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"enteredAt" timestamp (3) with time zone NOT NULL,
	"nextSendAt" timestamp (3) with time zone NOT NULL,
	"lastSentAt" timestamp (3) with time zone,
	"completedAt" timestamp (3) with time zone,
	"exitReason" text
);
--> statement-breakpoint
CREATE TABLE "applicant" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"name" text NOT NULL,
	"relationship" text NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"dateOfBirth" text,
	"passportNumber" text,
	"nationality" text,
	"readinessScore" integer,
	"riskLevel" text,
	"email" text,
	"userId" text,
	"approvedBefore" boolean,
	"approvedVisaType" text,
	"approvedYear" text,
	"rejectedBefore" boolean,
	"rejectedVisaType" text,
	"rejectedYear" text,
	"rejectedReason" text
);
--> statement-breakpoint
CREATE TABLE "checklist_item" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"applicantId" text,
	"documentName" text NOT NULL,
	"description" text NOT NULL,
	"commonMistakes" text,
	"isRequired" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_evaluation" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"applicantId" text,
	"overallScore" integer NOT NULL,
	"riskLevel" text NOT NULL,
	"summary" text NOT NULL,
	"redFlags" jsonb NOT NULL,
	"strengths" jsonb NOT NULL,
	"recommendations" jsonb NOT NULL,
	"itemFeedback" jsonb,
	"docSnapshots" jsonb,
	"scoreConfidence" text,
	"ensembleDivergence" integer,
	"atlasPreview" jsonb,
	"createdAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploaded_document" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"applicantId" text,
	"checklistItemId" text,
	"fileName" text NOT NULL,
	"fileKey" text NOT NULL,
	"fileSize" integer NOT NULL,
	"mimeType" text NOT NULL,
	"uploadedAt" timestamp (3) with time zone NOT NULL,
	"chunkCount" integer DEFAULT 0 NOT NULL,
	"extractionStatus" text DEFAULT 'queued' NOT NULL,
	"indexingStatus" text DEFAULT 'queued' NOT NULL,
	"extractionMethod" text,
	"extractedAt" timestamp (3) with time zone,
	"indexingAttemptedAt" timestamp (3) with time zone,
	"pageCount" integer,
	"imageDescription" text,
	"extractionPayload" jsonb,
	"textContent" text
);
--> statement-breakpoint
CREATE TABLE "chat_conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"name" text DEFAULT 'New chat' NOT NULL,
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message" (
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"conversationId" text,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"thumbnailDataUrl" text,
	"createdAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_invitation" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"email" text NOT NULL,
	"roleId" text NOT NULL,
	"isSystemRole" integer DEFAULT 1 NOT NULL,
	"token" text NOT NULL,
	"invitedBy" text NOT NULL,
	"expiresAt" timestamp (3) with time zone NOT NULL,
	"acceptedAt" timestamp (3) with time zone,
	"acceptedBy" text,
	CONSTRAINT "application_invitation_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "application_membership" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"userId" text NOT NULL,
	"roleId" text NOT NULL,
	"isSystemRole" integer DEFAULT 1 NOT NULL,
	"invitedBy" text,
	"invitedAt" timestamp (3) with time zone,
	"joinedAt" timestamp (3) with time zone,
	"expiresAt" timestamp (3) with time zone,
	"isActive" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_role" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"permissions" jsonb NOT NULL,
	"metadata" text,
	"isEditable" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_message" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"ticketId" text NOT NULL,
	"userId" text NOT NULL,
	"content" text NOT NULL,
	"isAdminReply" boolean DEFAULT false NOT NULL,
	"isSystemMessage" boolean DEFAULT false NOT NULL,
	"screenshotUrls" jsonb
);
--> statement-breakpoint
CREATE TABLE "support_ticket" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"userId" text,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"screenshotUrls" jsonb,
	"adminNote" text,
	"resolvedAt" timestamp (3) with time zone,
	"lastViewedAt" timestamp (3) with time zone,
	"adminLastViewedAt" timestamp (3) with time zone,
	"lastUpdatedAt" timestamp (3) with time zone,
	"userAgent" text,
	"ipAddress" text
);
--> statement-breakpoint
CREATE TABLE "enterprise_inquiry" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company" text NOT NULL,
	"role" text,
	"teamSize" text,
	"monthlyVolume" text,
	"website" text,
	"message" text,
	"status" text DEFAULT 'new' NOT NULL,
	"adminNote" text
);
--> statement-breakpoint
CREATE TABLE "announcement_comment" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"postId" text NOT NULL,
	"userId" text NOT NULL,
	"parentId" text,
	"body" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcement_poll_option" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"postId" text NOT NULL,
	"label" text NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcement_poll_vote" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"postId" text NOT NULL,
	"optionId" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcement_post" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"authorId" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"attachments" jsonb,
	"ctaLabel" text,
	"ctaUrl" text,
	"embedTitle" text,
	"embedUrl" text,
	"type" text DEFAULT 'announcement' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"commentsEnabled" boolean DEFAULT true NOT NULL,
	"pollSingleChoice" boolean DEFAULT true NOT NULL,
	"pollNamedVotes" boolean DEFAULT true NOT NULL,
	"pollAllowVoteChange" boolean DEFAULT true NOT NULL,
	"pollCloseAt" timestamp (3) with time zone,
	"emailNotificationSent" boolean DEFAULT false NOT NULL,
	"publishedAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcement_read" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"postId" text NOT NULL,
	"userId" text NOT NULL,
	"readAt" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcement_upvote" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"postId" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_client" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"companyName" text,
	"country" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "agency_team_member" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"userId" text,
	"email" text,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"invitedBy" text,
	"invitedAt" timestamp (3) with time zone,
	"joinedAt" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "client_report" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"summary" text NOT NULL,
	"actionItems" jsonb NOT NULL,
	"createdById" text,
	"sentAt" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "review_issue" (
	"createdAt" timestamp (3) with time zone NOT NULL,
	"updatedAt" timestamp (3) with time zone NOT NULL,
	"updateCounter" integer DEFAULT 0,
	"id" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"applicantId" text,
	"checklistItemId" text,
	"documentId" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"recommendation" text,
	"category" text DEFAULT 'document' NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"source" text DEFAULT 'reviewer' NOT NULL,
	"confidence" integer,
	"clientVisible" boolean DEFAULT true NOT NULL,
	"assignedToId" text,
	"createdById" text,
	"resolvedAt" timestamp (3) with time zone
);
--> statement-breakpoint
ALTER TABLE "visa_application" ADD CONSTRAINT "visa_application_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visa_application" ADD CONSTRAINT "visa_application_assignedReviewerId_user_id_fk" FOREIGN KEY ("assignedReviewerId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_contact" ADD CONSTRAINT "marketing_contact_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_email_send" ADD CONSTRAINT "marketing_email_send_enrollmentId_marketing_sequence_enrollment_id_fk" FOREIGN KEY ("enrollmentId") REFERENCES "public"."marketing_sequence_enrollment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_event" ADD CONSTRAINT "marketing_event_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_event" ADD CONSTRAINT "marketing_event_applicationId_visa_application_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."visa_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_sequence_enrollment" ADD CONSTRAINT "marketing_sequence_enrollment_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_sequence_enrollment" ADD CONSTRAINT "marketing_sequence_enrollment_applicationId_visa_application_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."visa_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicant" ADD CONSTRAINT "applicant_applicationId_visa_application_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."visa_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicant" ADD CONSTRAINT "applicant_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_applicationId_visa_application_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."visa_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_applicantId_applicant_id_fk" FOREIGN KEY ("applicantId") REFERENCES "public"."applicant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_evaluation" ADD CONSTRAINT "document_evaluation_applicationId_visa_application_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."visa_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_evaluation" ADD CONSTRAINT "document_evaluation_applicantId_applicant_id_fk" FOREIGN KEY ("applicantId") REFERENCES "public"."applicant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_document" ADD CONSTRAINT "uploaded_document_applicationId_visa_application_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."visa_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_document" ADD CONSTRAINT "uploaded_document_applicantId_applicant_id_fk" FOREIGN KEY ("applicantId") REFERENCES "public"."applicant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_document" ADD CONSTRAINT "uploaded_document_checklistItemId_checklist_item_id_fk" FOREIGN KEY ("checklistItemId") REFERENCES "public"."checklist_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversation" ADD CONSTRAINT "chat_conversation_applicationId_visa_application_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."visa_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_applicationId_visa_application_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."visa_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_conversationId_chat_conversation_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."chat_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_invitation" ADD CONSTRAINT "application_invitation_applicationId_visa_application_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."visa_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_invitation" ADD CONSTRAINT "application_invitation_invitedBy_user_id_fk" FOREIGN KEY ("invitedBy") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_invitation" ADD CONSTRAINT "application_invitation_acceptedBy_user_id_fk" FOREIGN KEY ("acceptedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_membership" ADD CONSTRAINT "application_membership_applicationId_visa_application_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."visa_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_membership" ADD CONSTRAINT "application_membership_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_membership" ADD CONSTRAINT "application_membership_invitedBy_user_id_fk" FOREIGN KEY ("invitedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_role" ADD CONSTRAINT "application_role_applicationId_visa_application_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."visa_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_message" ADD CONSTRAINT "support_message_ticketId_support_ticket_id_fk" FOREIGN KEY ("ticketId") REFERENCES "public"."support_ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_message" ADD CONSTRAINT "support_message_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_comment" ADD CONSTRAINT "announcement_comment_postId_announcement_post_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."announcement_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_comment" ADD CONSTRAINT "announcement_comment_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_comment" ADD CONSTRAINT "announcement_comment_parentId_announcement_comment_id_fk" FOREIGN KEY ("parentId") REFERENCES "public"."announcement_comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_poll_option" ADD CONSTRAINT "announcement_poll_option_postId_announcement_post_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."announcement_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_poll_vote" ADD CONSTRAINT "announcement_poll_vote_postId_announcement_post_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."announcement_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_poll_vote" ADD CONSTRAINT "announcement_poll_vote_optionId_announcement_poll_option_id_fk" FOREIGN KEY ("optionId") REFERENCES "public"."announcement_poll_option"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_poll_vote" ADD CONSTRAINT "announcement_poll_vote_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_post" ADD CONSTRAINT "announcement_post_authorId_user_id_fk" FOREIGN KEY ("authorId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_read" ADD CONSTRAINT "announcement_read_postId_announcement_post_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."announcement_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_read" ADD CONSTRAINT "announcement_read_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_upvote" ADD CONSTRAINT "announcement_upvote_postId_announcement_post_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."announcement_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_upvote" ADD CONSTRAINT "announcement_upvote_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_team_member" ADD CONSTRAINT "agency_team_member_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_team_member" ADD CONSTRAINT "agency_team_member_invitedBy_user_id_fk" FOREIGN KEY ("invitedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_report" ADD CONSTRAINT "client_report_applicationId_visa_application_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."visa_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_report" ADD CONSTRAINT "client_report_createdById_user_id_fk" FOREIGN KEY ("createdById") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_issue" ADD CONSTRAINT "review_issue_applicationId_visa_application_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."visa_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_issue" ADD CONSTRAINT "review_issue_applicantId_applicant_id_fk" FOREIGN KEY ("applicantId") REFERENCES "public"."applicant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_issue" ADD CONSTRAINT "review_issue_checklistItemId_checklist_item_id_fk" FOREIGN KEY ("checklistItemId") REFERENCES "public"."checklist_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_issue" ADD CONSTRAINT "review_issue_documentId_uploaded_document_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."uploaded_document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_issue" ADD CONSTRAINT "review_issue_assignedToId_user_id_fk" FOREIGN KEY ("assignedToId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_issue" ADD CONSTRAINT "review_issue_createdById_user_id_fk" FOREIGN KEY ("createdById") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_idx" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "google_account_id_idx" ON "user" USING btree ("googleAccountId");--> statement-breakpoint
CREATE INDEX "role_idx" ON "user" USING btree ("role");--> statement-breakpoint
CREATE INDEX "visa_app_user_id_idx" ON "visa_application" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "visa_app_status_idx" ON "visa_application" USING btree ("status");--> statement-breakpoint
CREATE INDEX "visa_app_agency_status_idx" ON "visa_application" USING btree ("agencyStatus");--> statement-breakpoint
CREATE INDEX "visa_app_case_number_idx" ON "visa_application" USING btree ("caseNumber");--> statement-breakpoint
CREATE INDEX "visa_app_client_id_idx" ON "visa_application" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX "visa_app_assigned_reviewer_idx" ON "visa_application" USING btree ("assignedReviewerId");--> statement-breakpoint
CREATE INDEX "visa_app_priority_idx" ON "visa_application" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "visa_app_created_at_idx" ON "visa_application" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "visa_app_user_created_idx" ON "visa_application" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "visa_app_user_trashed_created_idx" ON "visa_application" USING btree ("userId","trashedAt","createdAt");--> statement-breakpoint
CREATE INDEX "visa_app_status_created_idx" ON "visa_application" USING btree ("agencyStatus","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_contact_user_unique_idx" ON "marketing_contact" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_contact_email_unique_idx" ON "marketing_contact" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_contact_resend_contact_unique_idx" ON "marketing_contact" USING btree ("resendContactId");--> statement-breakpoint
CREATE INDEX "marketing_send_enrollment_idx" ON "marketing_email_send" USING btree ("enrollmentId");--> statement-breakpoint
CREATE INDEX "marketing_send_status_idx" ON "marketing_email_send" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_send_broadcast_unique_idx" ON "marketing_email_send" USING btree ("resendBroadcastId");--> statement-breakpoint
CREATE INDEX "marketing_event_user_idx" ON "marketing_event" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "marketing_event_application_idx" ON "marketing_event" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX "marketing_event_type_idx" ON "marketing_event" USING btree ("type");--> statement-breakpoint
CREATE INDEX "marketing_event_occurred_at_idx" ON "marketing_event" USING btree ("occurredAt");--> statement-breakpoint
CREATE INDEX "marketing_enrollment_user_idx" ON "marketing_sequence_enrollment" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "marketing_enrollment_application_idx" ON "marketing_sequence_enrollment" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX "marketing_enrollment_sequence_status_idx" ON "marketing_sequence_enrollment" USING btree ("sequence","status");--> statement-breakpoint
CREATE INDEX "marketing_enrollment_next_send_idx" ON "marketing_sequence_enrollment" USING btree ("nextSendAt");--> statement-breakpoint
CREATE INDEX "applicant_app_id_idx" ON "applicant" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX "applicant_user_id_idx" ON "applicant" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "applicant_app_created_idx" ON "applicant" USING btree ("applicationId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "applicant_app_email_unique_idx" ON "applicant" USING btree ("applicationId","email");--> statement-breakpoint
CREATE INDEX "checklist_item_app_id_idx" ON "checklist_item" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX "checklist_item_applicant_id_idx" ON "checklist_item" USING btree ("applicantId");--> statement-breakpoint
CREATE INDEX "checklist_item_status_idx" ON "checklist_item" USING btree ("status");--> statement-breakpoint
CREATE INDEX "checklist_item_app_applicant_idx" ON "checklist_item" USING btree ("applicationId","applicantId");--> statement-breakpoint
CREATE INDEX "checklist_item_app_applicant_sort_idx" ON "checklist_item" USING btree ("applicationId","applicantId","sortOrder");--> statement-breakpoint
CREATE INDEX "doc_eval_app_id_idx" ON "document_evaluation" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX "doc_eval_applicant_id_idx" ON "document_evaluation" USING btree ("applicantId");--> statement-breakpoint
CREATE INDEX "doc_eval_created_at_idx" ON "document_evaluation" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "doc_eval_app_applicant_idx" ON "document_evaluation" USING btree ("applicationId","applicantId");--> statement-breakpoint
CREATE INDEX "doc_eval_app_created_idx" ON "document_evaluation" USING btree ("applicationId","createdAt");--> statement-breakpoint
CREATE INDEX "doc_eval_app_applicant_created_idx" ON "document_evaluation" USING btree ("applicationId","applicantId","createdAt");--> statement-breakpoint
CREATE INDEX "uploaded_doc_app_id_idx" ON "uploaded_document" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX "uploaded_doc_applicant_id_idx" ON "uploaded_document" USING btree ("applicantId");--> statement-breakpoint
CREATE INDEX "uploaded_doc_checklist_item_idx" ON "uploaded_document" USING btree ("checklistItemId");--> statement-breakpoint
CREATE INDEX "uploaded_doc_extraction_status_idx" ON "uploaded_document" USING btree ("extractionStatus");--> statement-breakpoint
CREATE INDEX "uploaded_doc_indexing_status_idx" ON "uploaded_document" USING btree ("indexingStatus");--> statement-breakpoint
CREATE INDEX "uploaded_doc_uploaded_at_idx" ON "uploaded_document" USING btree ("uploadedAt");--> statement-breakpoint
CREATE INDEX "uploaded_doc_app_applicant_idx" ON "uploaded_document" USING btree ("applicationId","applicantId");--> statement-breakpoint
CREATE INDEX "uploaded_doc_app_checklist_item_idx" ON "uploaded_document" USING btree ("applicationId","checklistItemId");--> statement-breakpoint
CREATE INDEX "uploaded_doc_app_uploaded_idx" ON "uploaded_document" USING btree ("applicationId","uploadedAt");--> statement-breakpoint
CREATE INDEX "uploaded_doc_app_applicant_uploaded_idx" ON "uploaded_document" USING btree ("applicationId","applicantId","uploadedAt");--> statement-breakpoint
CREATE INDEX "chat_conv_app_id_idx" ON "chat_conversation" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX "chat_conv_app_updated_idx" ON "chat_conversation" USING btree ("applicationId","updatedAt");--> statement-breakpoint
CREATE INDEX "chat_msg_app_id_idx" ON "chat_message" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX "chat_msg_conv_id_idx" ON "chat_message" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "chat_msg_created_at_idx" ON "chat_message" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "chat_msg_conv_created_idx" ON "chat_message" USING btree ("conversationId","createdAt");--> statement-breakpoint
CREATE INDEX "app_invitation_app_id_idx" ON "application_invitation" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX "app_invitation_email_idx" ON "application_invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "app_invitation_token_idx" ON "application_invitation" USING btree ("token");--> statement-breakpoint
CREATE INDEX "app_membership_app_id_idx" ON "application_membership" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX "app_membership_user_id_idx" ON "application_membership" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "app_membership_unique_idx" ON "application_membership" USING btree ("applicationId","userId");--> statement-breakpoint
CREATE INDEX "app_role_app_id_idx" ON "application_role" USING btree ("applicationId");--> statement-breakpoint
CREATE UNIQUE INDEX "app_role_name_unique_idx" ON "application_role" USING btree ("applicationId","name");--> statement-breakpoint
CREATE INDEX "support_message_ticket_id_idx" ON "support_message" USING btree ("ticketId");--> statement-breakpoint
CREATE INDEX "support_message_user_id_idx" ON "support_message" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "support_message_created_at_idx" ON "support_message" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "support_ticket_user_id_idx" ON "support_ticket" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "support_ticket_status_idx" ON "support_ticket" USING btree ("status");--> statement-breakpoint
CREATE INDEX "support_ticket_category_idx" ON "support_ticket" USING btree ("category");--> statement-breakpoint
CREATE INDEX "support_ticket_last_updated_at_idx" ON "support_ticket" USING btree ("lastUpdatedAt");--> statement-breakpoint
CREATE INDEX "support_ticket_user_updated_idx" ON "support_ticket" USING btree ("userId","lastUpdatedAt");--> statement-breakpoint
CREATE INDEX "support_ticket_status_category_idx" ON "support_ticket" USING btree ("status","category");--> statement-breakpoint
CREATE INDEX "enterprise_inquiry_email_idx" ON "enterprise_inquiry" USING btree ("email");--> statement-breakpoint
CREATE INDEX "enterprise_inquiry_status_idx" ON "enterprise_inquiry" USING btree ("status");--> statement-breakpoint
CREATE INDEX "announcement_comment_post_idx" ON "announcement_comment" USING btree ("postId");--> statement-breakpoint
CREATE INDEX "announcement_comment_parent_idx" ON "announcement_comment" USING btree ("parentId");--> statement-breakpoint
CREATE INDEX "announcement_comment_user_idx" ON "announcement_comment" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "announcement_poll_option_post_idx" ON "announcement_poll_option" USING btree ("postId");--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_poll_vote_unique_user_post_option" ON "announcement_poll_vote" USING btree ("postId","userId","optionId");--> statement-breakpoint
CREATE INDEX "announcement_poll_vote_post_idx" ON "announcement_poll_vote" USING btree ("postId");--> statement-breakpoint
CREATE INDEX "announcement_poll_vote_user_idx" ON "announcement_poll_vote" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "announcement_post_author_idx" ON "announcement_post" USING btree ("authorId");--> statement-breakpoint
CREATE INDEX "announcement_post_type_idx" ON "announcement_post" USING btree ("type");--> statement-breakpoint
CREATE INDEX "announcement_post_priority_idx" ON "announcement_post" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "announcement_post_pinned_idx" ON "announcement_post" USING btree ("pinned");--> statement-breakpoint
CREATE INDEX "announcement_post_published_idx" ON "announcement_post" USING btree ("publishedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_read_unique_user_post" ON "announcement_read" USING btree ("postId","userId");--> statement-breakpoint
CREATE INDEX "announcement_read_user_idx" ON "announcement_read" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_upvote_unique_user_post" ON "announcement_upvote" USING btree ("postId","userId");--> statement-breakpoint
CREATE INDEX "announcement_upvote_post_idx" ON "announcement_upvote" USING btree ("postId");--> statement-breakpoint
CREATE INDEX "agency_client_name_idx" ON "agency_client" USING btree ("name");--> statement-breakpoint
CREATE INDEX "agency_client_email_idx" ON "agency_client" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "agency_team_member_user_unique_idx" ON "agency_team_member" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "agency_team_member_email_unique_idx" ON "agency_team_member" USING btree ("email");--> statement-breakpoint
CREATE INDEX "agency_team_member_email_idx" ON "agency_team_member" USING btree ("email");--> statement-breakpoint
CREATE INDEX "agency_team_member_role_idx" ON "agency_team_member" USING btree ("role");--> statement-breakpoint
CREATE INDEX "agency_team_member_status_idx" ON "agency_team_member" USING btree ("status");--> statement-breakpoint
CREATE INDEX "client_report_app_id_idx" ON "client_report" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX "client_report_status_idx" ON "client_report" USING btree ("status");--> statement-breakpoint
CREATE INDEX "review_issue_app_id_idx" ON "review_issue" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX "review_issue_app_status_idx" ON "review_issue" USING btree ("applicationId","status");--> statement-breakpoint
CREATE INDEX "review_issue_app_severity_idx" ON "review_issue" USING btree ("applicationId","severity");--> statement-breakpoint
CREATE INDEX "review_issue_assigned_to_idx" ON "review_issue" USING btree ("assignedToId");--> statement-breakpoint
CREATE INDEX "review_issue_checklist_item_idx" ON "review_issue" USING btree ("checklistItemId");