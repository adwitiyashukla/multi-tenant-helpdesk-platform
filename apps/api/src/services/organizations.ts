import { type Organization, planLimits } from '@helpdesk/contracts';
import { count, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { env } from '../env.js';

const defaultTags = [
  { name: 'billing', color: 'amber' },
  { name: 'bug', color: 'rose' },
  { name: 'onboarding', color: 'sky' },
  { name: 'feature-request', color: 'violet' },
];

const defaultCannedReplies = [
  {
    title: 'Acknowledge',
    body: 'Thanks for reaching out. I am looking into this now and will follow up shortly.',
  },
  {
    title: 'Need more detail',
    body: 'Could you share the steps you took and any error message you saw? That will help me track this down.',
  },
  {
    title: 'Resolved',
    body: 'This should be working now. Let me know if you run into it again and I will reopen the ticket.',
  },
];

export function inboundAddress(slug: string): string {
  return `${slug}@${env.INBOUND_EMAIL_DOMAIN}`;
}

export async function countSeats(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(schema.memberships)
    .where(eq(schema.memberships.organizationId, organizationId));
  return row?.value ?? 0;
}

export async function seedOrganizationDefaults(organizationId: string, createdBy: string) {
  await db.insert(schema.tags).values(defaultTags.map((tag) => ({ ...tag, organizationId })));
  await db
    .insert(schema.cannedReplies)
    .values(defaultCannedReplies.map((reply) => ({ ...reply, organizationId, createdBy })));
}

export function serializeOrganization(
  organization: {
    id: string;
    name: string;
    slug: string;
    plan: 'free' | 'pro';
    seatLimit: number;
  },
  seatsUsed: number,
): Organization {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    plan: organization.plan,
    seatsUsed,
    seatLimit: organization.seatLimit || planLimits[organization.plan].seats,
    inboundAddress: inboundAddress(organization.slug),
  };
}
