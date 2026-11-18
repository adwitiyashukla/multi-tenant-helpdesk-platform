import { tagInputSchema } from '@helpdesk/contracts';
import { and, asc, count, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { currentAuth, requireAuth, requireRole } from '../auth/guards.js';
import { db, schema } from '../db/index.js';
import { conflict, notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';

export async function tagRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/tags', async (request) => {
    const auth = currentAuth(request);
    const rows = await db
      .select({
        id: schema.tags.id,
        name: schema.tags.name,
        color: schema.tags.color,
        usage: count(schema.conversationTags.conversationId),
      })
      .from(schema.tags)
      .leftJoin(schema.conversationTags, eq(schema.conversationTags.tagId, schema.tags.id))
      .where(eq(schema.tags.organizationId, auth.organization.id))
      .groupBy(schema.tags.id)
      .orderBy(asc(schema.tags.name));
    return rows;
  });

  app.post('/tags', async (request, reply) => {
    const auth = currentAuth(request);
    const input = parse(tagInputSchema, request.body);
    const existing = await db
      .select({ id: schema.tags.id })
      .from(schema.tags)
      .where(
        and(eq(schema.tags.organizationId, auth.organization.id), eq(schema.tags.name, input.name)),
      )
      .limit(1);
    if (existing.length > 0) {
      throw conflict('that tag already exists');
    }
    const [tag] = await db
      .insert(schema.tags)
      .values({ organizationId: auth.organization.id, name: input.name })
      .returning();
    return reply.code(201).send(tag);
  });

  app.delete('/tags/:id', { preHandler: requireRole('owner', 'admin') }, async (request, reply) => {
    const auth = currentAuth(request);
    const { id } = request.params as { id: string };
    const deleted = await db
      .delete(schema.tags)
      .where(and(eq(schema.tags.id, id), eq(schema.tags.organizationId, auth.organization.id)))
      .returning({ id: schema.tags.id });
    if (deleted.length === 0) {
      throw notFound('tag not found');
    }
    return reply.code(204).send();
  });
}
