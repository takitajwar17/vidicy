CREATE TABLE `agency_client` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`email` text(255),
	`phone` text(100),
	`companyName` text(255),
	`country` text(100),
	`notes` text(2000)
);
--> statement-breakpoint
CREATE INDEX `agency_client_name_idx` ON `agency_client` (`name`);--> statement-breakpoint
CREATE INDEX `agency_client_email_idx` ON `agency_client` (`email`);--> statement-breakpoint
CREATE TABLE `agency_team_invitation` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`email` text(255) NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`token` text(255) NOT NULL,
	`invitedBy` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`acceptedAt` integer,
	`acceptedBy` text,
	FOREIGN KEY (`invitedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`acceptedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agency_team_invitation_token_unique` ON `agency_team_invitation` (`token`);--> statement-breakpoint
CREATE INDEX `agency_team_invitation_email_idx` ON `agency_team_invitation` (`email`);--> statement-breakpoint
CREATE INDEX `agency_team_invitation_token_idx` ON `agency_team_invitation` (`token`);--> statement-breakpoint
CREATE TABLE `agency_team_member` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`invitedBy` text,
	`invitedAt` integer,
	`joinedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invitedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agency_team_member_user_unique_idx` ON `agency_team_member` (`userId`);--> statement-breakpoint
CREATE INDEX `agency_team_member_role_idx` ON `agency_team_member` (`role`);--> statement-breakpoint
CREATE INDEX `agency_team_member_status_idx` ON `agency_team_member` (`status`);--> statement-breakpoint
CREATE TABLE `client_report` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`applicationId` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`summary` text(4000) NOT NULL,
	`actionItems` text NOT NULL,
	`createdById` text,
	`sentAt` integer,
	FOREIGN KEY (`applicationId`) REFERENCES `visa_application`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`createdById`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `client_report_app_id_idx` ON `client_report` (`applicationId`);--> statement-breakpoint
CREATE INDEX `client_report_status_idx` ON `client_report` (`status`);--> statement-breakpoint
CREATE TABLE `review_issue` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`applicationId` text NOT NULL,
	`applicantId` text,
	`checklistItemId` text,
	`documentId` text,
	`title` text(255) NOT NULL,
	`description` text(2000) NOT NULL,
	`recommendation` text(2000),
	`category` text(100) DEFAULT 'document' NOT NULL,
	`severity` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`source` text DEFAULT 'reviewer' NOT NULL,
	`confidence` integer,
	`clientVisible` integer DEFAULT true NOT NULL,
	`assignedToId` text,
	`createdById` text,
	`resolvedAt` integer,
	FOREIGN KEY (`applicationId`) REFERENCES `visa_application`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`applicantId`) REFERENCES `applicant`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`checklistItemId`) REFERENCES `checklist_item`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`documentId`) REFERENCES `uploaded_document`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assignedToId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`createdById`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `review_issue_app_id_idx` ON `review_issue` (`applicationId`);--> statement-breakpoint
CREATE INDEX `review_issue_app_status_idx` ON `review_issue` (`applicationId`,`status`);--> statement-breakpoint
CREATE INDEX `review_issue_app_severity_idx` ON `review_issue` (`applicationId`,`severity`);--> statement-breakpoint
CREATE INDEX `review_issue_assigned_to_idx` ON `review_issue` (`assignedToId`);--> statement-breakpoint
CREATE INDEX `review_issue_checklist_item_idx` ON `review_issue` (`checklistItemId`);--> statement-breakpoint
ALTER TABLE `visa_application` ADD `caseNumber` text(40);--> statement-breakpoint
ALTER TABLE `visa_application` ADD `clientId` text(255);--> statement-breakpoint
ALTER TABLE `visa_application` ADD `clientName` text(255);--> statement-breakpoint
ALTER TABLE `visa_application` ADD `clientEmail` text(255);--> statement-breakpoint
ALTER TABLE `visa_application` ADD `clientPhone` text(100);--> statement-breakpoint
ALTER TABLE `visa_application` ADD `agencyStatus` text DEFAULT 'intake' NOT NULL;--> statement-breakpoint
ALTER TABLE `visa_application` ADD `priority` text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE `visa_application` ADD `assignedReviewerId` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `visa_application` ADD `intakeSource` text(80) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `visa_application` ADD `submittedAt` integer;--> statement-breakpoint
ALTER TABLE `visa_application` ADD `dueAt` integer;--> statement-breakpoint
ALTER TABLE `visa_application` ADD `reviewCompletedAt` integer;--> statement-breakpoint
ALTER TABLE `visa_application` ADD `finalSubmissionAt` integer;--> statement-breakpoint
ALTER TABLE `visa_application` ADD `clientReportStatus` text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `visa_application_caseNumber_unique` ON `visa_application` (`caseNumber`);--> statement-breakpoint
CREATE INDEX `visa_app_agency_status_idx` ON `visa_application` (`agencyStatus`);--> statement-breakpoint
CREATE INDEX `visa_app_case_number_idx` ON `visa_application` (`caseNumber`);--> statement-breakpoint
CREATE INDEX `visa_app_client_id_idx` ON `visa_application` (`clientId`);--> statement-breakpoint
CREATE INDEX `visa_app_assigned_reviewer_idx` ON `visa_application` (`assignedReviewerId`);--> statement-breakpoint
CREATE INDEX `visa_app_priority_idx` ON `visa_application` (`priority`);--> statement-breakpoint
CREATE INDEX `visa_app_status_created_idx` ON `visa_application` (`agencyStatus`,`createdAt`);