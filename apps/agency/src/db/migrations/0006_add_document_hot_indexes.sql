CREATE INDEX `uploaded_doc_app_checklist_item_idx` ON `uploaded_document` (`applicationId`,`checklistItemId`);--> statement-breakpoint
CREATE INDEX `uploaded_doc_app_uploaded_idx` ON `uploaded_document` (`applicationId`,`uploadedAt`);--> statement-breakpoint
CREATE INDEX `doc_eval_app_created_idx` ON `document_evaluation` (`applicationId`,`createdAt`);
