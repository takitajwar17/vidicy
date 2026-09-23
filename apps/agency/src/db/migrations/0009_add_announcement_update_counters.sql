ALTER TABLE `announcement_post` ADD COLUMN `updateCounter` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `announcement_poll_option` ADD COLUMN `updateCounter` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `announcement_poll_vote` ADD COLUMN `updateCounter` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `announcement_upvote` ADD COLUMN `updateCounter` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `announcement_comment` ADD COLUMN `updateCounter` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `announcement_read` ADD COLUMN `updateCounter` integer DEFAULT 0;
