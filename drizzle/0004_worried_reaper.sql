CREATE TABLE `alert_state` (
	`key` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'aberto' NOT NULL,
	`justification` text,
	`actor_email` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
