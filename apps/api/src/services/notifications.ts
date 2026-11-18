import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { logger } from '../lib/logger.js';

const expoEndpoint = 'https://exp.host/--/api/v2/push/send';

export async function sendPush(
  userId: string,
  payload: { title: string; body: string; conversationId: string },
) {
  const tokens = await db
    .select({ token: schema.pushTokens.token })
    .from(schema.pushTokens)
    .where(eq(schema.pushTokens.userId, userId));

  if (tokens.length === 0) {
    return 0;
  }

  const messages = tokens.map((row) => ({
    to: row.token,
    title: payload.title,
    body: payload.body,
    data: { conversationId: payload.conversationId },
  }));

  try {
    const response = await fetch(expoEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, 'push delivery rejected');
      return 0;
    }
    return messages.length;
  } catch (error) {
    logger.warn({ err: error }, 'push delivery failed');
    return 0;
  }
}
