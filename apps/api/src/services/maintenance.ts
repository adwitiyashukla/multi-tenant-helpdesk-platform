import { and, eq, isNull, lt, ne, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { publishEvent } from '../realtime/hub.js';
import { getConversation } from './conversations.js';
import { invalidateMetrics } from './metrics.js';

export async function markSlaBreaches(now = new Date()) {
  const breached = await db
    .update(schema.conversations)
    .set({ slaBreachedAt: now })
    .where(
      and(
        lt(schema.conversations.slaDueAt, now),
        isNull(schema.conversations.slaBreachedAt),
        isNull(schema.conversations.firstResponseAt),
        ne(schema.conversations.status, 'closed'),
      ),
    )
    .returning({
      id: schema.conversations.id,
      organizationId: schema.conversations.organizationId,
    });

  for (const row of breached) {
    await invalidateMetrics(row.organizationId);
    const conversation = await getConversation(row.organizationId, row.id);
    await publishEvent(row.organizationId, { type: 'sla.breached', conversation });
  }
  return breached.length;
}

export async function wakeSnoozedConversations(now = new Date()) {
  const woken = await db
    .update(schema.conversations)
    .set({ status: 'open', snoozedUntil: null, lastMessageAt: sql`now()` })
    .where(
      and(eq(schema.conversations.status, 'snoozed'), lt(schema.conversations.snoozedUntil, now)),
    )
    .returning({
      id: schema.conversations.id,
      organizationId: schema.conversations.organizationId,
    });

  for (const row of woken) {
    const conversation = await getConversation(row.organizationId, row.id);
    await publishEvent(row.organizationId, { type: 'conversation.updated', conversation });
  }
  return woken.length;
}
