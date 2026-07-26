CREATE TABLE `app_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`detail_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `commercial_deals` (
	`id` text PRIMARY KEY NOT NULL,
	`year` integer NOT NULL,
	`month_number` integer NOT NULL,
	`month` text NOT NULL,
	`owner` text NOT NULL,
	`company` text NOT NULL,
	`origin` text NOT NULL,
	`sold` real NOT NULL,
	`adjusted` real NOT NULL,
	`payload_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monthly_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`year` integer NOT NULL,
	`month_number` integer NOT NULL,
	`month` text NOT NULL,
	`target` real NOT NULL,
	`sold` real NOT NULL,
	`adjusted` real NOT NULL,
	`payload_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `objectives` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`owner` text NOT NULL,
	`progress` real NOT NULL,
	`payload_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`email` text PRIMARY KEY NOT NULL,
	`role` text DEFAULT 'Diretoria (leitura)' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workbook_rows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sheet_name` text NOT NULL,
	`row_number` integer NOT NULL,
	`data_json` text NOT NULL,
	`formula_json` text NOT NULL
);
