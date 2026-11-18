import { sql } from 'drizzle-orm';
import type { buildApp } from '../src/app.js';
import { db } from '../src/db/index.js';

export type TestApp = Awaited<ReturnType<typeof buildApp>>;

export async function resetDatabase() {
  await db.execute(sql`truncate table organizations, users restart identity cascade`);
}

export async function createWorkspace(
  app: TestApp,
  options: { organizationName?: string; name?: string; email: string; password?: string },
) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: {
      organizationName: options.organizationName ?? 'Acme Support',
      name: options.name ?? 'Owner User',
      email: options.email,
      password: options.password ?? 'supersecret123',
    },
  });
  const body = response.json();
  return {
    token: body.token as string,
    user: body.user as { id: string; name: string; email: string },
    organization: body.organization as { id: string; slug: string; seatLimit: number },
    auth: { authorization: `Bearer ${body.token}` },
  };
}

export async function seedConversation(
  app: TestApp,
  headers: Record<string, string>,
  overrides: Partial<{
    subject: string;
    customerEmail: string;
    body: string;
    priority: string;
  }> = {},
) {
  const response = await app.inject({
    method: 'POST',
    url: '/conversations',
    headers,
    payload: {
      subject: overrides.subject ?? 'Cannot reset my password',
      customerEmail: overrides.customerEmail ?? 'dana@customer.test',
      customerName: 'Dana Fields',
      body: overrides.body ?? 'I clicked the reset link three times and nothing arrives.',
      priority: overrides.priority ?? 'normal',
    },
  });
  return response.json();
}
