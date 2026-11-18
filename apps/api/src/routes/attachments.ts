import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { currentAuth, requireAuth } from '../auth/guards.js';
import { db, schema } from '../db/index.js';
import { badRequest, notFound } from '../lib/errors.js';
import { getObject, putObject } from '../lib/storage.js';

const allowed = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/zip',
]);

export async function attachmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.post('/attachments', async (request, reply) => {
    const auth = currentAuth(request);
    const file = await request.file();
    if (!file) {
      throw badRequest('no file uploaded');
    }
    if (!allowed.has(file.mimetype)) {
      throw badRequest(`unsupported file type ${file.mimetype}`);
    }

    const buffer = await file.toBuffer();
    const key = `${auth.organization.id}/${randomUUID()}-${file.filename.replace(/[^\w.-]/g, '_')}`;
    await putObject(key, buffer, file.mimetype);

    const [row] = await db
      .insert(schema.attachments)
      .values({
        organizationId: auth.organization.id,
        uploadedBy: auth.user.id,
        filename: file.filename,
        contentType: file.mimetype,
        size: buffer.byteLength,
        storageKey: key,
      })
      .returning();

    return reply.code(201).send({
      id: row!.id,
      filename: row!.filename,
      contentType: row!.contentType,
      size: row!.size,
      url: `/attachments/${row!.id}`,
    });
  });

  app.get('/attachments/:id', async (request, reply) => {
    const auth = currentAuth(request);
    const { id } = request.params as { id: string };
    const [row] = await db
      .select()
      .from(schema.attachments)
      .where(
        and(
          eq(schema.attachments.id, id),
          eq(schema.attachments.organizationId, auth.organization.id),
        ),
      )
      .limit(1);

    if (!row) {
      throw notFound('attachment not found');
    }

    const body = await getObject(row.storageKey);
    return reply
      .header('content-type', row.contentType)
      .header('content-disposition', `inline; filename="${row.filename}"`)
      .send(body);
  });
}
