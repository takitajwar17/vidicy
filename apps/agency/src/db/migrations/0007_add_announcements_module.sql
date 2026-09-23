CREATE TABLE `announcement_post` (
  `createdAt` integer DEFAULT (unixepoch()) NOT NULL,
  `updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
  `id` text PRIMARY KEY NOT NULL,
  `authorId` text NOT NULL,
  `title` text(255) NOT NULL,
  `body` text(20000) NOT NULL,
  `type` text NOT NULL,
  `priority` text DEFAULT 'normal' NOT NULL,
  `pinned` integer DEFAULT false NOT NULL,
  `commentsEnabled` integer DEFAULT true NOT NULL,
  `pollSingleChoice` integer DEFAULT true NOT NULL,
  `pollNamedVotes` integer DEFAULT true NOT NULL,
  `pollAllowVoteChange` integer DEFAULT true NOT NULL,
  `pollCloseAt` integer,
  `emailNotificationSent` integer DEFAULT false NOT NULL,
  `publishedAt` integer NOT NULL,
  FOREIGN KEY (`authorId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `announcement_poll_option` (
  `createdAt` integer DEFAULT (unixepoch()) NOT NULL,
  `updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
  `id` text PRIMARY KEY NOT NULL,
  `postId` text NOT NULL,
  `label` text(255) NOT NULL,
  `sortOrder` integer DEFAULT 0 NOT NULL,
  FOREIGN KEY (`postId`) REFERENCES `announcement_post`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `announcement_poll_vote` (
  `createdAt` integer DEFAULT (unixepoch()) NOT NULL,
  `updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
  `id` text PRIMARY KEY NOT NULL,
  `postId` text NOT NULL,
  `optionId` text NOT NULL,
  `userId` text NOT NULL,
  FOREIGN KEY (`postId`) REFERENCES `announcement_post`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`optionId`) REFERENCES `announcement_poll_option`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `announcement_upvote` (
  `createdAt` integer DEFAULT (unixepoch()) NOT NULL,
  `updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
  `id` text PRIMARY KEY NOT NULL,
  `postId` text NOT NULL,
  `userId` text NOT NULL,
  FOREIGN KEY (`postId`) REFERENCES `announcement_post`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `announcement_comment` (
  `createdAt` integer DEFAULT (unixepoch()) NOT NULL,
  `updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
  `id` text PRIMARY KEY NOT NULL,
  `postId` text NOT NULL,
  `userId` text NOT NULL,
  `parentId` text,
  `body` text(5000) NOT NULL,
  FOREIGN KEY (`postId`) REFERENCES `announcement_post`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`parentId`) REFERENCES `announcement_comment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `announcement_read` (
  `createdAt` integer DEFAULT (unixepoch()) NOT NULL,
  `updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
  `id` text PRIMARY KEY NOT NULL,
  `postId` text NOT NULL,
  `userId` text NOT NULL,
  `readAt` integer NOT NULL,
  FOREIGN KEY (`postId`) REFERENCES `announcement_post`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `announcement_post_author_idx` ON `announcement_post` (`authorId`);
--> statement-breakpoint
CREATE INDEX `announcement_post_type_idx` ON `announcement_post` (`type`);
--> statement-breakpoint
CREATE INDEX `announcement_post_priority_idx` ON `announcement_post` (`priority`);
--> statement-breakpoint
CREATE INDEX `announcement_post_pinned_idx` ON `announcement_post` (`pinned`);
--> statement-breakpoint
CREATE INDEX `announcement_post_published_idx` ON `announcement_post` (`publishedAt`);
--> statement-breakpoint
CREATE INDEX `announcement_poll_option_post_idx` ON `announcement_poll_option` (`postId`);
--> statement-breakpoint
CREATE UNIQUE INDEX `announcement_poll_vote_unique_user_post_option` ON `announcement_poll_vote` (`postId`,`userId`,`optionId`);
--> statement-breakpoint
CREATE INDEX `announcement_poll_vote_post_idx` ON `announcement_poll_vote` (`postId`);
--> statement-breakpoint
CREATE INDEX `announcement_poll_vote_user_idx` ON `announcement_poll_vote` (`userId`);
--> statement-breakpoint
CREATE UNIQUE INDEX `announcement_upvote_unique_user_post` ON `announcement_upvote` (`postId`,`userId`);
--> statement-breakpoint
CREATE INDEX `announcement_upvote_post_idx` ON `announcement_upvote` (`postId`);
--> statement-breakpoint
CREATE INDEX `announcement_comment_post_idx` ON `announcement_comment` (`postId`);
--> statement-breakpoint
CREATE INDEX `announcement_comment_parent_idx` ON `announcement_comment` (`parentId`);
--> statement-breakpoint
CREATE INDEX `announcement_comment_user_idx` ON `announcement_comment` (`userId`);
--> statement-breakpoint
CREATE UNIQUE INDEX `announcement_read_unique_user_post` ON `announcement_read` (`postId`,`userId`);
--> statement-breakpoint
CREATE INDEX `announcement_read_user_idx` ON `announcement_read` (`userId`);
