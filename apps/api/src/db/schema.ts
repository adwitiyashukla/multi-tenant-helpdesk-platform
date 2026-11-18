import { sql } from 'drizzle-orm';
import {
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const roleEnum = pgEnum('role', ['owner', 'admin', 'agent']);
export const conversationStatusEnum = pgEnum('conversation_status', [
  'open',
  'pending',
  'snoozed',
  'closed',
]);
export const priorityEnum = pgEnum('priority', ['low', 'normal', 'high', 'urgent']);
export const messageKindEnum = pgEnum('message_kind', ['inbound', 'reply', 'note']);
export const planEnum = pgEnum('plan', ['free', 'pro']);
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'none',
  'active',
  'past_due',
  'canceled',
]);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    plan: planEnum('plan').notNull().default('free'),
    seatLimit: integer('seat_limit').notNull().default(3),
    conversationSeq: integer('conversation_seq').notNull().default(0),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    subscriptionStatus: subscriptionStatusEnum('subscription_status').notNull().default('none'),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('organizations_slug_key').on(t.slug)],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_key').on(t.email)],
);

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull().default('agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('memberships_org_user_key').on(t.organizationId, t.userId),
    index('memberships_user_idx').on(t.userId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sessions_token_key').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
);

export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: roleEnum('role').notNull().default('agent'),
    tokenHash: text('token_hash').notNull(),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('invites_token_key').on(t.tokenHash),
    index('invites_org_idx').on(t.organizationId, t.email),
  ],
);

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('customers_org_email_key').on(t.organizationId, t.email)],
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    reference: integer('reference').notNull(),
    subject: text('subject').notNull(),
    status: conversationStatusEnum('status').notNull().default('open'),
    priority: priorityEnum('priority').notNull().default('normal'),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    snippet: text('snippet').notNull().default(''),
    messageCount: integer('message_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
    firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    slaDueAt: timestamp('sla_due_at', { withTimezone: true }),
    slaBreachedAt: timestamp('sla_breached_at', { withTimezone: true }),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
    searchVector: tsvector('search_vector').generatedAlwaysAs(sql`to_tsvector('english', subject)`),
  },
  (t) => [
    uniqueIndex('conversations_org_reference_key').on(t.organizationId, t.reference),
    index('conversations_recent_idx').on(
      t.organizationId,
      t.lastMessageAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index('conversations_inbox_idx').on(
      t.organizationId,
      t.status,
      t.lastMessageAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index('conversations_assignee_idx').on(t.organizationId, t.assigneeId, t.status),
    index('conversations_sla_idx').on(t.slaDueAt).where(sql`sla_breached_at is null`),
    index('conversations_customer_idx').on(t.customerId),
    index('conversations_search_idx').using('gin', t.searchVector),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    kind: messageKindEnum('kind').notNull(),
    body: text('body').notNull(),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    externalId: text('external_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    searchVector: tsvector('search_vector').generatedAlwaysAs(sql`to_tsvector('english', body)`),
  },
  (t) => [
    index('messages_conversation_idx').on(t.conversationId, t.createdAt),
    index('messages_search_idx').using('gin', t.searchVector),
    uniqueIndex('messages_external_key')
      .on(t.organizationId, t.externalId)
      .where(sql`external_id is not null`),
  ],
);

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'cascade',
    }),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'cascade' }),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    storageKey: text('storage_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('attachments_message_idx').on(t.messageId)],
);

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('slate'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tags_org_name_key').on(t.organizationId, t.name)],
);

export const conversationTags = pgTable(
  'conversation_tags',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.tagId] }),
    index('conversation_tags_tag_idx').on(t.tagId),
  ],
);

export const cannedReplies = pgTable(
  'canned_replies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('canned_replies_org_idx').on(t.organizationId, t.title)],
);

export const pushTokens = pgTable(
  'push_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    platform: text('platform').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('push_tokens_token_key').on(t.token)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_org_idx').on(t.organizationId, t.createdAt.desc())],
);
