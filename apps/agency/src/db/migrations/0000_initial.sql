CREATE TABLE `passkey_credential` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`credentialId` text(255) NOT NULL,
	`credentialPublicKey` text(255) NOT NULL,
	`counter` integer NOT NULL,
	`transports` text(255),
	`aaguid` text(255),
	`userAgent` text(255),
	`ipAddress` text(100),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `passkey_credential_credentialId_unique` ON `passkey_credential` (`credentialId`);--> statement-breakpoint
CREATE INDEX `user_id_idx` ON `passkey_credential` (`userId`);--> statement-breakpoint
CREATE INDEX `credential_id_idx` ON `passkey_credential` (`credentialId`);--> statement-breakpoint
CREATE TABLE `user` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`firstName` text(255),
	`lastName` text(255),
	`email` text(255),
	`passwordHash` text,
	`role` text DEFAULT 'user' NOT NULL,
	`emailVerified` integer,
	`signUpIpAddress` text(100),
	`googleAccountId` text(255),
	`avatar` text(600)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE INDEX `email_idx` ON `user` (`email`);--> statement-breakpoint
CREATE INDEX `google_account_id_idx` ON `user` (`googleAccountId`);--> statement-breakpoint
CREATE INDEX `role_idx` ON `user` (`role`);--> statement-breakpoint
CREATE TABLE `visa_application` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`homeCountry` text(100) NOT NULL,
	`currentCountry` text(100) NOT NULL,
	`destinationCountry` text(100) NOT NULL,
	`visaType` text(100) NOT NULL,
	`embassy` text(255) NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`riskLevel` text,
	`readinessScore` integer,
	`trashedAt` integer,
	`name` text(255) DEFAULT '' NOT NULL,
	`settings` text(10000) DEFAULT '{}' NOT NULL,
	`checklistSource` text(50),
	`checklistGeneratedAt` integer,
	`checklistCitations` text,
	`actualOutcome` text,
	`outcomeDate` integer,
	`outcomeNotes` text(1000),
	`paymentStatus` text DEFAULT 'unpaid' NOT NULL,
	`stripePaymentIntentId` text(255),
	`plan` text(20),
	`paidApplicantCount` integer DEFAULT 0 NOT NULL,
	`isFreeTrialApp` integer DEFAULT false NOT NULL,
	`freeEvaluationUsed` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `visa_app_user_id_idx` ON `visa_application` (`userId`);--> statement-breakpoint
CREATE INDEX `visa_app_status_idx` ON `visa_application` (`status`);--> statement-breakpoint
CREATE INDEX `visa_app_created_at_idx` ON `visa_application` (`createdAt`);--> statement-breakpoint
CREATE TABLE `payment_event` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`applicationId` text NOT NULL,
	`userId` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`amount` integer NOT NULL,
	`currency` text(10) DEFAULT 'usd' NOT NULL,
	`seatDelta` integer DEFAULT 0 NOT NULL,
	`targetPaidApplicantCount` integer DEFAULT 0 NOT NULL,
	`plan` text(20),
	`stripeCheckoutSessionId` text(255) NOT NULL,
	`stripeCheckoutSessionUrl` text(2000),
	`stripeCheckoutSessionExpiresAt` integer,
	`stripePaymentIntentId` text(255),
	FOREIGN KEY (`applicationId`) REFERENCES `visa_application`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `payment_event_app_id_idx` ON `payment_event` (`applicationId`);--> statement-breakpoint
CREATE INDEX `payment_event_status_idx` ON `payment_event` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_event_checkout_session_unique_idx` ON `payment_event` (`stripeCheckoutSessionId`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_event_payment_intent_unique_idx` ON `payment_event` (`stripePaymentIntentId`);--> statement-breakpoint
CREATE TABLE `applicant` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`applicationId` text NOT NULL,
	`name` text(255) NOT NULL,
	`relationship` text NOT NULL,
	`role` text DEFAULT 'owner' NOT NULL,
	`dateOfBirth` text(20),
	`passportNumber` text(100),
	`nationality` text(100),
	`readinessScore` integer,
	`riskLevel` text,
	`email` text(255),
	`userId` text,
	`approvedBefore` integer,
	`approvedVisaType` text(100),
	`approvedYear` text(10),
	`rejectedBefore` integer,
	`rejectedVisaType` text(100),
	`rejectedYear` text(10),
	`rejectedReason` text(500),
	FOREIGN KEY (`applicationId`) REFERENCES `visa_application`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `applicant_app_id_idx` ON `applicant` (`applicationId`);--> statement-breakpoint
