import { createCannedReplySchema } from '@helpdesk/contracts';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { currentAuth, requireAuth } from '../auth/guards.js';
import { db, schema } from '../db/index.js';
import { notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';

export async function cannedReplyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/canned-replies', async (request) => {
    const auth = currentAuth(request);
    return db
      .select({
        id: schema.cannedReplies.id,
        title: schema.cannedReplies.title,
        body: schema.cannedReplies.body,
      })
      .from(schema.cannedReplies)
      .where(eq(schema.cannedReplies.organizationId, auth.organization.id))
      .orderBy(asc(schema.cannedReplies.title));
  });

  app.post('/canned-replies', async (request, reply) => {
    const auth = currentAuth(request);
    const input = parse(createCannedReplySchema, request.body);
    const [row] = await db
      .insert(schema.cannedReplies)
      .values({
        organizationId: auth.organization.id,
        title: input.title,
        body: input.body,
        createdBy: auth.user.id,
      })
      .returning({
        id: schema.cannedReplies.id,
        title: schema.cannedReplies.title,
        body: schema.cannedReplies.body,
      });
    return reply.code(201).send(row);
  });

  app.delete('/canned-replies/:id', async (request, reply) => {
    const auth = currentAuth(request);
    const { id } = request.params as { id: string };
    const deleted = await db
      .delete(schema.cannedReplies)
      .where(
        and(
          eq(schema.cannedReplies.id, id),
          eq(schema.cannedReplies.organizationId, auth.organization.id),
        ),
      )
      .returning({ id: schema.cannedReplies.id });
    if (deleted.length === 0) {
      throw notFound('canned reply not found');
    }
    return reply.code(204).send();
  });
}
