import { randomUUID } from 'node:crypto';
import { planLimits } from '@helpdesk/contracts';
import { eq, sql } from 'drizzle-orm';
import { hashPassword } from '../lib/password.js';
import { uniqueSlug } from '../lib/slug.js';
import { seedOrganizationDefaults } from '../services/organizations.js';
import { firstResponseDueAt } from '../services/sla.js';
import { client, db, schema } from './index.js';

const tickets = [
  {
    subject: 'Password reset email never arrives',
    body: 'I have tried three times today and nothing lands in my inbox. I checked spam as well.',
    reply:
      'I can see the failed sends in our logs. I pushed a fix and sent you a fresh reset link.',
  },
  {
    subject: 'Charged twice for the March invoice',
    body: 'Our finance team flagged two identical charges on the same day. Can you take a look.',
    reply: 'You were billed twice by mistake. I refunded the second charge, it lands in five days.',
  },
  {
    subject: 'Webhook retries stopped after the deploy',
    body: 'Everything worked until Tuesday afternoon, then deliveries stopped with no error on our side.',
    reply: 'A queue worker was stuck on our end. Retries are flowing again, please confirm.',
  },
  {
    subject: 'How do I export my data',
    body: 'We need a full export before the end of the quarter for our audit.',
    reply: 'Settings has an export button that emails you a zip. I started one for your workspace.',
  },
  {
    subject: 'SSO login loops back to the sign in page',
    body: 'It redirects back to the login screen every time, on both Chrome and Safari.',
    reply: 'Your identity provider was sending an old callback URL. I updated it, try again now.',
  },
  {
    subject: 'Refund request for order 88213',
    body: 'The customer changed their mind inside the return window and is asking for the money back.',
    reply: 'Refund processed for order 88213. The customer will see it on their statement shortly.',
  },
  {
    subject: 'API returns 429 on the free plan',
    body: 'We are well under the documented limit but still get rate limited after about twenty calls.',
    reply: 'The limit was counting retries twice. I raised your ceiling and corrected the counter.',
  },
  {
    subject: 'Team member cannot see shared views',
    body: 'She accepted the invite but the shared view is still empty for her.',
    reply:
      'Her invite landed on the wrong workspace. I moved the account over, she has access now.',
  },
  {
    subject: 'Mobile app crashes when opening reports',
    body: 'It closes right after the loading spinner. It happens on two different phones.',
    reply:
      'That crash came from a bad chart config. The fix is in build 4.2.1, out this afternoon.',
  },
  {
    subject: 'Billing address is wrong on the receipt',
    body: 'The street is right but the city and postcode belong to our old office.',
    reply: 'I corrected the address on your billing profile and reissued the last two receipts.',
  },
  {
    subject: 'Cannot upload files larger than 5 MB',
    body: 'Anything bigger than five megabytes fails with a generic error after about ten seconds.',
    reply: 'Upload limits are per plan. I lifted yours to fifty megabytes, give it another try.',
  },
  {
    subject: 'Notifications arrive hours late',
    body: 'Alerts that should be instant show up three or four hours after the event.',
    reply:
      'Our notification queue was backed up overnight. It is drained and running in real time.',
  },
];

const names = [
  'Dana Fields',
  'Marcus Webb',
  'Priya Raman',
  'Tom Alvarez',
  'Hannah Cole',
  'Wei Zhang',
  'Sofia Duarte',
  'Ibrahim Khan',
  'Grace Miller',
  'Noah Bennett',
];

const pick = <T>(list: readonly T[], index: number): T => list[index % list.length] as T;
const randomInt = (max: number) => Math.floor(Math.random() * max);

const reset = process.argv.includes('--reset');
const conversationCount = Number(
  process.argv.find((arg) => arg.startsWith('--conversations='))?.split('=')[1] ?? 60,
);
const batchSize = 1000;

