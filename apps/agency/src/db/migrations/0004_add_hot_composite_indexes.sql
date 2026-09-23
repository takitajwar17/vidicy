CREATE INDEX `visa_app_user_created_idx` ON `visa_application` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `payment_event_app_type_status_created_idx` ON `payment_event` (`applicationId`,`type`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `applicant_app_created_idx` ON `applicant` (`applicationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `chat_conv_app_updated_idx` ON `chat_conversation` (`applicationId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `chat_msg_conv_created_idx` ON `chat_message` (`conversationId`,`createdAt`);