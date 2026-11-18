import { Redis } from 'ioredis';
import { env } from '../env.js';

export function createRedis(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
}

export const redis = createRedis();
