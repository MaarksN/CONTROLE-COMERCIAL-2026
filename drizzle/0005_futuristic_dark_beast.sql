CREATE TABLE `integration_settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`bitrix_webhook_url` text,
	`apollo_api_key` text,
	`google_api_key` text,
	`ai_provider` text DEFAULT 'auto' NOT NULL,
	`openai_api_key` text,
	`anthropic_api_key` text,
	`updated_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
