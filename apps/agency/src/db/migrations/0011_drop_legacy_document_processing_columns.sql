DROP INDEX `uploaded_doc_processing_status_idx`;--> statement-breakpoint
ALTER TABLE `uploaded_document` DROP COLUMN `processingStatus`;--> statement-breakpoint
ALTER TABLE `uploaded_document` DROP COLUMN `processingStartedAt`;