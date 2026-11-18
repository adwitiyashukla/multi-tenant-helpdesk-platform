import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

const devDatabaseUrl =
  process.env.DATABASE_URL ?? 'postgres://helpdesk:helpdesk@127.0.0.1:5432/helpdesk';
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? devDatabaseUrl.replace(/\/[^/?]+(\?.*)?$/, '/helpdesk_test$1');

process.env.TEST_DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
    globalSetup: ['./tests/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      WEB_ORIGIN: 'http://localhost:3000',
      SESSION_SECRET: 'test_session_secret_value_32_chars',
      INBOUND_EMAIL_SECRET: 'test_inbound_secret',
      INBOUND_EMAIL_DOMAIN: 'inbox.test',
      RATE_LIMIT_MAX: '100000',
      AUTH_RATE_LIMIT_MAX: '100000',
      LOG_LEVEL: 'fatal',
    },
  },
});
