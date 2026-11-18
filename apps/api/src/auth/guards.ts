import type { Role } from '@helpdesk/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { forbidden, unauthorized } from '../lib/errors.js';
import { type AuthContext, readSessionToken, resolveSession } from './session.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export async function attachSession(request: FastifyRequest) {
  const token = readSessionToken(request);
  request.auth = token ? await resolveSession(token) : null;
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.auth) {
    throw unauthorized();
  }
}

export function requireRole(...allowed: Role[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.auth) {
      throw unauthorized();
    }
    if (!allowed.includes(request.auth.role)) {
      throw forbidden(`requires role ${allowed.join(' or ')}`);
    }
  };
}

export function currentAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) {
    throw unauthorized();
  }
  return request.auth;
}
