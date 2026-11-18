import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { client } from '../src/db/index.js';
import { createWorkspace, resetDatabase, seedConversation, type TestApp } from './helpers.js';

let app: TestApp;

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

describe('full text search', () => {
  it('matches on the subject line', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    await seedConversation(app, workspace.auth, { subject: 'Duplicate charge on my invoice' });
    await seedConversation(app, workspace.auth, {
      subject: 'Shipping delay',
      customerEmail: 'other@customer.test',
    });

    const results = await app.inject({
      method: 'GET',
      url: '/conversations?q=invoice',
      headers: workspace.auth,
    });
    expect(results.json().items).toHaveLength(1);
    expect(results.json().items[0].subject).toContain('invoice');
  });

  it('matches on words inside a message body', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const conversation = await seedConversation(app, workspace.auth, {
      subject: 'Generic subject',
      body: 'The webhook retries stopped after the deployment on Tuesday.',
    });

    const results = await app.inject({
      method: 'GET',
      url: '/conversations?q=webhook',
      headers: workspace.auth,
    });
    expect(results.json().items).toHaveLength(1);
    expect(results.json().items[0].id).toBe(conversation.id);
  });

  it('matches replies added after the conversation was opened', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const conversation = await seedConversation(app, workspace.auth, { subject: 'Plain subject' });
    await app.inject({
      method: 'POST',
      url: `/conversations/${conversation.id}/messages`,
      headers: workspace.auth,
      payload: { body: 'I refunded the duplicate transaction today.', kind: 'reply' },
    });

    const results = await app.inject({
      method: 'GET',
      url: '/conversations?q=refunded',
      headers: workspace.auth,
    });
    expect(results.json().items).toHaveLength(1);
  });

  it('returns nothing for a term that appears nowhere', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    await seedConversation(app, workspace.auth);

    const results = await app.inject({
      method: 'GET',
      url: '/conversations?q=kubernetes',
      headers: workspace.auth,
    });
    expect(results.json().items).toHaveLength(0);
  });

  it('combines search with a status filter', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const open = await seedConversation(app, workspace.auth, { subject: 'Password reset broken' });
    const closed = await seedConversation(app, workspace.auth, {
      subject: 'Password reset question',
      customerEmail: 'second@customer.test',
    });
    await app.inject({
      method: 'PATCH',
      url: `/conversations/${closed.id}`,
      headers: workspace.auth,
      payload: { status: 'closed' },
    });

    const results = await app.inject({
      method: 'GET',
      url: '/conversations?q=password&status=open',
      headers: workspace.auth,
    });
    expect(results.json().items).toHaveLength(1);
    expect(results.json().items[0].id).toBe(open.id);
  });
});
