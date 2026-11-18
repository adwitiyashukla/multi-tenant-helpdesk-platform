import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentAuth, requireAuth } from '../auth/guards.js';
import { db, schema } from '../db/index.js';
import { parse } from '../lib/validate.js';

const registerSchema = z.object({
  token: z.string().min(10).max(200),
  platform: z.enum(['ios', 'android', 'web']),
});

export async function deviceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.post('/devices/push-token', async (request, reply) => {
    const auth = currentAuth(request);
    const input = parse(registerSchema, request.body);
    await db
      .insert(schema.pushTokens)
      .values({
        organizationId: auth.organization.id,
        userId: auth.user.id,
        token: input.token,
        platform: input.platform,
      })
      .onConflictDoUpdate({
        target: schema.pushTokens.token,
        set: { userId: auth.user.id, organizationId: auth.organization.id },
      });
    return reply.code(204).send();
  });

  app.delete('/devices/push-token/:token', async (request, reply) => {
    const auth = currentAuth(request);
    const { token } = request.params as { token: string };
    await db
      .delete(schema.pushTokens)
      .where(and(eq(schema.pushTokens.token, token), eq(schema.pushTokens.userId, auth.user.id)));
    return reply.code(204).send();
  });
}
