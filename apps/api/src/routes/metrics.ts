import type { FastifyInstance } from 'fastify';
import { currentAuth, requireAuth } from '../auth/guards.js';
import { workspaceMetrics } from '../services/metrics.js';

export async function metricRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/metrics', async (request) => {
    const auth = currentAuth(request);
    return workspaceMetrics(auth.organization.id);
  });
}