CREATE INDEX `applicant_user_id_idx` ON `applicant` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `applicant_app_email_unique_idx` ON `applicant` (`applicationId`,`email`);--> statement-breakpoint
CREATE TABLE `checklist_item` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`applicationId` text NOT NULL,
	`applicantId` text,
	`documentName` text(255) NOT NULL,
	`description` text(1000) NOT NULL,
	`commonMistakes` text(1000),
	`isRequired` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`applicationId`) REFERENCES `visa_application`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`applicantId`) REFERENCES `applicant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checklist_item_app_id_idx` ON `checklist_item` (`applicationId`);--> statement-breakpoint
CREATE INDEX `checklist_item_applicant_id_idx` ON `checklist_item` (`applicantId`);--> statement-breakpoint
CREATE INDEX `checklist_item_status_idx` ON `checklist_item` (`status`);--> statement-breakpoint
CREATE INDEX `checklist_item_app_applicant_idx` ON `checklist_item` (`applicationId`,`applicantId`);--> statement-breakpoint
CREATE TABLE `document_evaluation` (
	`id` text PRIMARY KEY NOT NULL,
	`applicationId` text NOT NULL,
	`applicantId` text,
	`overallScore` integer NOT NULL,
	`riskLevel` text NOT NULL,
	`summary` text(2000) NOT NULL,
	`redFlags` text NOT NULL,
	`strengths` text NOT NULL,
	`recommendations` text NOT NULL,
	`itemFeedback` text,
	`docSnapshots` text,
	`scoreConfidence` text,
	`ensembleDivergence` integer,
	`atlasPreview` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`applicationId`) REFERENCES `visa_application`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`applicantId`) REFERENCES `applicant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `doc_eval_app_id_idx` ON `document_evaluation` (`applicationId`);--> statement-breakpoint
CREATE INDEX `doc_eval_applicant_id_idx` ON `document_evaluation` (`applicantId`);--> statement-breakpoint
CREATE INDEX `doc_eval_created_at_idx` ON `document_evaluation` (`createdAt`);--> statement-breakpoint
CREATE INDEX `doc_eval_app_applicant_idx` ON `document_evaluation` (`applicationId`,`applicantId`);--> statement-breakpoint
CREATE TABLE `uploaded_document` (
	`id` text PRIMARY KEY NOT NULL,
	`applicationId` text NOT NULL,
	`applicantId` text,
	`checklistItemId` text,
	`fileName` text(255) NOT NULL,
	`fileKey` text(500) NOT NULL,
	`fileSize` integer NOT NULL,
	`mimeType` text(100) NOT NULL,
	`uploadedAt` integer NOT NULL,
	`processingStatus` text DEFAULT 'not_applicable' NOT NULL,
	`processingStartedAt` integer,
	`chunkCount` integer DEFAULT 0 NOT NULL,
	`textContent` text(50000),
	FOREIGN KEY (`applicationId`) REFERENCES `visa_application`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`applicantId`) REFERENCES `applicant`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`checklistItemId`) REFERENCES `checklist_item`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `uploaded_doc_app_id_idx` ON `uploaded_document` (`applicationId`);--> statement-breakpoint
CREATE INDEX `uploaded_doc_applicant_id_idx` ON `uploaded_document` (`applicantId`);--> statement-breakpoint
CREATE INDEX `uploaded_doc_checklist_item_idx` ON `uploaded_document` (`checklistItemId`);--> statement-breakpoint
CREATE INDEX `uploaded_doc_processing_status_idx` ON `uploaded_document` (`processingStatus`);--> statement-breakpoint
CREATE INDEX `uploaded_doc_uploaded_at_idx` ON `uploaded_document` (`uploadedAt`);--> statement-breakpoint
CREATE INDEX `uploaded_doc_app_applicant_idx` ON `uploaded_document` (`applicationId`,`applicantId`);--> statement-breakpoint
CREATE TABLE `chat_conversation` (
	`id` text PRIMARY KEY NOT NULL,
	`applicationId` text NOT NULL,
	`name` text(100) DEFAULT 'New chat' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`applicationId`) REFERENCES `visa_application`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_conv_app_id_idx` ON `chat_conversation` (`applicationId`);--> statement-breakpoint
CREATE TABLE `chat_message` (
	`id` text PRIMARY KEY NOT NULL,
	`applicationId` text NOT NULL,
	`conversationId` text,
	`role` text NOT NULL,
	`content` text(10000) NOT NULL,
	`thumbnailDataUrl` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`applicationId`) REFERENCES `visa_application`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversationId`) REFERENCES `chat_conversation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_msg_app_id_idx` ON `chat_message` (`applicationId`);--> statement-breakpoint
CREATE INDEX `chat_msg_conv_id_idx` ON `chat_message` (`conversationId`);--> statement-breakpoint
CREATE INDEX `chat_msg_created_at_idx` ON `chat_message` (`createdAt`);--> statement-breakpoint
CREATE TABLE `application_invitation` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`applicationId` text NOT NULL,
	`email` text(255) NOT NULL,
	`roleId` text NOT NULL,
	`isSystemRole` integer DEFAULT 1 NOT NULL,
	`token` text(255) NOT NULL,
	`invitedBy` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`acceptedAt` integer,
	`acceptedBy` text,
	FOREIGN KEY (`applicationId`) REFERENCES `visa_application`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invitedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`acceptedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `application_invitation_token_unique` ON `application_invitation` (`token`);--> statement-breakpoint
