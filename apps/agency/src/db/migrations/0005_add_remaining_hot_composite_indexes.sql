CREATE INDEX `visa_app_user_trashed_created_idx` ON `visa_application` (`userId`,`trashedAt`,`createdAt`);--> statement-breakpoint
CREATE INDEX `checklist_item_app_applicant_sort_idx` ON `checklist_item` (`applicationId`,`applicantId`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `doc_eval_app_applicant_created_idx` ON `document_evaluation` (`applicationId`,`applicantId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `uploaded_doc_app_applicant_uploaded_idx` ON `uploaded_document` (`applicationId`,`applicantId`,`uploadedAt`);