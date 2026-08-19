CREATE TABLE `ai_diagnoses` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`model` text NOT NULL,
	`interaction_id` text NOT NULL,
	`verdict` text NOT NULL,
	`headline` text NOT NULL,
	`root_cause` text NOT NULL,
	`evidence_json` text NOT NULL,
	`recommended_fix` text NOT NULL,
	`next_test` text NOT NULL,
	`confidence` integer NOT NULL,
	`latency_ms` integer NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `simulation_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ai_diagnoses_run_id` ON `ai_diagnoses` (`run_id`);