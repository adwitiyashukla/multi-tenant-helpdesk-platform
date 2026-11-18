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

describe('workspace isolation', () => {
  it('hides another workspace conversation from the inbox', async () => {
    const acme = await createWorkspace(app, {
      organizationName: 'Acme',
      email: 'owner@acme.test',
    });
    const globex = await createWorkspace(app, {
      organizationName: 'Globex',
      email: 'owner@globex.test',
    });

    await seedConversation(app, acme.auth, { subject: 'Acme only ticket' });

    const list = await app.inject({
      method: 'GET',
      url: '/conversations',
      headers: globex.auth,
    });
    expect(list.json().items).toHaveLength(0);
  });

  it('returns not found rather than forbidden when reading across workspaces', async () => {
    const acme = await createWorkspace(app, {
      organizationName: 'Acme',
      email: 'owner@acme.test',
    });
    const globex = await createWorkspace(app, {
      organizationName: 'Globex',
      email: 'owner@globex.test',
    });
    const conversation = await seedConversation(app, acme.auth);

    const read = await app.inject({
      method: 'GET',
      url: `/conversations/${conversation.id}`,
      headers: globex.auth,
    });
    const messages = await app.inject({
      method: 'GET',
      url: `/conversations/${conversation.id}/messages`,
      headers: globex.auth,
    });

    expect(read.statusCode).toBe(404);
    expect(messages.statusCode).toBe(404);
  });

  it('blocks writes to another workspace conversation', async () => {
    const acme = await createWorkspace(app, {
      organizationName: 'Acme',
      email: 'owner@acme.test',
    });
    const globex = await createWorkspace(app, {
      organizationName: 'Globex',
      email: 'owner@globex.test',
    });
    const conversation = await seedConversation(app, acme.auth);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/conversations/${conversation.id}`,
      headers: globex.auth,
      payload: { status: 'closed' },
    });
    const replied = await app.inject({
      method: 'POST',
      url: `/conversations/${conversation.id}/messages`,
      headers: globex.auth,
      payload: { body: 'trying to write into another workspace', kind: 'reply' },
    });
    const tagged = await app.inject({
      method: 'POST',
      url: `/conversations/${conversation.id}/tags`,
      headers: globex.auth,
      payload: { name: 'hijack' },
    });

    expect(patched.statusCode).toBe(404);
    expect(replied.statusCode).toBe(404);
    expect(tagged.statusCode).toBe(404);

    const untouched = await app.inject({
      method: 'GET',
      url: `/conversations/${conversation.id}`,
      headers: acme.auth,
    });
    expect(untouched.json().status).toBe('open');
    expect(untouched.json().tags).toHaveLength(0);
  });

  it('keeps search results inside the workspace', async () => {
    const acme = await createWorkspace(app, {
      organizationName: 'Acme',
      email: 'owner@acme.test',
    });
    const globex = await createWorkspace(app, {
      organizationName: 'Globex',
      email: 'owner@globex.test',
    });
    await seedConversation(app, acme.auth, { subject: 'Refund for invoice 4402' });

    const results = await app.inject({
      method: 'GET',
      url: '/conversations?q=invoice',
      headers: globex.auth,
    });
    expect(results.json().items).toHaveLength(0);
  });

  it('keeps members, tags and metrics scoped to the workspace', async () => {
    const acme = await createWorkspace(app, {
      organizationName: 'Acme',
      email: 'owner@acme.test',
    });
    const globex = await createWorkspace(app, {
      organizationName: 'Globex',
      email: 'owner@globex.test',
    });
    await seedConversation(app, acme.auth);
    await app.inject({
      method: 'POST',
      url: '/tags',
      headers: acme.auth,
      payload: { name: 'acme-private' },
    });

    const members = await app.inject({ method: 'GET', url: '/members', headers: globex.auth });
    const tags = await app.inject({ method: 'GET', url: '/tags', headers: globex.auth });
    const metrics = await app.inject({ method: 'GET', url: '/metrics', headers: globex.auth });

    expect(members.json()).toHaveLength(1);
    expect(members.json()[0].email).toBe('owner@globex.test');
    expect(tags.json().map((tag: { name: string }) => tag.name)).not.toContain('acme-private');
    expect(metrics.json().open).toBe(0);
  });

  it('refuses an unknown or tampered session token', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const tampered = { authorization: `Bearer ${workspace.token.slice(0, -2)}xy` };
    const response = await app.inject({
      method: 'GET',
      url: '/conversations',
      headers: tampered,
    });
    expect(response.statusCode).toBe(401);
  });
});
