import type {
  Conversation,
  ConversationQuery,
  CreateConversationInput,
  CreateMessageInput,
  Message,
  UpdateConversationInput,
} from '@helpdesk/contracts';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { decodeCursor, encodeCursor } from '../lib/cursor.js';
import { notFound } from '../lib/errors.js';
import { firstResponseDueAt } from './sla.js';

type ConversationRow = typeof schema.conversations.$inferSelect;
type CustomerRow = typeof schema.customers.$inferSelect;

const snippetOf = (body: string) => body.replace(/\s+/g, ' ').trim().slice(0, 160);

const baseColumns = {
  conversation: schema.conversations,
  customerId: schema.customers.id,
  customerName: schema.customers.name,
  customerEmail: schema.customers.email,
  assigneeId: schema.users.id,
  assigneeName: schema.users.name,
};

type BaseRow = {
  conversation: ConversationRow;
  customerId: string;
  customerName: string | null;
  customerEmail: string;
  assigneeId: string | null;
  assigneeName: string | null;
};

function serialize(row: BaseRow, tags: string[]): Conversation {
  const c = row.conversation;
  return {
    id: c.id,
    reference: c.reference,
    subject: c.subject,
    status: c.status,
    priority: c.priority,
    customer: { id: row.customerId, name: row.customerName, email: row.customerEmail },
    assignee:
      row.assigneeId && row.assigneeName ? { id: row.assigneeId, name: row.assigneeName } : null,
    tags,
    messageCount: c.messageCount,
    snippet: c.snippet,
    createdAt: c.createdAt.toISOString(),
    lastMessageAt: c.lastMessageAt.toISOString(),
    firstResponseAt: c.firstResponseAt?.toISOString() ?? null,
    resolvedAt: c.resolvedAt?.toISOString() ?? null,
    slaDueAt: c.slaDueAt?.toISOString() ?? null,
    slaBreachedAt: c.slaBreachedAt?.toISOString() ?? null,
    snoozedUntil: c.snoozedUntil?.toISOString() ?? null,
  };
}

async function tagsFor(conversationIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (conversationIds.length === 0) {
    return map;
  }
  const rows = await db
    .select({ conversationId: schema.conversationTags.conversationId, name: schema.tags.name })
    .from(schema.conversationTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.conversationTags.tagId))
    .where(inArray(schema.conversationTags.conversationId, conversationIds));
  for (const row of rows) {
    const list = map.get(row.conversationId) ?? [];
    list.push(row.name);
    map.set(row.conversationId, list);
  }
  return map;
}

export async function listConversations(
  organizationId: string,
  viewerId: string,
  query: ConversationQuery,
) {
  const filters = [eq(schema.conversations.organizationId, organizationId)];

  if (query.status) {
    filters.push(eq(schema.conversations.status, query.status));
  }
  if (query.priority) {
    filters.push(eq(schema.conversations.priority, query.priority));
  }
  if (query.assignee === 'me') {
    filters.push(eq(schema.conversations.assigneeId, viewerId));
  } else if (query.assignee === 'none') {
    filters.push(isNull(schema.conversations.assigneeId));
  } else if (query.assignee) {
    filters.push(eq(schema.conversations.assigneeId, query.assignee));
  }
  if (query.breached) {
    filters.push(sql`${schema.conversations.slaBreachedAt} is not null`);
  }
  if (query.tag) {
    filters.push(
      sql`exists (select 1 from ${schema.conversationTags}
        inner join ${schema.tags} on ${schema.tags.id} = ${schema.conversationTags.tagId}
        where ${schema.conversationTags.conversationId} = ${schema.conversations.id}
          and ${schema.tags.name} = ${query.tag})`,
    );
  }
  if (query.q) {
    filters.push(
      sql`${schema.conversations.id} in (
        select ${schema.conversations.id} from ${schema.conversations}
          where ${schema.conversations.organizationId} = ${organizationId}
            and ${schema.conversations.searchVector} @@ plainto_tsquery('english', ${query.q})
        union
        select ${schema.messages.conversationId} from ${schema.messages}
          where ${schema.messages.organizationId} = ${organizationId}
            and ${schema.messages.searchVector} @@ plainto_tsquery('english', ${query.q})
      )`,
    );
  }
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    filters.push(
      sql`(${schema.conversations.lastMessageAt}, ${schema.conversations.id}) < (${cursor.timestamp}::timestamptz, ${cursor.id}::uuid)`,
    );
  }

  const rows = await db
    .select(baseColumns)
    .from(schema.conversations)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.conversations.customerId))
    .leftJoin(schema.users, eq(schema.users.id, schema.conversations.assigneeId))
    .where(and(...filters))
    .orderBy(desc(schema.conversations.lastMessageAt), desc(schema.conversations.id))
    .limit(query.limit + 1);

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const tagMap = await tagsFor(page.map((row) => row.conversation.id));
  const last = page.at(-1);

  return {
    items: page.map((row) => serialize(row, tagMap.get(row.conversation.id) ?? [])),
    nextCursor:
      hasMore && last
        ? encodeCursor({
            timestamp: last.conversation.lastMessageAt.toISOString(),
            id: last.conversation.id,
          })
        : null,
  };
}

