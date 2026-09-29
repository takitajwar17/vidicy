DROP TABLE `payment_event`;--> statement-breakpoint
DROP TABLE `agency_team_invitation`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agency_team_member` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`userId` text,
	`email` text(255),
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`invitedBy` text,
	`invitedAt` integer,
	`joinedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`invitedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_agency_team_member`("createdAt", "updatedAt", "updateCounter", "id", "userId", "email", "role", "status", "invitedBy", "invitedAt", "joinedAt")
SELECT `agency_team_member`.`createdAt`, `agency_team_member`.`updatedAt`, `agency_team_member`.`updateCounter`, `agency_team_member`.`id`, `agency_team_member`.`userId`, lower(`user`.`email`), `agency_team_member`.`role`, `agency_team_member`.`status`, `agency_team_member`.`invitedBy`, `agency_team_member`.`invitedAt`, `agency_team_member`.`joinedAt`
FROM `agency_team_member`
LEFT JOIN `user` ON `agency_team_member`.`userId` = `user`.`id`;--> statement-breakpoint
DROP TABLE `agency_team_member`;
ALTER TABLE `__new_agency_team_member` RENAME TO `agency_team_member`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `agency_team_member_user_unique_idx` ON `agency_team_member` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `agency_team_member_email_unique_idx` ON `agency_team_member` (`email`);--> statement-breakpoint
CREATE INDEX `agency_team_member_email_idx` ON `agency_team_member` (`email`);--> statement-breakpoint
CREATE INDEX `agency_team_member_role_idx` ON `agency_team_member` (`role`);--> statement-breakpoint
CREATE INDEX `agency_team_member_status_idx` ON `agency_team_member` (`status`);--> statement-breakpoint
DROP INDEX `user_stripeCustomerId_unique`;--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `stripeCustomerId`;--> statement-breakpoint
ALTER TABLE `visa_application` DROP COLUMN `paymentStatus`;--> statement-breakpoint
ALTER TABLE `visa_application` DROP COLUMN `stripePaymentIntentId`;--> statement-breakpoint
ALTER TABLE `visa_application` DROP COLUMN `plan`;--> statement-breakpoint
ALTER TABLE `visa_application` DROP COLUMN `paidApplicantCount`;--> statement-breakpoint
ALTER TABLE `visa_application` DROP COLUMN `isFreeTrialApp`;--> statement-breakpoint
ALTER TABLE `visa_application` DROP COLUMN `freeEvaluationUsed`;
