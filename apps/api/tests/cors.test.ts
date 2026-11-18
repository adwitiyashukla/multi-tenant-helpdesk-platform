import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { client } from '../src/db/index.js';
import type { TestApp } from './helpers.js';

let app: TestApp;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await client.end({ timeout: 5 });
});

describe('cross origin requests from the web app', () => {
  it('allows every method the web app actually uses', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/conversations/11111111-1111-4111-8111-111111111111',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'content-type',
      },
    });

    const allowed = String(response.headers['access-control-allow-methods']);
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      expect(allowed).toContain(method);
    }
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('does not reflect an origin that is not configured', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/conversations',
      headers: {
        origin: 'http://evil.example.com',
        'access-control-request-method': 'GET',
      },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
