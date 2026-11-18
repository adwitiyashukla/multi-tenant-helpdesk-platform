import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyError } from 'fastify';
import { ZodError } from 'zod';
import { attachSession } from './auth/guards.js';
import { env } from './env.js';
import { HttpError } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { websocketRoutes } from './realtime/ws.js';
import { attachmentRoutes } from './routes/attachments.js';
import { authRoutes } from './routes/auth.js';
import { billingRoutes } from './routes/billing.js';
import { cannedReplyRoutes } from './routes/canned.js';
import { conversationRoutes } from './routes/conversations.js';
import { deviceRoutes } from './routes/devices.js';
import { healthRoutes } from './routes/health.js';
import { inboundRoutes } from './routes/inbound.js';
import { memberRoutes } from './routes/members.js';
import { metricRoutes } from './routes/metrics.js';
import { tagRoutes } from './routes/tags.js';

export type BuildOptions = {
  rateLimitMax?: number;
  authRateLimitMax?: number;
};

export async function buildApp(options: BuildOptions = {}) {
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  });

  app.decorateRequest('auth', null);

  await app.register(cors, {
    origin: env.WEB_ORIGIN.split(',').map((value) => value.trim()),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization', 'x-inbound-secret', 'stripe-signature'],
    maxAge: 86400,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: options.rateLimitMax ?? env.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
  });
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  });
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });

  app.addHook('onRequest', attachSession);

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof HttpError) {
      return reply
        .code(error.statusCode)
        .send({ error: error.code, message: error.message, details: error.details });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'bad_request', message: 'request validation failed' });
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply
        .code(error.statusCode)
        .send({ error: error.code ?? 'request_failed', message: error.message });
    }
    request.log.error({ err: error }, 'unhandled request error');
    return reply.code(500).send({ error: 'internal_error', message: 'something went wrong' });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ error: 'not_found', message: 'route not found' }),
  );

  await app.register(healthRoutes);
  await app.register(authRoutes, {
    rateLimitMax: options.authRateLimitMax ?? env.AUTH_RATE_LIMIT_MAX,
  });
  await app.register(memberRoutes);
  await app.register(conversationRoutes);
  await app.register(tagRoutes);
  await app.register(cannedReplyRoutes);
  await app.register(attachmentRoutes);
  await app.register(metricRoutes);
  await app.register(deviceRoutes);
  await app.register(inboundRoutes);
  await app.register(billingRoutes);
  await app.register(websocketRoutes);

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
