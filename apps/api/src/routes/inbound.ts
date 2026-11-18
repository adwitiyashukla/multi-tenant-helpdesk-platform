import { timingSafeEqual } from 'node:crypto';
import { inboundEmailSchema } from '@helpdesk/contracts';
import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { unauthorized } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { ingestInboundEmail } from '../services/inbound.js';

function secretMatches(provided: string | undefined) {
  if (!provided) {
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(env.INBOUND_EMAIL_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function inboundRoutes(app: FastifyInstance) {
  app.post(
    '/inbound/email',
    { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!secretMatches(request.headers['x-inbound-secret'] as string | undefined)) {
        throw unauthorized('invalid inbound secret');
      }
      const input = parse(inboundEmailSchema, request.body);
      const result = await ingestInboundEmail(input);
      if (result.duplicate) {
        return reply.code(200).send({ status: 'duplicate' });
      }
      return reply.code(201).send({ status: 'accepted', conversationId: result.conversation.id });
    },
  );
}