async function run() {
  const started = Date.now();

  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, 'demo@helpdesk.test'))
    .limit(1);

  if (existing && !reset) {
    await client.end();
    process.stdout.write('demo workspace already exists, run pnpm db:seed --reset to rebuild it\n');
    return;
  }

  if (reset) {
    await db.execute(sql`truncate table organizations, users restart identity cascade`);
  }

  const password = await hashPassword('demo-password-123');

  const [organization] = await db
    .insert(schema.organizations)
    .values({
      name: 'Northwind Support',
      slug: uniqueSlug('Northwind Support'),
      plan: 'pro',
      seatLimit: planLimits.pro.seats,
      subscriptionStatus: 'active',
    })
    .returning();

  const agentRows = [
    { email: 'demo@helpdesk.test', name: 'Demo Owner', role: 'owner' as const },
    { email: 'rosa@helpdesk.test', name: 'Rosa Lindqvist', role: 'admin' as const },
    { email: 'yuki@helpdesk.test', name: 'Yuki Tanaka', role: 'agent' as const },
    { email: 'sam@helpdesk.test', name: 'Sam Okoro', role: 'agent' as const },
  ];

  const users = await db
    .insert(schema.users)
    .values(
      agentRows.map((agent) => ({ email: agent.email, name: agent.name, passwordHash: password })),
    )
    .returning({ id: schema.users.id });

  await db.insert(schema.memberships).values(
    users.map((user, index) => ({
      organizationId: organization!.id,
      userId: user.id,
      role: agentRows[index]!.role,
    })),
  );

  await seedOrganizationDefaults(organization!.id, users[0]!.id);

  const tagRows = await db
    .select({ id: schema.tags.id })
    .from(schema.tags)
    .where(eq(schema.tags.organizationId, organization!.id));

  const customerCount = Math.max(10, Math.floor(conversationCount / 4));
  const customerValues = Array.from({ length: customerCount }, (_, index) => ({
    id: randomUUID(),
    organizationId: organization!.id,
    email: `customer${index}@example.com`,
    name: pick(names, index),
  }));

  for (let offset = 0; offset < customerValues.length; offset += batchSize) {
    await db.insert(schema.customers).values(customerValues.slice(offset, offset + batchSize));
  }

  const now = Date.now();
  const windowMs = 14 * 24 * 60 * 60 * 1000;
  const priorities = ['low', 'normal', 'normal', 'high', 'urgent'] as const;

  const conversations: Array<typeof schema.conversations.$inferInsert> = [];
  const messages: Array<typeof schema.messages.$inferInsert> = [];
  const conversationTags: Array<typeof schema.conversationTags.$inferInsert> = [];

  for (let index = 0; index < conversationCount; index += 1) {
    const id = randomUUID();
    const customer = customerValues[index % customerValues.length]!;
    const createdAt = new Date(now - randomInt(windowMs));
    const ticket = pick(tickets, index);
    const priority = pick(priorities, index + randomInt(5));
    const agent = users[1 + (Math.floor(index / 3) % (users.length - 1))]!;

    const respondedAt = new Date(createdAt.getTime() + (5 + randomInt(240)) * 60 * 1000);
    const answered = index % 10 !== 0 && respondedAt.getTime() <= now;
    const firstResponseAt = answered ? respondedAt : null;

    const closedAt = firstResponseAt
      ? new Date(firstResponseAt.getTime() + (20 + randomInt(600)) * 60 * 1000)
      : null;
    const closed = index % 3 === 0 && closedAt !== null && closedAt.getTime() <= now;
    const resolvedAt = closed ? closedAt : null;
    const lastMessageAt = resolvedAt ?? firstResponseAt ?? createdAt;
    const slaDueAt = firstResponseAt ? null : firstResponseDueAt(priority, createdAt);

    conversations.push({
      id,
      organizationId: organization!.id,
      reference: index + 1,
      subject: ticket.subject,
      status: closed ? 'closed' : index % 5 === 0 ? 'pending' : 'open',
      priority,
      customerId: customer.id,
      assigneeId: index % 4 === 0 ? null : agent.id,
      snippet: ticket.body.slice(0, 160),
      messageCount: firstResponseAt ? 2 : 1,
      createdAt,
      lastMessageAt,
      firstResponseAt,
      resolvedAt,
      slaDueAt,
      slaBreachedAt:
        slaDueAt && slaDueAt.getTime() < now ? new Date(slaDueAt.getTime() + 60000) : null,
    });

    messages.push({
      organizationId: organization!.id,
      conversationId: id,
      kind: 'inbound',
      body: ticket.body,
      customerId: customer.id,
      createdAt,
    });

    if (firstResponseAt) {
      messages.push({
        organizationId: organization!.id,
        conversationId: id,
        kind: 'reply',
        body: ticket.reply,
        authorId: agent.id,
        createdAt: firstResponseAt,
      });
    }

    if (index % 2 === 0 && tagRows.length > 0) {
      conversationTags.push({
        conversationId: id,
        tagId: pick(tagRows, Math.floor(index / 2)).id,
      });
    }
  }

  for (let offset = 0; offset < conversations.length; offset += batchSize) {
    await db.insert(schema.conversations).values(conversations.slice(offset, offset + batchSize));
  }
  for (let offset = 0; offset < messages.length; offset += batchSize) {
    await db.insert(schema.messages).values(messages.slice(offset, offset + batchSize));
  }
  for (let offset = 0; offset < conversationTags.length; offset += batchSize) {
    await db
      .insert(schema.conversationTags)
      .values(conversationTags.slice(offset, offset + batchSize));
  }

  await db
    .update(schema.organizations)
    .set({ conversationSeq: conversationCount })
    .where(eq(schema.organizations.id, organization!.id));

  await db.execute(sql`analyze conversations, messages`);
  await client.end();

  process.stdout.write(
    `seeded ${conversationCount} conversations and ${messages.length} messages in ${(
      (Date.now() - started) / 1000
    ).toFixed(1)}s\nlogin: demo@helpdesk.test / demo-password-123\n`,
  );
}

run().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
