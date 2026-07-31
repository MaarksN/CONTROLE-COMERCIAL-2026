CREATE TABLE `google_oauth_tokens` (
	`user_email` text PRIMARY KEY NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text,
	`expires_at` text NOT NULL,
	`scopes` text DEFAULT '' NOT NULL,
	`google_account_email` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `integration_sync_state` (
	`id` text PRIMARY KEY NOT NULL,
	`last_status` text DEFAULT 'ok' NOT NULL,
	`last_error` text,
	`last_attempt_at` text,
	`last_success_at` text
);
--> statement-breakpoint
ALTER TABLE `action_items` ADD `due_date` text;--> statement-breakpoint
ALTER TABLE `integration_settings` ADD `google_client_id` text;--> statement-breakpoint
ALTER TABLE `integration_settings` ADD `google_client_secret` text;