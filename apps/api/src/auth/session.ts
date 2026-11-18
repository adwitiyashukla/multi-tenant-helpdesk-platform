import type { PlanTier, Role } from '@helpdesk/contracts';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { db, schema } from '../db/index.js';
import { env } from '../env.js';
import { createToken, hashToken } from '../lib/tokens.js';

export type AuthContext = {
  sessionId: string;
  role: Role;
  user: { id: string; name: string; email: string };
  organization: {
    id: string;
    name: string;
    slug: string;
    plan: PlanTier;
    seatLimit: number;
    subscriptionStatus: 'none' | 'active' | 'past_due' | 'canceled';
    currentPeriodEnd: Date | null;
  };
};

const ttlMs = () => env.SESSION_TTL_HOURS * 60 * 60 * 1000;

export async function createSession(userId: string, organizationId: string) {
  const token = createToken();
  const expiresAt = new Date(Date.now() + ttlMs());
  const [row] = await db
    .insert(schema.sessions)
    .values({ userId, organizationId, tokenHash: hashToken(token), expiresAt })
    .returning({ id: schema.sessions.id });
  return { id: row!.id, token, expiresAt };
}

export async function resolveSession(token: string): Promise<AuthContext | null> {
  const [row] = await db
    .select({
      sessionId: schema.sessions.id,
      role: schema.memberships.role,
      userId: schema.users.id,
      userName: schema.users.name,
      userEmail: schema.users.email,
      orgId: schema.organizations.id,
      orgName: schema.organizations.name,
      orgSlug: schema.organizations.slug,
      plan: schema.organizations.plan,
      seatLimit: schema.organizations.seatLimit,
      subscriptionStatus: schema.organizations.subscriptionStatus,
      currentPeriodEnd: schema.organizations.currentPeriodEnd,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.sessions.organizationId))
    .innerJoin(
      schema.memberships,
      and(
        eq(schema.memberships.userId, schema.sessions.userId),
        eq(schema.memberships.organizationId, schema.sessions.organizationId),
      ),
    )
    .where(
      and(
        eq(schema.sessions.tokenHash, hashToken(token)),
        gt(schema.sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    sessionId: row.sessionId,
    role: row.role,
    user: { id: row.userId, name: row.userName, email: row.userEmail },
    organization: {
      id: row.orgId,
      name: row.orgName,
      slug: row.orgSlug,
      plan: row.plan,
      seatLimit: row.seatLimit,
      subscriptionStatus: row.subscriptionStatus,
      currentPeriodEnd: row.currentPeriodEnd,
    },
  };
}

export async function destroySession(token: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(token)));
}

export async function destroyUserSessions(userId: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

export async function purgeExpiredSessions() {
  const result = await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
  return result.count ?? 0;
}

export function readSessionToken(request: FastifyRequest): string | null {
  const fromCookie = request.cookies[env.SESSION_COOKIE_NAME];
  if (fromCookie) {
    return fromCookie;
  }
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice(7);
  }
  return null;
}

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: env.COOKIE_SAMESITE,
    secure: env.COOKIE_SECURE,
    domain: env.COOKIE_DOMAIN,
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(env.SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: env.COOKIE_SAMESITE,
    secure: env.COOKIE_SECURE,
    domain: env.COOKIE_DOMAIN,
    path: '/',
  });
}