export async function getConversation(
  organizationId: string,
  conversationId: string,
): Promise<Conversation> {
  const [row] = await db
    .select(baseColumns)
    .from(schema.conversations)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.conversations.customerId))
    .leftJoin(schema.users, eq(schema.users.id, schema.conversations.assigneeId))
    .where(
      and(
        eq(schema.conversations.organizationId, organizationId),
        eq(schema.conversations.id, conversationId),
      ),
    )
    .limit(1);

  if (!row) {
    throw notFound('conversation not found');
  }
  const tagMap = await tagsFor([conversationId]);
  return serialize(row, tagMap.get(conversationId) ?? []);
}

async function upsertCustomer(organizationId: string, email: string, name?: string | null) {
  const normalized = email.trim().toLowerCase();
  const [row] = await db
    .insert(schema.customers)
    .values({ organizationId, email: normalized, name: name ?? null })
    .onConflictDoUpdate({
      target: [schema.customers.organizationId, schema.customers.email],
      set: { name: sql`coalesce(${schema.customers.name}, excluded.name)` },
    })
    .returning();
  return row as CustomerRow;
}

export async function createConversation(
  organizationId: string,
  input: CreateConversationInput & { externalId?: string },
) {
  const customer = await upsertCustomer(organizationId, input.customerEmail, input.customerName);
  const now = new Date();

  const conversationId = await db.transaction(async (tx) => {
    const [org] = await tx
      .update(schema.organizations)
      .set({ conversationSeq: sql`${schema.organizations.conversationSeq} + 1` })
      .where(eq(schema.organizations.id, organizationId))
      .returning({ reference: schema.organizations.conversationSeq });

    const [conversation] = await tx
      .insert(schema.conversations)
      .values({
        organizationId,
        reference: org!.reference,
        subject: input.subject,
        priority: input.priority,
        customerId: customer.id,
        snippet: snippetOf(input.body),
        messageCount: 1,
        createdAt: now,
        lastMessageAt: now,
        slaDueAt: firstResponseDueAt(input.priority, now),
      })
      .returning({ id: schema.conversations.id });

    await tx.insert(schema.messages).values({
      organizationId,
      conversationId: conversation!.id,
      kind: 'inbound',
      body: input.body,
      customerId: customer.id,
      externalId: input.externalId ?? null,
      createdAt: now,
    });

    return conversation!.id;
  });

  return getConversation(organizationId, conversationId);
}

export async function listMessages(
  organizationId: string,
  conversationId: string,
): Promise<Message[]> {
  const rows = await db
    .select({
      message: schema.messages,
      authorId: schema.users.id,
      authorName: schema.users.name,
      customerId: schema.customers.id,
      customerName: schema.customers.name,
      customerEmail: schema.customers.email,
    })
    .from(schema.messages)
    .leftJoin(schema.users, eq(schema.users.id, schema.messages.authorId))
    .leftJoin(schema.customers, eq(schema.customers.id, schema.messages.customerId))
    .where(
      and(
        eq(schema.messages.organizationId, organizationId),
        eq(schema.messages.conversationId, conversationId),
      ),
    )
    .orderBy(schema.messages.createdAt);

  const attachmentRows = await db
    .select()
    .from(schema.attachments)
    .where(eq(schema.attachments.conversationId, conversationId));

  return rows.map((row) => ({
    id: row.message.id,
    conversationId: row.message.conversationId,
    kind: row.message.kind,
    body: row.message.body,
    author: row.authorId && row.authorName ? { id: row.authorId, name: row.authorName } : null,
    customer:
      row.customerId && row.customerEmail
        ? { id: row.customerId, name: row.customerName, email: row.customerEmail }
        : null,
    attachments: attachmentRows
      .filter((attachment) => attachment.messageId === row.message.id)
      .map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename,
        contentType: attachment.contentType,
        size: attachment.size,
        url: `/attachments/${attachment.id}`,
      })),
    createdAt: row.message.createdAt.toISOString(),
  }));
}

