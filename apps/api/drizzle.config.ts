import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://helpdesk:helpdesk@localhost:5432/helpdesk',
  },
  strict: true,
  verbose: true,
});
