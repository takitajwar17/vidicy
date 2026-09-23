DROP INDEX IF EXISTS `app_role_name_unique_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `app_role_name_unique_idx` ON `application_role` (`applicationId`,`name`);
