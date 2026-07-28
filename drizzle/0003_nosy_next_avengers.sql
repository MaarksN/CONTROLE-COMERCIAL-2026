CREATE TABLE `seller_growth_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`year` integer NOT NULL,
	`month_number` integer NOT NULL,
	`month` text NOT NULL,
	`entry_target` real DEFAULT 0 NOT NULL,
	`realized_target` real DEFAULT 0 NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seller_growth_targets_owner_year_month_unique` ON `seller_growth_targets` (`owner`,`year`,`month_number`);--> statement-breakpoint
CREATE INDEX `seller_growth_targets_owner_idx` ON `seller_growth_targets` (`owner`);