export async function addMessage(
  organizationId: string,
  conversationId: string,
  input: CreateMessageInput,
  author: { id: string; name: string },
) {
  const [conversation] = await db
    .select()
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.organizationId, organizationId),
        eq(schema.conversations.id, conversationId),
      ),
    )
    .limit(1);

  if (!conversation) {
    throw notFound('conversation not found');
  }

  const now = new Date();
  const isReply = input.kind === 'reply';
  const firstResponse = isReply && !conversation.firstResponseAt;

  const messageId = await db.transaction(async (tx) => {
    const [message] = await tx
      .insert(schema.messages)
      .values({
        organizationId,
        conversationId,
        kind: input.kind,
        body: input.body,
        authorId: author.id,
        createdAt: now,
      })
      .returning({ id: schema.messages.id });

    if (input.attachmentIds.length > 0) {
      await tx
        .update(schema.attachments)
        .set({ messageId: message!.id, conversationId })
        .where(
          and(
            eq(schema.attachments.organizationId, organizationId),
            inArray(schema.attachments.id, input.attachmentIds),
          ),
        );
    }

    await tx
      .update(schema.conversations)
      .set({
        messageCount: sql`${schema.conversations.messageCount} + 1`,
        lastMessageAt: now,
        snippet: snippetOf(input.body),
        ...(firstResponse ? { firstResponseAt: now, slaDueAt: null } : {}),
        ...(isReply && conversation.status === 'closed'
          ? { status: 'open' as const, resolvedAt: null }
          : {}),
      })
      .where(eq(schema.conversations.id, conversationId));

    return message!.id;
  });

  const messages = await listMessages(organizationId, conversationId);
  const message = messages.find((item) => item.id === messageId);
  if (!message) {
    throw notFound('message not found');
  }
  return { message, conversation: await getConversation(organizationId, conversationId) };
}

export async function updateConversation(
  organizationId: string,
  conversationId: string,
  input: UpdateConversationInput,
) {
  const [current] = await db
    .select()
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.organizationId, organizationId),
        eq(schema.conversations.id, conversationId),
      ),
    )
    .limit(1);

  if (!current) {
    throw notFound('conversation not found');
  }

  const patch: Partial<typeof schema.conversations.$inferInsert> = {};

  if (input.status && input.status !== current.status) {
    patch.status = input.status;
    patch.resolvedAt = input.status === 'closed' ? new Date() : null;
    if (input.status !== 'snoozed') {
      patch.snoozedUntil = null;
    }
  }
  if (input.priority && input.priority !== current.priority) {
    patch.priority = input.priority;
    if (!current.firstResponseAt) {
      patch.slaDueAt = firstResponseDueAt(input.priority, current.createdAt);
      patch.slaBreachedAt = null;
    }
  }
  if (input.assigneeId !== undefined) {
    patch.assigneeId = input.assigneeId;
  }
  if (input.snoozedUntil !== undefined) {
    patch.snoozedUntil = input.snoozedUntil ? new Date(input.snoozedUntil) : null;
  }

  if (Object.keys(patch).length > 0) {
    await db
      .update(schema.conversations)
      .set(patch)
      .where(eq(schema.conversations.id, conversationId));
  }

  return getConversation(organizationId, conversationId);
}

export async function setConversationTag(
  organizationId: string,
  conversationId: string,
  tagName: string,
  attach: boolean,
) {
  const [conversation] = await db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.organizationId, organizationId),
        eq(schema.conversations.id, conversationId),
      ),
    )
    .limit(1);
  if (!conversation) {
    throw notFound('conversation not found');
  }

  const [tag] = await db
    .insert(schema.tags)
    .values({ organizationId, name: tagName })
    .onConflictDoUpdate({
      target: [schema.tags.organizationId, schema.tags.name],
      set: { name: tagName },
    })
    .returning({ id: schema.tags.id });

  if (attach) {
    await db
      .insert(schema.conversationTags)
      .values({ conversationId, tagId: tag!.id })
      .onConflictDoNothing();
  } else {
    await db
      .delete(schema.conversationTags)
      .where(
        and(
          eq(schema.conversationTags.conversationId, conversationId),
          eq(schema.conversationTags.tagId, tag!.id),
        ),
      );
  }

  return getConversation(organizationId, conversationId);
}
