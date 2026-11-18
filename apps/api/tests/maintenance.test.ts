import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { client, db, schema } from '../src/db/index.js';
import { markSlaBreaches, wakeSnoozedConversations } from '../src/services/maintenance.js';
import { createWorkspace, resetDatabase, seedConversation, type TestApp } from './helpers.js';

let app: TestApp;

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000);

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await client.end({ timeout: 5 });
});

beforeEach(async () => {
  await resetDatabase();
});

describe('sla sweep', () => {
  it('flags a conversation whose first response window has passed', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const conversation = await seedConversation(app, workspace.auth);

    await db
      .update(schema.conversations)
      .set({ slaDueAt: minutesAgo(5) })
      .where(eq(schema.conversations.id, conversation.id));

    const breached = await markSlaBreaches();
    expect(breached).toBe(1);

    const after = await app.inject({
      method: 'GET',
      url: `/conversations/${conversation.id}`,
      headers: workspace.auth,
    });
    expect(after.json().slaBreachedAt).not.toBeNull();

    const filtered = await app.inject({
      method: 'GET',
      url: '/conversations?breached=true',
      headers: workspace.auth,
    });
    expect(filtered.json().items).toHaveLength(1);
  });

  it('leaves a conversation alone once an agent has replied', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const conversation = await seedConversation(app, workspace.auth);

    await app.inject({
      method: 'POST',
      url: `/conversations/${conversation.id}/messages`,
      headers: workspace.auth,
      payload: { body: 'On it now.', kind: 'reply' },
    });
    await db
      .update(schema.conversations)
      .set({ slaDueAt: minutesAgo(5) })
      .where(eq(schema.conversations.id, conversation.id));

    expect(await markSlaBreaches()).toBe(0);
  });

  it('does not flag a closed conversation', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const conversation = await seedConversation(app, workspace.auth);

    await app.inject({
      method: 'PATCH',
      url: `/conversations/${conversation.id}`,
      headers: workspace.auth,
      payload: { status: 'closed' },
    });
    await db
      .update(schema.conversations)
      .set({ slaDueAt: minutesAgo(5) })
      .where(eq(schema.conversations.id, conversation.id));

    expect(await markSlaBreaches()).toBe(0);
  });

  it('flags each conversation only once', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const conversation = await seedConversation(app, workspace.auth);
    await db
      .update(schema.conversations)
      .set({ slaDueAt: minutesAgo(5) })
      .where(eq(schema.conversations.id, conversation.id));

    expect(await markSlaBreaches()).toBe(1);
    expect(await markSlaBreaches()).toBe(0);
  });
});

describe('snooze sweep', () => {
  it('reopens a conversation once its snooze has expired', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const conversation = await seedConversation(app, workspace.auth);

    await app.inject({
      method: 'PATCH',
      url: `/conversations/${conversation.id}`,
      headers: workspace.auth,
      payload: { status: 'snoozed', snoozedUntil: minutesAgo(1).toISOString() },
    });

    expect(await wakeSnoozedConversations()).toBe(1);

    const after = await app.inject({
      method: 'GET',
      url: `/conversations/${conversation.id}`,
      headers: workspace.auth,
    });
    expect(after.json().status).toBe('open');
    expect(after.json().snoozedUntil).toBeNull();
  });

  it('leaves a conversation snoozed until its time arrives', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const conversation = await seedConversation(app, workspace.auth);

    await app.inject({
      method: 'PATCH',
      url: `/conversations/${conversation.id}`,
      headers: workspace.auth,
      payload: {
        status: 'snoozed',
        snoozedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    });

    expect(await wakeSnoozedConversations()).toBe(0);
  });
});
