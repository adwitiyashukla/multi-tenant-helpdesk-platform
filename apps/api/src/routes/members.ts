import { inviteSchema, type Member, planLimits, updateMemberSchema } from '@helpdesk/contracts';
import { and, asc, count, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { currentAuth, requireAuth, requireRole } from '../auth/guards.js';
import { destroyUserSessions } from '../auth/session.js';
import { db, schema } from '../db/index.js';
import { badRequest, conflict, forbidden, limitReached, notFound } from '../lib/errors.js';
import { createToken, hashToken } from '../lib/tokens.js';
import { parse } from '../lib/validate.js';
import { recordAudit } from '../services/audit.js';
import { countSeats } from '../services/organizations.js';

const inviteTtlMs = 7 * 24 * 60 * 60 * 1000;

export async function memberRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/members', async (request) => {
    const auth = currentAuth(request);
    const rows = await db
      .select({
        id: schema.memberships.id,
        userId: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.memberships.role,
        createdAt: schema.memberships.createdAt,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.memberships.organizationId, auth.organization.id))
      .orderBy(asc(schema.memberships.createdAt));

    return rows.map(
      (row): Member => ({
        id: row.id,
        userId: row.userId,
        name: row.name,
        email: row.email,
        role: row.role,
        createdAt: row.createdAt.toISOString(),
      }),
    );
  });

  app.get('/members/invites', { preHandler: requireRole('owner', 'admin') }, async (request) => {
    const auth = currentAuth(request);
    const rows = await db
      .select({
        id: schema.invites.id,
        email: schema.invites.email,
        role: schema.invites.role,
        expiresAt: schema.invites.expiresAt,
        createdAt: schema.invites.createdAt,
      })
      .from(schema.invites)
      .where(
        and(
          eq(schema.invites.organizationId, auth.organization.id),
          isNull(schema.invites.acceptedAt),
          gt(schema.invites.expiresAt, new Date()),
        ),
      )
      .orderBy(asc(schema.invites.createdAt));

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }));
  });

  app.post(
    '/members/invites',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      const auth = currentAuth(request);
      const input = parse(inviteSchema, request.body);
      const email = input.email.trim().toLowerCase();

      const seatLimit = auth.organization.seatLimit || planLimits[auth.organization.plan].seats;
      const seatsUsed = await countSeats(auth.organization.id);
      const [pending] = await db
        .select({ value: count() })
        .from(schema.invites)
        .where(
          and(
            eq(schema.invites.organizationId, auth.organization.id),
            isNull(schema.invites.acceptedAt),
            gt(schema.invites.expiresAt, new Date()),
          ),
        );

      if (seatsUsed + (pending?.value ?? 0) >= seatLimit) {
        throw limitReached(
          `the ${auth.organization.plan} plan allows ${seatLimit} seats, upgrade to invite more people`,
        );
      }

      const [existingMember] = await db
        .select({ id: schema.memberships.id })
        .from(schema.memberships)
        .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
        .where(
          and(
            eq(schema.memberships.organizationId, auth.organization.id),
            eq(schema.users.email, email),
          ),
        )
        .limit(1);
      if (existingMember) {
        throw conflict('that person is already on the team');
      }

      const token = createToken();
      const [invite] = await db
        .insert(schema.invites)
        .values({
          organizationId: auth.organization.id,
          email,
          role: input.role,
          tokenHash: hashToken(token),
          invitedBy: auth.user.id,
          expiresAt: new Date(Date.now() + inviteTtlMs),
        })
        .returning();

      await recordAudit({
        organizationId: auth.organization.id,
        actorId: auth.user.id,
        action: 'invite.created',
        subjectType: 'invite',
        subjectId: invite!.id,
        metadata: { email, role: input.role },
      });

      return reply.code(201).send({
        id: invite!.id,
        email,
        role: input.role,
        token,
        expiresAt: invite!.expiresAt.toISOString(),
      });
    },
  );

  app.delete(
    '/members/invites/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      const auth = currentAuth(request);
      const { id } = request.params as { id: string };
      const deleted = await db
        .delete(schema.invites)
        .where(
          and(eq(schema.invites.id, id), eq(schema.invites.organizationId, auth.organization.id)),
        )
        .returning({ id: schema.invites.id });
      if (deleted.length === 0) {
        throw notFound('invite not found');
      }
      return reply.code(204).send();
    },
  );

  app.patch('/members/:userId', { preHandler: requireRole('owner', 'admin') }, async (request) => {
    const auth = currentAuth(request);
    const { userId } = request.params as { userId: string };
    const input = parse(updateMemberSchema, request.body);

    const [membership] = await db
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.organizationId, auth.organization.id),
          eq(schema.memberships.userId, userId),
        ),
      )
      .limit(1);

    if (!membership) {
      throw notFound('member not found');
    }
    if (membership.role === 'owner') {
      throw forbidden('the workspace owner role cannot be changed');
    }

    const [updated] = await db
      .update(schema.memberships)
      .set({ role: input.role })
      .where(eq(schema.memberships.id, membership.id))
      .returning();

    await recordAudit({
      organizationId: auth.organization.id,
      actorId: auth.user.id,
      action: 'member.role_changed',
      subjectType: 'user',
      subjectId: userId,
      metadata: { role: input.role },
    });

    return { id: updated!.id, userId, role: updated!.role };
  });

  app.delete(
    '/members/:userId',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      const auth = currentAuth(request);
      const { userId } = request.params as { userId: string };

      if (userId === auth.user.id) {
        throw badRequest('you cannot remove yourself');
      }

      const [membership] = await db
        .select()
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.organizationId, auth.organization.id),
            eq(schema.memberships.userId, userId),
          ),
        )
        .limit(1);

      if (!membership) {
        throw notFound('member not found');
      }
      if (membership.role === 'owner') {
        throw forbidden('the workspace owner cannot be removed');
      }

      await db.delete(schema.memberships).where(eq(schema.memberships.id, membership.id));
      await destroyUserSessions(userId);
      await recordAudit({
        organizationId: auth.organization.id,
        actorId: auth.user.id,
        action: 'member.removed',
        subjectType: 'user',
        subjectId: userId,
      });

      return reply.code(204).send();
    },
  );
}
