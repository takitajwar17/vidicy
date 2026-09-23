ALTER TABLE `announcement_post` ADD COLUMN `attachments` text;
--> statement-breakpoint
ALTER TABLE `announcement_post` ADD COLUMN `ctaLabel` text(80);
--> statement-breakpoint
ALTER TABLE `announcement_post` ADD COLUMN `ctaUrl` text(2048);
--> statement-breakpoint
ALTER TABLE `announcement_post` ADD COLUMN `embedTitle` text(120);
--> statement-breakpoint
ALTER TABLE `announcement_post` ADD COLUMN `embedUrl` text(2048);
