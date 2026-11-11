import { DbService } from './db.service';

async function main() {
  const db = new DbService();
  const applied = await db.migrate();
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date');
  await db.pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
