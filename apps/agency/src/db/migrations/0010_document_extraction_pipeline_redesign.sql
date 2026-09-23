ALTER TABLE `uploaded_document` ADD `extractionStatus` text DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE `uploaded_document` ADD `indexingStatus` text DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE `uploaded_document` ADD `extractionMethod` text(100);--> statement-breakpoint
ALTER TABLE `uploaded_document` ADD `extractedAt` integer;--> statement-breakpoint
ALTER TABLE `uploaded_document` ADD `indexingAttemptedAt` integer;--> statement-breakpoint
ALTER TABLE `uploaded_document` ADD `pageCount` integer;--> statement-breakpoint
ALTER TABLE `uploaded_document` ADD `imageDescription` text(2000);--> statement-breakpoint
ALTER TABLE `uploaded_document` ADD `extractionPayload` text;--> statement-breakpoint
UPDATE `uploaded_document`
SET
  `extractionStatus` = CASE
    WHEN `textContent` IS NOT NULL AND `textContent` <> '' THEN 'completed'
    WHEN `processingStatus` = 'completed' THEN 'completed'
    WHEN `processingStatus` = 'failed' THEN 'failed'
    WHEN `processingStatus` = 'pending' THEN 'queued'
    WHEN `processingStatus` = 'not_applicable' AND LOWER(`mimeType`) IN ('application/pdf', 'image/jpeg', 'image/jpg', 'image/png') THEN 'queued'
    ELSE 'skipped'
  END,
  `indexingStatus` = CASE
    WHEN `chunkCount` > 0 THEN 'completed'
    WHEN `processingStatus` = 'completed' THEN 'completed'
    WHEN `processingStatus` = 'failed' THEN 'failed'
    WHEN `processingStatus` = 'pending' THEN 'queued'
    WHEN `processingStatus` = 'not_applicable' AND LOWER(`mimeType`) IN ('application/pdf', 'image/jpeg', 'image/jpg', 'image/png') THEN 'queued'
    ELSE 'skipped'
  END,
  `extractedAt` = CASE
    WHEN `textContent` IS NOT NULL AND `textContent` <> '' THEN `uploadedAt`
    ELSE NULL
  END,
  `indexingAttemptedAt` = CASE
    WHEN `processingStatus` IN ('completed', 'failed') OR `chunkCount` > 0 THEN `uploadedAt`
    ELSE NULL
  END
;--> statement-breakpoint
CREATE INDEX `uploaded_doc_extraction_status_idx` ON `uploaded_document` (`extractionStatus`);--> statement-breakpoint
CREATE INDEX `uploaded_doc_indexing_status_idx` ON `uploaded_document` (`indexingStatus`);
