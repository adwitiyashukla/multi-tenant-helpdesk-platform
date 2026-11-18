import { buildApp } from './app.js';
import { client } from './db/index.js';
import { env } from './env.js';
import { logger } from './lib/logger.js';
import { redis } from './lib/redis.js';

const app = await buildApp();

try {
  await app.listen({ port: env.API_PORT, host: env.API_HOST });
} catch (error) {
  logger.error({ err: error }, 'failed to start api');
  process.exit(1);
}

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'shutting down');
  await app.close();
  await client.end({ timeout: 5 });
  redis.disconnect();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
