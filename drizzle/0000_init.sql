CREATE TABLE `alternative` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`decision` text NOT NULL,
	`chosen` text NOT NULL,
	`options` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `alternative_project` ON `alternative` (`projectId`);--> statement-breakpoint
CREATE TABLE `annotation` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fileId` integer NOT NULL,
	`startLine` integer NOT NULL,
	`endLine` integer NOT NULL,
	`note` text NOT NULL,
	`category` text NOT NULL,
	`depth` text NOT NULL,
	FOREIGN KEY (`fileId`) REFERENCES `file`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `annotation_file_depth` ON `annotation` (`fileId`,`depth`);--> statement-breakpoint
CREATE TABLE `challenge` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`title` text NOT NULL,
	`spec` text NOT NULL,
	`skeleton` text NOT NULL,
	`hints` text NOT NULL,
	`hintsUsed` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`attempt` text,
	`review` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `challenge_project` ON `challenge` (`projectId`);--> statement-breakpoint
CREATE TABLE `checklist_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer,
	`title` text NOT NULL,
	`whyItMatters` text NOT NULL,
	`source` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_item_title_unique` ON `checklist_item` (`title`);--> statement-breakpoint
CREATE TABLE `concept` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`layer` text DEFAULT 'other' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `concept_name_unique` ON `concept` (`name`);--> statement-breakpoint
CREATE TABLE `file_import` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`fromFileId` integer NOT NULL,
	`toFileId` integer,
	`specifier` text NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fromFileId`) REFERENCES `file`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`toFileId`) REFERENCES `file`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `file_import_from` ON `file_import` (`fromFileId`);--> statement-breakpoint
CREATE INDEX `file_import_to` ON `file_import` (`toFileId`);--> statement-breakpoint
CREATE TABLE `file` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`path` text NOT NULL,
	`language` text NOT NULL,
	`layer` text NOT NULL,
	`levelId` integer,
	`size` integer NOT NULL,
	`lineCount` integer NOT NULL,
	`contentHash` text NOT NULL,
	`content` text NOT NULL,
	`isEntry` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`levelId`) REFERENCES `level`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_project_path` ON `file` (`projectId`,`path`);--> statement-breakpoint
CREATE INDEX `file_level` ON `file` (`levelId`);--> statement-breakpoint
CREATE TABLE `finding` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`levelId` integer,
	`fileId` integer,
	`line` integer,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`attackerView` text NOT NULL,
	`fix` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`levelId`) REFERENCES `level`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`fileId`) REFERENCES `file`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `finding_project` ON `finding` (`projectId`,`levelId`);--> statement-breakpoint
CREATE TABLE `git_commit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`idx` integer NOT NULL,
	`date` integer NOT NULL,
	`changedPaths` text NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `git_commit_project` ON `git_commit` (`projectId`,`idx`);--> statement-breakpoint
CREATE TABLE `learner_concept` (
	`conceptId` integer PRIMARY KEY NOT NULL,
	`mastery` real DEFAULT 0 NOT NULL,
	`hits` integer DEFAULT 0 NOT NULL,
	`misses` integer DEFAULT 0 NOT NULL,
	`note` text,
	`lastSeenAt` integer,
	FOREIGN KEY (`conceptId`) REFERENCES `concept`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `learning_event` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer,
	`kind` text NOT NULL,
	`detail` text NOT NULL,
	`processedAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `learning_event_pending` ON `learning_event` (`processedAt`);--> statement-breakpoint
CREATE TABLE `level` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`number` integer NOT NULL,
	`name` text NOT NULL,
	`goal` text NOT NULL,
	`checkpoint` text NOT NULL,
	`whyThisOrder` text NOT NULL,
	`evidence` text NOT NULL,
	`skipped` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`completedAt` integer,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `level_project_number` ON `level` (`projectId`,`number`);--> statement-breakpoint
CREATE TABLE `message` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`levelId` integer,
	`fileId` integer,
	`role` text NOT NULL,
	`kind` text DEFAULT 'chat' NOT NULL,
	`content` text NOT NULL,
	`provider` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`levelId`) REFERENCES `level`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`fileId`) REFERENCES `file`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `message_project` ON `message` (`projectId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `project` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`source` text NOT NULL,
	`sourceRef` text NOT NULL,
	`profile` text DEFAULT 'web' NOT NULL,
	`status` text DEFAULT 'ingesting' NOT NULL,
	`error` text,
	`summary` text,
	`analysis` text,
	`historySource` text DEFAULT 'none' NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `quiz_attempt` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`questionId` integer NOT NULL,
	`response` text NOT NULL,
	`wasCorrect` integer NOT NULL,
	`feedback` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`questionId`) REFERENCES `quiz_question`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `quiz_attempt_question` ON `quiz_attempt` (`questionId`);--> statement-breakpoint
CREATE TABLE `quiz_question` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quizId` integer NOT NULL,
	`idx` integer NOT NULL,
	`type` text NOT NULL,
	`prompt` text NOT NULL,
	`code` text,
	`filePath` text,
	`options` text,
	`correctAnswer` text NOT NULL,
	`explanation` text NOT NULL,
	`conceptId` integer,
	FOREIGN KEY (`quizId`) REFERENCES `quiz`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conceptId`) REFERENCES `concept`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `quiz_question_quiz` ON `quiz_question` (`quizId`,`idx`);--> statement-breakpoint
CREATE TABLE `quiz` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`levelId` integer,
	`depth` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`levelId`) REFERENCES `level`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `rebuild_attempt` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`levelId` integer NOT NULL,
	`spec` text NOT NULL,
	`submittedFiles` text,
	`review` text,
	`status` text DEFAULT 'spec' NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`levelId`) REFERENCES `level`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rebuild_level` ON `rebuild_attempt` (`levelId`);--> statement-breakpoint
CREATE TABLE `redaction` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`fileId` integer NOT NULL,
	`line` integer NOT NULL,
	`kind` text NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fileId`) REFERENCES `file`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `redaction_project` ON `redaction` (`projectId`);--> statement-breakpoint
CREATE TABLE `setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
