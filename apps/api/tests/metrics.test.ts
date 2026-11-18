import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { client } from '../src/db/index.js';
import { redis } from '../src/lib/redis.js';
import { createWorkspace, resetDatabase, seedConversation, type TestApp } from './helpers.js';

let app: TestApp;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  redis.disconnect();
  await client.end({ timeout: 5 });
});

beforeEach(async () => {
  await resetDatabase();
});

describe('workspace metrics', () => {
  it('counts open conversations and resolved ones separately', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const first = await seedConversation(app, workspace.auth);
    await seedConversation(app, workspace.auth, {
      subject: 'Second ticket',
      customerEmail: 'second@customer.test',
    });
    await app.inject({
      method: 'PATCH',
      url: `/conversations/${first.id}`,
      headers: workspace.auth,
      payload: { status: 'closed' },
    });

    const metrics = await app.inject({ method: 'GET', url: '/metrics', headers: workspace.auth });
    expect(metrics.json().open).toBe(1);
    expect(metrics.json().closedToday).toBe(1);
  });

  it('reflects a new conversation straight away rather than serving a stale cache', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });

    const before = await app.inject({ method: 'GET', url: '/metrics', headers: workspace.auth });
    expect(before.json().open).toBe(0);

    await seedConversation(app, workspace.auth);

    const after = await app.inject({ method: 'GET', url: '/metrics', headers: workspace.auth });
    expect(after.json().open).toBe(1);
  });

  it('reports a median first response time once an agent has replied', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const conversation = await seedConversation(app, workspace.auth);

    const empty = await app.inject({ method: 'GET', url: '/metrics', headers: workspace.auth });
    expect(empty.json().medianFirstResponseMinutes).toBeNull();

    await app.inject({
      method: 'POST',
      url: `/conversations/${conversation.id}/messages`,
      headers: workspace.auth,
      payload: { body: 'Looking into it.', kind: 'reply' },
    });

    const filled = await app.inject({ method: 'GET', url: '/metrics', headers: workspace.auth });
    expect(filled.json().medianFirstResponseMinutes).not.toBeNull();
  });

  it('returns fourteen days of volume regardless of activity', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const metrics = await app.inject({ method: 'GET', url: '/metrics', headers: workspace.auth });
    expect(metrics.json().volumeByDay).toHaveLength(14);
  });
});
