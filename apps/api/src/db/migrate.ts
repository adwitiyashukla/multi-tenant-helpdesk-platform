import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { client, db } from './index.js';

async function run() {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  });
  await client.end();
  process.stdout.write('migrations applied\n');
}

run().catch((error: unknown) => {
  const cause = error instanceof Error && error.cause ? `\ncause: ${String(error.cause)}` : '';
  process.stderr.write(`${String(error)}${cause}\n`);
  process.exit(1);
});