CREATE INDEX `app_invitation_app_id_idx` ON `application_invitation` (`applicationId`);--> statement-breakpoint
CREATE INDEX `app_invitation_email_idx` ON `application_invitation` (`email`);--> statement-breakpoint
CREATE INDEX `app_invitation_token_idx` ON `application_invitation` (`token`);--> statement-breakpoint
CREATE TABLE `application_membership` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`applicationId` text NOT NULL,
	`userId` text NOT NULL,
	`roleId` text NOT NULL,
	`isSystemRole` integer DEFAULT 1 NOT NULL,
	`invitedBy` text,
	`invitedAt` integer,
	`joinedAt` integer,
	`expiresAt` integer,
	`isActive` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`applicationId`) REFERENCES `visa_application`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invitedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `app_membership_app_id_idx` ON `application_membership` (`applicationId`);--> statement-breakpoint
CREATE INDEX `app_membership_user_id_idx` ON `application_membership` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_membership_unique_idx` ON `application_membership` (`applicationId`,`userId`);--> statement-breakpoint
CREATE TABLE `application_role` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`applicationId` text NOT NULL,
	`name` text(255) NOT NULL,
	`description` text(1000),
	`permissions` text NOT NULL,
	`metadata` text(5000),
	`isEditable` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`applicationId`) REFERENCES `visa_application`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `app_role_app_id_idx` ON `application_role` (`applicationId`);--> statement-breakpoint
CREATE INDEX `app_role_name_unique_idx` ON `application_role` (`applicationId`,`name`);--> statement-breakpoint
CREATE TABLE `support_message` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`ticketId` text NOT NULL,
	`userId` text NOT NULL,
	`content` text(5000) NOT NULL,
	`isAdminReply` integer DEFAULT false NOT NULL,
	`isSystemMessage` integer DEFAULT false NOT NULL,
	`screenshotUrls` text,
	FOREIGN KEY (`ticketId`) REFERENCES `support_ticket`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `support_message_ticket_id_idx` ON `support_message` (`ticketId`);--> statement-breakpoint
CREATE INDEX `support_message_user_id_idx` ON `support_message` (`userId`);--> statement-breakpoint
CREATE INDEX `support_message_created_at_idx` ON `support_message` (`createdAt`);--> statement-breakpoint
CREATE TABLE `support_ticket` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`userId` text,
	`subject` text(255) NOT NULL,
	`description` text(5000) NOT NULL,
	`category` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`screenshotUrls` text,
	`adminNote` text(2000),
	`resolvedAt` integer,
	`lastViewedAt` integer,
	`adminLastViewedAt` integer,
	`lastUpdatedAt` integer,
	`userAgent` text(500),
	`ipAddress` text(100),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `support_ticket_user_id_idx` ON `support_ticket` (`userId`);--> statement-breakpoint
CREATE INDEX `support_ticket_status_idx` ON `support_ticket` (`status`);--> statement-breakpoint
CREATE INDEX `support_ticket_category_idx` ON `support_ticket` (`category`);--> statement-breakpoint
CREATE INDEX `support_ticket_last_updated_at_idx` ON `support_ticket` (`lastUpdatedAt`);--> statement-breakpoint
CREATE INDEX `support_ticket_user_updated_idx` ON `support_ticket` (`userId`,`lastUpdatedAt`);--> statement-breakpoint
CREATE INDEX `support_ticket_status_category_idx` ON `support_ticket` (`status`,`category`);--> statement-breakpoint
CREATE TABLE `enterprise_inquiry` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`email` text(255) NOT NULL,
	`company` text(255) NOT NULL,
	`role` text(255),
	`teamSize` text(50),
	`monthlyVolume` text(50),
	`website` text(500),
	`message` text(3000),
	`status` text DEFAULT 'new' NOT NULL,
	`adminNote` text(2000)
);
--> statement-breakpoint
CREATE INDEX `enterprise_inquiry_email_idx` ON `enterprise_inquiry` (`email`);--> statement-breakpoint
CREATE INDEX `enterprise_inquiry_status_idx` ON `enterprise_inquiry` (`status`);