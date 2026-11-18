import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { client } from '../src/db/index.js';
import { createWorkspace, resetDatabase, type TestApp } from './helpers.js';

let app: TestApp;

beforeAll(async () => {
  app = await buildApp({ authRateLimitMax: 3 });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await client.end({ timeout: 5 });
});

beforeEach(async () => {
  await resetDatabase();
});

describe('login rate limiting', () => {
  it('locks out repeated password guesses from the same address', async () => {
    await createWorkspace(app, { email: 'owner@acme.test' });

    const attempt = () =>
      app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'owner@acme.test', password: 'wrongpassword' },
      });

    const statuses: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const response = await attempt();
      statuses.push(response.statusCode);
    }

    expect(statuses.filter((status) => status === 401).length).toBeGreaterThan(0);
    expect(statuses.at(-1)).toBe(429);
  });
});
