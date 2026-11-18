import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { client } from '../src/db/index.js';
import { createWorkspace, resetDatabase, type TestApp } from './helpers.js';

let app: TestApp;

const secret = { 'x-inbound-secret': 'test_inbound_secret' };

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

describe('inbound email', () => {
  it('rejects a request without the shared secret', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/inbound/email',
      payload: {
        to: 'anything@inbox.test',
        from: 'dana@customer.test',
        subject: 'Hello',
        text: 'Anyone there',
      },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects an unknown inbox address', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/inbound/email',
      headers: secret,
      payload: {
        to: 'nobody-here@inbox.test',
        from: 'dana@customer.test',
        subject: 'Hello',
        text: 'Anyone there',
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('opens a conversation for a new customer', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const response = await app.inject({
      method: 'POST',
      url: '/inbound/email',
      headers: secret,
      payload: {
        to: `${workspace.organization.slug}@inbox.test`,
        from: 'dana@customer.test',
        fromName: 'Dana Fields',
        subject: 'Billing looks wrong',
        text: 'I was charged twice this month.',
      },
    });

    expect(response.statusCode).toBe(201);
    const list = await app.inject({
      method: 'GET',
      url: '/conversations',
      headers: workspace.auth,
    });
    expect(list.json().items).toHaveLength(1);
    expect(list.json().items[0].customer.email).toBe('dana@customer.test');
    expect(list.json().items[0].customer.name).toBe('Dana Fields');
  });

  it('threads a follow up onto the open conversation instead of opening a new one', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const address = `${workspace.organization.slug}@inbox.test`;

    await app.inject({
      method: 'POST',
      url: '/inbound/email',
      headers: secret,
      payload: {
        to: address,
        from: 'dana@customer.test',
        subject: 'Billing looks wrong',
        text: 'I was charged twice this month.',
      },
    });
    await app.inject({
      method: 'POST',
      url: '/inbound/email',
      headers: secret,
      payload: {
        to: address,
        from: 'dana@customer.test',
        subject: 'Billing looks wrong',
        text: 'Adding the invoice numbers: 4402 and 4403.',
      },
    });

    const list = await app.inject({
      method: 'GET',
      url: '/conversations',
      headers: workspace.auth,
    });
    expect(list.json().items).toHaveLength(1);
    expect(list.json().items[0].messageCount).toBe(2);
  });

  it('ignores a redelivery of the same provider message id', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const address = `${workspace.organization.slug}@inbox.test`;
    const payload = {
      to: address,
      from: 'dana@customer.test',
      subject: 'Billing looks wrong',
      text: 'I was charged twice this month.',
      externalId: 'provider-message-1',
    };

    const first = await app.inject({
      method: 'POST',
      url: '/inbound/email',
      headers: secret,
      payload,
    });
    const second = await app.inject({
      method: 'POST',
      url: '/inbound/email',
      headers: secret,
      payload,
    });

    expect(first.statusCode).toBe(201);
    expect(second.json().status).toBe('duplicate');

    const list = await app.inject({
      method: 'GET',
      url: '/conversations',
      headers: workspace.auth,
    });
    expect(list.json().items).toHaveLength(1);
    expect(list.json().items[0].messageCount).toBe(1);
  });

  it('reopens a closed thread when the customer writes again', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const address = `${workspace.organization.slug}@inbox.test`;
    const payload = {
      to: address,
      from: 'dana@customer.test',
      subject: 'Billing looks wrong',
      text: 'I was charged twice this month.',
    };

    const created = await app.inject({
      method: 'POST',
      url: '/inbound/email',
      headers: secret,
      payload,
    });
    const conversationId = created.json().conversationId;
    await app.inject({
      method: 'PATCH',
      url: `/conversations/${conversationId}`,
      headers: workspace.auth,
      payload: { status: 'pending' },
    });
    await app.inject({
      method: 'POST',
      url: '/inbound/email',
      headers: secret,
      payload: { ...payload, text: 'Still waiting on this one.' },
    });

    const conversation = await app.inject({
      method: 'GET',
      url: `/conversations/${conversationId}`,
      headers: workspace.auth,
    });
    expect(conversation.json().status).toBe('open');
    expect(conversation.json().messageCount).toBe(2);
  });
});
