import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL as string);
  const name = url.pathname.slice(1);

  const admin = new URL(url);
  admin.pathname = '/postgres';
  const adminSql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  const found = await adminSql`select 1 from pg_database where datname = ${name}`;
  if (found.length === 0) {
    await adminSql.unsafe(`create database "${name}"`);
  }
  await adminSql.end();

  const sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  await migrate(drizzle(sql), {
    migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
  });
  await sql.end();
}
