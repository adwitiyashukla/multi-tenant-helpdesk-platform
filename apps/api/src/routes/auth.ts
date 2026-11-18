import { acceptInviteSchema, loginSchema, type Session, signupSchema } from '@helpdesk/contracts';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { currentAuth, requireAuth } from '../auth/guards.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  readSessionToken,
  setSessionCookie,
} from '../auth/session.js';
import { db, schema } from '../db/index.js';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { uniqueSlug } from '../lib/slug.js';
import { hashToken } from '../lib/tokens.js';
import { parse } from '../lib/validate.js';
import { recordAudit } from '../services/audit.js';
import {
  countSeats,
  seedOrganizationDefaults,
  serializeOrganization,
} from '../services/organizations.js';

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function authRoutes(app: FastifyInstance, options: { rateLimitMax: number }) {
  const authLimit = { rateLimit: { max: options.rateLimitMax, timeWindow: '10 minutes' } };

  app.post('/auth/signup', { config: authLimit }, async (request, reply) => {
    const input = parse(signupSchema, request.body);
    const email = normalizeEmail(input.email);

    const existing = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    if (existing.length > 0) {
      throw conflict('an account with that email already exists');
    }

    const passwordHash = await hashPassword(input.password);

    const created = await db.transaction(async (tx) => {
      const [organization] = await tx
        .insert(schema.organizations)
        .values({ name: input.organizationName, slug: uniqueSlug(input.organizationName) })
        .returning();
      const [user] = await tx
        .insert(schema.users)
        .values({ email, name: input.name, passwordHash })
        .returning();
      await tx
        .insert(schema.memberships)
        .values({ organizationId: organization!.id, userId: user!.id, role: 'owner' });
      return { organization: organization!, user: user! };
    });

    await seedOrganizationDefaults(created.organization.id, created.user.id);
    await recordAudit({
      organizationId: created.organization.id,
      actorId: created.user.id,
      action: 'organization.created',
      subjectType: 'organization',
      subjectId: created.organization.id,
    });

    const session = await createSession(created.user.id, created.organization.id);
    setSessionCookie(reply, session.token, session.expiresAt);

    const payload: Session = {
      user: {
        id: created.user.id,
        name: created.user.name,
        email: created.user.email,
        role: 'owner',
      },
      organization: serializeOrganization(created.organization, 1),
    };
    return reply.code(201).send({ ...payload, token: session.token });
  });

  app.post('/auth/login', { config: authLimit }, async (request, reply) => {
    const input = parse(loginSchema, request.body);
    const email = normalizeEmail(input.email);

    const [row] = await db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        passwordHash: schema.users.passwordHash,
      })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    const valid = row ? await verifyPassword(row.passwordHash, input.password) : false;
    if (!row || !valid) {
      throw unauthorized('invalid email or password');
    }

    const [membership] = await db
      .select({
        role: schema.memberships.role,
        organization: schema.organizations,
      })
      .from(schema.memberships)
      .innerJoin(
        schema.organizations,
        eq(schema.organizations.id, schema.memberships.organizationId),
      )
      .where(eq(schema.memberships.userId, row.id))
      .limit(1);

    if (!membership) {
      throw unauthorized('this account is not attached to a workspace');
    }

    const session = await createSession(row.id, membership.organization.id);
    setSessionCookie(reply, session.token, session.expiresAt);

    const seatsUsed = await countSeats(membership.organization.id);
    const payload: Session = {
      user: { id: row.id, name: row.name, email: row.email, role: membership.role },
      organization: serializeOrganization(membership.organization, seatsUsed),
    };
    return reply.send({ ...payload, token: session.token });
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = readSessionToken(request);
    if (token) {
      await destroySession(token);
    }
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (request) => {
    const auth = currentAuth(request);
    const seatsUsed = await countSeats(auth.organization.id);
    const payload: Session = {
      user: { ...auth.user, role: auth.role },
      organization: serializeOrganization(auth.organization, seatsUsed),
    };
    return payload;
  });

  app.post('/auth/invites/accept', async (request, reply) => {
    const input = parse(acceptInviteSchema, request.body);

    const [invite] = await db
      .select()
      .from(schema.invites)
      .where(
        and(
          eq(schema.invites.tokenHash, hashToken(input.token)),
          isNull(schema.invites.acceptedAt),
          gt(schema.invites.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!invite) {
      throw badRequest('this invite is invalid or has expired');
    }

    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, invite.email))
      .limit(1);
    if (existing) {
      throw conflict('an account with that email already exists');
    }

    const passwordHash = await hashPassword(input.password);
    const created = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(schema.users)
        .values({ email: invite.email, name: input.name, passwordHash })
        .returning();
      await tx.insert(schema.memberships).values({
        organizationId: invite.organizationId,
        userId: user!.id,
        role: invite.role,
      });
      await tx
        .update(schema.invites)
        .set({ acceptedAt: new Date() })
        .where(eq(schema.invites.id, invite.id));
      return user!;
    });

    await recordAudit({
      organizationId: invite.organizationId,
      actorId: created.id,
      action: 'invite.accepted',
      subjectType: 'user',
      subjectId: created.id,
    });

    const session = await createSession(created.id, invite.organizationId);
    setSessionCookie(reply, session.token, session.expiresAt);

    const [organization] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, invite.organizationId))
      .limit(1);
    const seatsUsed = await countSeats(invite.organizationId);

    const payload: Session = {
      user: { id: created.id, name: created.name, email: created.email, role: invite.role },
      organization: serializeOrganization(organization!, seatsUsed),
    };
    return reply.code(201).send({ ...payload, token: session.token });
  });
}
