DROP INDEX "conversations_recent_idx";--> statement-breakpoint
DROP INDEX "conversations_inbox_idx";--> statement-breakpoint
CREATE INDEX "conversations_recent_idx" ON "conversations" USING btree ("organization_id","last_message_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "conversations_inbox_idx" ON "conversations" USING btree ("organization_id","status","last_message_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);