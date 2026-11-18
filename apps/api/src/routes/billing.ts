import { checkoutSchema, planLimits, type Subscription } from '@helpdesk/contracts';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { currentAuth, requireAuth, requireRole } from '../auth/guards.js';
import { db, schema } from '../db/index.js';
import { billingEnabled, env } from '../env.js';
import { badRequest, unavailable } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { parse } from '../lib/validate.js';
import { countSeats } from '../services/organizations.js';

let stripe: Stripe | null = null;

function client(): Stripe {
  if (!billingEnabled) {
    throw unavailable('billing is not configured on this deployment');
  }
  if (!stripe) {
    stripe = new Stripe(env.STRIPE_SECRET_KEY as string);
  }
  return stripe;
}

async function applySubscription(
  organizationId: string,
  values: {
    customerId?: string | null;
    subscriptionId?: string | null;
    status: 'none' | 'active' | 'past_due' | 'canceled';
    currentPeriodEnd?: Date | null;
  },
) {
  const plan = values.status === 'active' ? 'pro' : 'free';
  await db
    .update(schema.organizations)
    .set({
      plan,
      seatLimit: planLimits[plan].seats,
      subscriptionStatus: values.status,
      stripeCustomerId: values.customerId ?? undefined,
      stripeSubscriptionId: values.subscriptionId ?? undefined,
      currentPeriodEnd: values.currentPeriodEnd ?? null,
    })
    .where(eq(schema.organizations.id, organizationId));
}

export async function billingRoutes(app: FastifyInstance) {
  app.register(async (instance) => {
    instance.addHook('preHandler', requireAuth);

    instance.get('/billing', async (request) => {
      const auth = currentAuth(request);
      const seatsUsed = await countSeats(auth.organization.id);
      const payload: Subscription = {
        plan: auth.organization.plan,
        status: auth.organization.subscriptionStatus,
        seatLimit: auth.organization.seatLimit,
        seatsUsed,
        currentPeriodEnd: auth.organization.currentPeriodEnd?.toISOString() ?? null,
      };
      return payload;
    });

    instance.post('/billing/checkout', { preHandler: requireRole('owner') }, async (request) => {
      const auth = currentAuth(request);
      const input = parse(checkoutSchema, request.body);
      const stripeClient = client();

      const [organization] = await db
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, auth.organization.id))
        .limit(1);

      let customerId = organization?.stripeCustomerId ?? null;
      if (!customerId) {
        const customer = await stripeClient.customers.create({
          name: auth.organization.name,
          email: auth.user.email,
          metadata: { organizationId: auth.organization.id },
        });
        customerId = customer.id;
        await db
          .update(schema.organizations)
          .set({ stripeCustomerId: customerId })
          .where(eq(schema.organizations.id, auth.organization.id));
      }

      const session = await stripeClient.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: env.STRIPE_PRICE_ID as string, quantity: 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: { organizationId: auth.organization.id },
      });

      return { url: session.url };
    });

    instance.post('/billing/portal', { preHandler: requireRole('owner') }, async (request) => {
      const auth = currentAuth(request);
      const input = parse(checkoutSchema, request.body);
      const stripeClient = client();
      const [organization] = await db
        .select({ customerId: schema.organizations.stripeCustomerId })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, auth.organization.id))
        .limit(1);

      if (!organization?.customerId) {
        throw badRequest('this workspace has no billing account yet');
      }

      const session = await stripeClient.billingPortal.sessions.create({
        customer: organization.customerId,
        return_url: input.successUrl,
      });
      return { url: session.url };
    });
  });

  app.register(async (instance) => {
    instance.removeAllContentTypeParsers();
    instance.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => {
      done(null, body);
    });

    instance.post('/billing/webhook', async (request, reply) => {
      const signature = request.headers['stripe-signature'];
      if (!billingEnabled || typeof signature !== 'string') {
        throw unavailable('billing is not configured on this deployment');
      }

      let event: Stripe.Event;
      try {
        event = client().webhooks.constructEvent(
          request.body as Buffer,
          signature,
          env.STRIPE_WEBHOOK_SECRET as string,
        );
      } catch (error) {
        logger.warn({ err: error }, 'stripe signature verification failed');
        throw badRequest('invalid stripe signature');
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const organizationId = session.metadata?.organizationId;
        if (organizationId) {
          await applySubscription(organizationId, {
            customerId: typeof session.customer === 'string' ? session.customer : null,
            subscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
            status: 'active',
          });
        }
      }

      if (
        event.type === 'customer.subscription.updated' ||
        event.type === 'customer.subscription.deleted'
      ) {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : null;
        if (customerId) {
          const [organization] = await db
            .select({ id: schema.organizations.id })
            .from(schema.organizations)
            .where(eq(schema.organizations.stripeCustomerId, customerId))
            .limit(1);

          if (organization) {
            const status =
              subscription.status === 'active' || subscription.status === 'trialing'
                ? 'active'
                : subscription.status === 'past_due'
                  ? 'past_due'
                  : 'canceled';
            const periodEnd = subscription.items.data[0]?.current_period_end;
            await applySubscription(organization.id, {
              customerId,
              subscriptionId: subscription.id,
              status,
              currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
            });
          }
        }
      }

      return reply.send({ received: true });
    });
  });
}
