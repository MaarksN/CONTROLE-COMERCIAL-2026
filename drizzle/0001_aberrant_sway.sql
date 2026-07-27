ALTER TABLE `commercial_deals` ADD `billed` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `commercial_deals` ADD `stage` text DEFAULT 'aberto' NOT NULL;--> statement-breakpoint
ALTER TABLE `commercial_deals` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `commercial_deals` ADD `created_by` text;--> statement-breakpoint
ALTER TABLE `commercial_deals` ADD `updated_by` text;--> statement-breakpoint
ALTER TABLE `commercial_deals` ADD `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE `commercial_deals` ADD `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
CREATE INDEX `commercial_deals_stage_idx` ON `commercial_deals` (`stage`);--> statement-breakpoint
CREATE INDEX `commercial_deals_owner_idx` ON `commercial_deals` (`owner`);--> statement-breakpoint
CREATE INDEX `commercial_deals_year_month_idx` ON `commercial_deals` (`year`,`month_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `monthly_metrics_year_month_unique` ON `monthly_metrics` (`year`,`month_number`);