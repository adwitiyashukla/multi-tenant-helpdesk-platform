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

describe('conversation lifecycle', () => {
  it('opens a conversation with a reference number and an sla clock', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const conversation = await seedConversation(app, workspace.auth);

    expect(conversation.reference).toBe(1);
    expect(conversation.status).toBe('open');
    expect(conversation.messageCount).toBe(1);
    expect(conversation.slaDueAt).not.toBeNull();
    expect(conversation.firstResponseAt).toBeNull();
    expect(conversation.snippet).toContain('reset link');
  });

  it('numbers conversations per workspace', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const first = await seedConversation(app, workspace.auth);
    const second = await seedConversation(app, workspace.auth, { subject: 'Second ticket' });
    expect(first.reference).toBe(1);
    expect(second.reference).toBe(2);
  });

  it('records the first response and stops the sla clock on an agent reply', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const conversation = await seedConversation(app, workspace.auth);

    const reply = await app.inject({
      method: 'POST',
      url: `/conversations/${conversation.id}/messages`,
      headers: workspace.auth,
      payload: { body: 'Sending you a fresh reset link now.', kind: 'reply' },
    });
    expect(reply.statusCode).toBe(201);

    const updated = await app.inject({
      method: 'GET',
      url: `/conversations/${conversation.id}`,
      headers: workspace.auth,
    });
    expect(updated.json().firstResponseAt).not.toBeNull();
    expect(updated.json().slaDueAt).toBeNull();
    expect(updated.json().messageCount).toBe(2);
  });

  it('treats an internal note as private and not a first response', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const conversation = await seedConversation(app, workspace.auth);

    await app.inject({
      method: 'POST',
      url: `/conversations/${conversation.id}/messages`,
      headers: workspace.auth,
      payload: { body: 'Checking with billing before we answer.', kind: 'note' },
    });

    const updated = await app.inject({
      method: 'GET',
      url: `/conversations/${conversation.id}`,
      headers: workspace.auth,
    });
    expect(updated.json().firstResponseAt).toBeNull();

    const messages = await app.inject({
      method: 'GET',
      url: `/conversations/${conversation.id}/messages`,
      headers: workspace.auth,
    });
    expect(messages.json().at(-1).kind).toBe('note');
  });

  it('closes a conversation and reopens it when the customer thread continues', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const conversation = await seedConversation(app, workspace.auth);

    const closed = await app.inject({
      method: 'PATCH',
      url: `/conversations/${conversation.id}`,
      headers: workspace.auth,
      payload: { status: 'closed' },
    });
    expect(closed.json().status).toBe('closed');
    expect(closed.json().resolvedAt).not.toBeNull();

    await app.inject({
      method: 'POST',
      url: `/conversations/${conversation.id}/messages`,
      headers: workspace.auth,
      payload: { body: 'Reopening to confirm the fix landed.', kind: 'reply' },
    });

    const reopened = await app.inject({
      method: 'GET',
      url: `/conversations/${conversation.id}`,
      headers: workspace.auth,
    });
    expect(reopened.json().status).toBe('open');
    expect(reopened.json().resolvedAt).toBeNull();
  });

  it('assigns a conversation and filters the inbox by assignee', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const mine = await seedConversation(app, workspace.auth);
    await seedConversation(app, workspace.auth, {
      subject: 'Unassigned ticket',
      customerEmail: 'other@customer.test',
    });

    await app.inject({
      method: 'PATCH',
      url: `/conversations/${mine.id}`,
      headers: workspace.auth,
      payload: { assigneeId: workspace.user.id },
    });

    const assigned = await app.inject({
      method: 'GET',
      url: '/conversations?assignee=me',
      headers: workspace.auth,
    });
    const unassigned = await app.inject({
      method: 'GET',
      url: '/conversations?assignee=none',
      headers: workspace.auth,
    });

    expect(assigned.json().items).toHaveLength(1);
    expect(assigned.json().items[0].assignee.id).toBe(workspace.user.id);
    expect(unassigned.json().items).toHaveLength(1);
  });

  it('recomputes the sla target when priority is raised', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const conversation = await seedConversation(app, workspace.auth, { priority: 'low' });
    const before = new Date(conversation.slaDueAt).getTime();

    const raised = await app.inject({
      method: 'PATCH',
      url: `/conversations/${conversation.id}`,
      headers: workspace.auth,
      payload: { priority: 'urgent' },
    });

    expect(new Date(raised.json().slaDueAt).getTime()).toBeLessThan(before);
  });

  it('adds and removes tags', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const conversation = await seedConversation(app, workspace.auth);

    const tagged = await app.inject({
      method: 'POST',
      url: `/conversations/${conversation.id}/tags`,
      headers: workspace.auth,
      payload: { name: 'billing' },
    });
    expect(tagged.json().tags).toContain('billing');

    const filtered = await app.inject({
      method: 'GET',
      url: '/conversations?tag=billing',
      headers: workspace.auth,
    });
    expect(filtered.json().items).toHaveLength(1);

    const untagged = await app.inject({
      method: 'DELETE',
      url: `/conversations/${conversation.id}/tags/billing`,
      headers: workspace.auth,
    });
    expect(untagged.json().tags).not.toContain('billing');
  });

  it('pages the inbox with a stable keyset cursor', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    for (let index = 0; index < 7; index += 1) {
      await seedConversation(app, workspace.auth, {
        subject: `Ticket number ${index}`,
        customerEmail: `person${index}@customer.test`,
      });
    }

    const first = await app.inject({
      method: 'GET',
      url: '/conversations?limit=3',
      headers: workspace.auth,
    });
    expect(first.json().items).toHaveLength(3);
    expect(first.json().nextCursor).not.toBeNull();

    const second = await app.inject({
      method: 'GET',
      url: `/conversations?limit=3&cursor=${encodeURIComponent(first.json().nextCursor)}`,
      headers: workspace.auth,
    });
    const firstIds = first.json().items.map((item: { id: string }) => item.id);
    const secondIds = second.json().items.map((item: { id: string }) => item.id);
    expect(secondIds.some((id: string) => firstIds.includes(id))).toBe(false);
  });

  it('rejects an empty update and an unknown conversation', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const conversation = await seedConversation(app, workspace.auth);

    const empty = await app.inject({
      method: 'PATCH',
      url: `/conversations/${conversation.id}`,
      headers: workspace.auth,
      payload: {},
    });
    const missing = await app.inject({
      method: 'GET',
      url: '/conversations/6f1b7a5e-0000-4000-8000-000000000000',
      headers: workspace.auth,
    });

    expect(empty.statusCode).toBe(400);
    expect(missing.statusCode).toBe(404);
  });
});
