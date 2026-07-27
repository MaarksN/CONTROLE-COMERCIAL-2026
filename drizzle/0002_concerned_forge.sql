CREATE TABLE `action_items` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`owner` text,
	`horizon` text DEFAULT 'h1' NOT NULL,
	`status` text DEFAULT 'pendente' NOT NULL,
	`source` text,
	`created_by` text,
	`updated_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `action_items_status_idx` ON `action_items` (`status`);--> statement-breakpoint
CREATE INDEX `action_items_horizon_idx` ON `action_items` (`horizon`);