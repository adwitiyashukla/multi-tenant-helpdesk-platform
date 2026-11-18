import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { redis } from '../lib/redis.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/health/ready', async (_request, reply) => {
    const checks: Record<string, boolean> = { database: false, redis: false };
    try {
      await db.execute(sql`select 1`);
      checks.database = true;
    } catch {
      checks.database = false;
    }
    try {
      await redis.ping();
      checks.redis = true;
    } catch {
      checks.redis = false;
    }
    const ready = Object.values(checks).every(Boolean);
    return reply.code(ready ? 200 : 503).send({ ready, checks });
  });
}
