import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env.js';
import * as schema from './schema.js';

export const client = postgres(env.DATABASE_URL, {
  max: env.NODE_ENV === 'test' ? 5 : 20,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {},
});

export const db = drizzle(client, { schema });

export type Db = typeof db;
export { schema };
