CREATE TABLE `marketing_contact` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`email` text(255) NOT NULL,
	`resendContactId` text(255),
	`subscribedOnboarding` integer DEFAULT true NOT NULL,
	`subscribedPostPurchase` integer DEFAULT true NOT NULL,
	`subscribedWinback` integer DEFAULT true NOT NULL,
	`lastSyncedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_contact_user_unique_idx` ON `marketing_contact` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_contact_email_unique_idx` ON `marketing_contact` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_contact_resend_contact_unique_idx` ON `marketing_contact` (`resendContactId`);--> statement-breakpoint
CREATE TABLE `marketing_email_send` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`enrollmentId` text NOT NULL,
	`sequence` text NOT NULL,
	`stepKey` text(255) NOT NULL,
	`resendBroadcastId` text(255),
	`resendSegmentId` text(255),
	`status` text DEFAULT 'pending' NOT NULL,
	`sentAt` integer,
	FOREIGN KEY (`enrollmentId`) REFERENCES `marketing_sequence_enrollment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `marketing_send_enrollment_idx` ON `marketing_email_send` (`enrollmentId`);--> statement-breakpoint
CREATE INDEX `marketing_send_status_idx` ON `marketing_email_send` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_send_broadcast_unique_idx` ON `marketing_email_send` (`resendBroadcastId`);--> statement-breakpoint
CREATE TABLE `marketing_event` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`applicationId` text,
	`type` text NOT NULL,
	`payload` text,
	`occurredAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`applicationId`) REFERENCES `visa_application`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `marketing_event_user_idx` ON `marketing_event` (`userId`);--> statement-breakpoint
CREATE INDEX `marketing_event_application_idx` ON `marketing_event` (`applicationId`);--> statement-breakpoint
CREATE INDEX `marketing_event_type_idx` ON `marketing_event` (`type`);--> statement-breakpoint
CREATE INDEX `marketing_event_occurred_at_idx` ON `marketing_event` (`occurredAt`);--> statement-breakpoint
CREATE TABLE `marketing_sequence_enrollment` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`applicationId` text,
	`sequence` text NOT NULL,
	`stepKey` text(255) NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`enteredAt` integer NOT NULL,
	`nextSendAt` integer NOT NULL,
	`lastSentAt` integer,
	`completedAt` integer,
	`exitReason` text(255),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`applicationId`) REFERENCES `visa_application`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `marketing_enrollment_user_idx` ON `marketing_sequence_enrollment` (`userId`);--> statement-breakpoint
CREATE INDEX `marketing_enrollment_application_idx` ON `marketing_sequence_enrollment` (`applicationId`);--> statement-breakpoint
CREATE INDEX `marketing_enrollment_sequence_status_idx` ON `marketing_sequence_enrollment` (`sequence`,`status`);--> statement-breakpoint
CREATE INDEX `marketing_enrollment_next_send_idx` ON `marketing_sequence_enrollment` (`nextSendAt`);