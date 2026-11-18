import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { client } from '../src/db/index.js';
import { createWorkspace, resetDatabase, type TestApp } from './helpers.js';

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

describe('signup and login', () => {
  it('creates an organization with the signing up user as owner', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    expect(workspace.organization.slug).toMatch(/^acme-support-[0-9a-f]{6}$/);

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: workspace.auth });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.role).toBe('owner');
    expect(me.json().organization.seatsUsed).toBe(1);
  });

  it('seeds default tags and canned replies for a new workspace', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const tags = await app.inject({ method: 'GET', url: '/tags', headers: workspace.auth });
    const canned = await app.inject({
      method: 'GET',
      url: '/canned-replies',
      headers: workspace.auth,
    });
    expect(tags.json().length).toBeGreaterThan(0);
    expect(canned.json().length).toBeGreaterThan(0);
  });

  it('rejects a duplicate email', async () => {
    await createWorkspace(app, { email: 'owner@acme.test' });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        organizationName: 'Other',
        name: 'Other User',
        email: 'owner@acme.test',
        password: 'supersecret123',
      },
    });
    expect(response.statusCode).toBe(409);
  });

  it('rejects a short password', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        organizationName: 'Acme',
        name: 'Owner',
        email: 'owner@acme.test',
        password: 'short',
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects a wrong password without leaking which field failed', async () => {
    await createWorkspace(app, { email: 'owner@acme.test' });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'owner@acme.test', password: 'wrongpassword' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe('invalid email or password');
  });

  it('invalidates the session on logout', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    await app.inject({ method: 'POST', url: '/auth/logout', headers: workspace.auth });
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: workspace.auth });
    expect(me.statusCode).toBe(401);
  });
});

describe('invites and roles', () => {
  it('lets an invited agent join and scopes their permissions', async () => {
    const owner = await createWorkspace(app, { email: 'owner@acme.test' });
    const invite = await app.inject({
      method: 'POST',
      url: '/members/invites',
      headers: owner.auth,
      payload: { email: 'agent@acme.test', role: 'agent' },
    });
    expect(invite.statusCode).toBe(201);

    const accepted = await app.inject({
      method: 'POST',
      url: '/auth/invites/accept',
      payload: {
        token: invite.json().token,
        name: 'Agent Smith',
        password: 'anotherpassword1',
      },
    });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json().user.role).toBe('agent');

    const agentAuth = { authorization: `Bearer ${accepted.json().token}` };
    const forbidden = await app.inject({
      method: 'POST',
      url: '/members/invites',
      headers: agentAuth,
      payload: { email: 'third@acme.test', role: 'agent' },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('stops invites once the plan seat limit is reached', async () => {
    const owner = await createWorkspace(app, { email: 'owner@acme.test' });
    const first = await app.inject({
      method: 'POST',
      url: '/members/invites',
      headers: owner.auth,
      payload: { email: 'one@acme.test', role: 'agent' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/members/invites',
      headers: owner.auth,
      payload: { email: 'two@acme.test', role: 'agent' },
    });
    const third = await app.inject({
      method: 'POST',
      url: '/members/invites',
      headers: owner.auth,
      payload: { email: 'three@acme.test', role: 'agent' },
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(third.statusCode).toBe(402);
  });

  it('rejects an expired or unknown invite token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/invites/accept',
      payload: {
        token: 'x'.repeat(32),
        name: 'Nobody',
        password: 'anotherpassword1',
      },
    });
    expect(response.statusCode).toBe(400);
  });
});
