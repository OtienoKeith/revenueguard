CREATE TABLE `order_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`payment_ref` text NOT NULL,
	`idempotency_key` text,
	`amount_cents` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `simulation_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_order_executions_run_id` ON `order_executions` (`run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_order_executions_idempotency_key` ON `order_executions` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `simulation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`event_count` integer NOT NULL,
	`order_count` integer NOT NULL,
	`duplicates_blocked` integer DEFAULT 0 NOT NULL,
	`revenue_at_risk` integer DEFAULT 0 NOT NULL,
	`payment_ref` text NOT NULL,
	`event_ref` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhook_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`span` text NOT NULL,
	`outcome` text NOT NULL,
	`duration_ms` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `simulation_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_webhook_attempts_run_id` ON `webhook_attempts` (`run_id`);