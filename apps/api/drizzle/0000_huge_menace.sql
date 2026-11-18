CREATE TYPE "public"."conversation_status" AS ENUM('open', 'pending', 'snoozed', 'closed');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('inbound', 'reply', 'note');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'admin', 'agent');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('none', 'active', 'past_due', 'canceled');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid,
	"message_id" uuid,
	"uploaded_by" uuid,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canned_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_tags" (
	"conversation_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "conversation_tags_conversation_id_tag_id_pk" PRIMARY KEY("conversation_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"reference" integer NOT NULL,
	"subject" text NOT NULL,
	"status" "conversation_status" DEFAULT 'open' NOT NULL,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"customer_id" uuid NOT NULL,
	"assignee_id" uuid,
	"snippet" text DEFAULT '' NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_response_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"sla_due_at" timestamp with time zone,
	"sla_breached_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', subject)) STORED
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "role" DEFAULT 'agent' NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" DEFAULT 'agent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"kind" "message_kind" NOT NULL,
	"body" text NOT NULL,
	"author_id" uuid,
	"customer_id" uuid,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', body)) STORED
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"seat_limit" integer DEFAULT 3 NOT NULL,
	"conversation_seq" integer DEFAULT 0 NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_status" "subscription_status" DEFAULT 'none' NOT NULL,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'slate' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canned_replies" ADD CONSTRAINT "canned_replies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canned_replies" ADD CONSTRAINT "canned_replies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_tags" ADD CONSTRAINT "conversation_tags_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_tags" ADD CONSTRAINT "conversation_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_message_idx" ON "attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "audit_log_org_idx" ON "audit_log" USING btree ("organization_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "canned_replies_org_idx" ON "canned_replies" USING btree ("organization_id","title");--> statement-breakpoint
CREATE INDEX "conversation_tags_tag_idx" ON "conversation_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_org_reference_key" ON "conversations" USING btree ("organization_id","reference");--> statement-breakpoint
CREATE INDEX "conversations_inbox_idx" ON "conversations" USING btree ("organization_id","status","last_message_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "conversations_assignee_idx" ON "conversations" USING btree ("organization_id","assignee_id","status");--> statement-breakpoint
CREATE INDEX "conversations_sla_idx" ON "conversations" USING btree ("sla_due_at") WHERE sla_breached_at is null;--> statement-breakpoint
CREATE INDEX "conversations_customer_idx" ON "conversations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "conversations_search_idx" ON "conversations" USING gin ("search_vector");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_org_email_key" ON "customers" USING btree ("organization_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_token_key" ON "invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invites_org_idx" ON "invites" USING btree ("organization_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_org_user_key" ON "memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_search_idx" ON "messages" USING gin ("search_vector");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_external_key" ON "messages" USING btree ("organization_id","external_id") WHERE external_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_org_name_key" ON "tags" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");