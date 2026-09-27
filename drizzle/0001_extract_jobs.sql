CREATE TABLE `extract_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`schema_id` text NOT NULL,
	`status` text NOT NULL,
	`result_json` text DEFAULT '' NOT NULL,
	`error_code` text DEFAULT '' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_extract_jobs_owner` ON `extract_jobs` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `idx_extract_jobs_expires` ON `extract_jobs` (`expires_at`);
