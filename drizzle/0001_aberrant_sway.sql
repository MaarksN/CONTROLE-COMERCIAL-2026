PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_commercial_deals` (
	`id` text PRIMARY KEY NOT NULL,
	`year` integer NOT NULL,
	`month_number` integer NOT NULL,
	`month` text NOT NULL,
	`owner` text NOT NULL,
	`company` text NOT NULL,
	`origin` text NOT NULL,
	`sold` real NOT NULL,
	`adjusted` real NOT NULL,
	`billed` real DEFAULT 0 NOT NULL,
	`stage` text DEFAULT 'aberto' NOT NULL,
	`notes` text,
	`created_by` text,
	`updated_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`payload_json` text NOT NULL
);--> statement-breakpoint
INSERT INTO `__new_commercial_deals` (
	`id`,
	`year`,
	`month_number`,
	`month`,
	`owner`,
	`company`,
	`origin`,
	`sold`,
	`adjusted`,
	`billed`,
	`stage`,
	`created_at`,
	`updated_at`,
	`payload_json`
)
SELECT
	`id`,
	`year`,
	`month_number`,
	`month`,
	`owner`,
	`company`,
	`origin`,
	`sold`,
	`adjusted`,
	0,
	'aberto',
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP,
	`payload_json`
FROM `commercial_deals`;--> statement-breakpoint
DROP TABLE `commercial_deals`;--> statement-breakpoint
ALTER TABLE `__new_commercial_deals` RENAME TO `commercial_deals`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `commercial_deals_stage_idx` ON `commercial_deals` (`stage`);--> statement-breakpoint
CREATE INDEX `commercial_deals_owner_idx` ON `commercial_deals` (`owner`);--> statement-breakpoint
CREATE INDEX `commercial_deals_year_month_idx` ON `commercial_deals` (`year`,`month_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `monthly_metrics_year_month_unique` ON `monthly_metrics` (`year`,`month_number`);
