ALTER TABLE `user` ADD `stripeCustomerId` text(255);--> statement-breakpoint
CREATE UNIQUE INDEX `user_stripeCustomerId_unique` ON `user` (`stripeCustomerId`);