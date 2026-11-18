import { type InboundEmail, slaTargets } from '@helpdesk/contracts';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { enqueueNotification } from '../jobs/queue.js';
import { notFound } from '../lib/errors.js';
import { publishEvent } from '../realtime/hub.js';
import { createConversation, getConversation, listMessages } from './conversations.js';
import { invalidateMetrics } from './metrics.js';

const threadWindowMs = 7 * 24 * 60 * 60 * 1000;

export async function ingestInboundEmail(input: InboundEmail) {
  const slug = input.to.split('@')[0]?.trim().toLowerCase();
  if (!slug) {
    throw notFound('unknown inbox address');
  }

  const [organization] = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, slug))
    .limit(1);

  if (!organization) {
    throw notFound('unknown inbox address');
  }

  if (input.externalId) {
    const existing = await db
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.organizationId, organization.id),
          eq(schema.messages.externalId, input.externalId),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      return { duplicate: true as const };
    }
  }

  const email = input.from.trim().toLowerCase();
  const [customer] = await db
    .select({ id: schema.customers.id })
    .from(schema.customers)
    .where(
      and(eq(schema.customers.organizationId, organization.id), eq(schema.customers.email, email)),
    )
    .limit(1);

  if (customer) {
    const [thread] = await db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.organizationId, organization.id),
          eq(schema.conversations.customerId, customer.id),
          eq(schema.conversations.subject, input.subject),
          inArray(schema.conversations.status, ['open', 'pending', 'snoozed']),
          gte(schema.conversations.lastMessageAt, new Date(Date.now() - threadWindowMs)),
        ),
      )
      .orderBy(desc(schema.conversations.lastMessageAt))
      .limit(1);

    if (thread) {
      const now = new Date();
      await db.transaction(async (tx) => {
        await tx.insert(schema.messages).values({
          organizationId: organization.id,
          conversationId: thread.id,
          kind: 'inbound',
          body: input.text,
          customerId: customer.id,
          externalId: input.externalId ?? null,
          createdAt: now,
        });
        await tx
          .update(schema.conversations)
          .set({
            messageCount: sql`${schema.conversations.messageCount} + 1`,
            lastMessageAt: now,
            snippet: input.text.replace(/\s+/g, ' ').trim().slice(0, 160),
            status: 'open',
          })
          .where(eq(schema.conversations.id, thread.id));
      });

      await invalidateMetrics(organization.id);
      const conversation = await getConversation(organization.id, thread.id);
      const messages = await listMessages(organization.id, thread.id);
      const message = messages.at(-1);

      if (message) {
        await publishEvent(organization.id, {
          type: 'message.created',
          conversationId: thread.id,
          message,
        });
      }
      await publishEvent(organization.id, { type: 'conversation.updated', conversation });

      if (conversation.assignee) {
        await enqueueNotification({
          organizationId: organization.id,
          userId: conversation.assignee.id,
          title: `New reply from ${conversation.customer.name ?? conversation.customer.email}`,
          body: input.subject,
          conversationId: conversation.id,
        });
      }

      return { duplicate: false as const, conversation };
    }
  }

  const conversation = await createConversation(organization.id, {
    subject: input.subject,
    customerEmail: email,
    customerName: input.fromName,
    body: input.text,
    priority: 'normal',
    externalId: input.externalId,
  });

  await invalidateMetrics(organization.id);
  await publishEvent(organization.id, { type: 'conversation.created', conversation });
  return { duplicate: false as const, conversation };
}

export const slaMinutes = slaTargets;
