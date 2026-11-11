// Seeds a demo account and the sample Mutua Kioko homestead from the designs.
// Usage: npm run seed  (login: demo@mbai.app / demo12345)
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../app.module';
import { DbService } from './db.service';
import { FamilyService } from '../family/family.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const db = app.get(DbService);
  const fam = app.get(FamilyService);
  await db.migrate();

  const email = 'demo@mbai.app';
  const [existing] = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing) {
    console.log('Demo data already exists. Login: demo@mbai.app / demo12345');
    await app.close();
    return;
  }
  const [user] = await db.query('INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id', [
    email,
    await bcrypt.hash('demo12345', 12),
    'Demo User',
  ]);
  const [tree] = await db.query('INSERT INTO trees (name, created_by) VALUES ($1,$2) RETURNING id', ['Kioko family (demo)', user.id]);
  await db.query(`INSERT INTO tree_members (tree_id, user_id, role) VALUES ($1,$2,'admin')`, [tree.id, user.id]);
  const t = tree.id;

  const mutua = await fam.createPerson(t, { firstName: 'Mutua', otherNames: 'Kioko', sex: 'M', birthYear: 1952, deathYear: 2019 });
  const marry = (bride: string, extra: object = {}) =>
    fam.recordMarriage(t, { mode: 'head', husbandId: mutua.id, form: 'customary', bride: { new: { firstName: bride.split(' ')[0], otherNames: bride.split(' ')[1], sex: 'F' } }, ...extra });

  const h1 = await marry('Mwende Mutua', { startedOn: '1974-08-01' });
  const h2 = await marry('Ndinda Mutua', { startedOn: '1981-05-01' });
  const h3 = await marry('Syokau Mutua', { startedOn: '1990-03-01', form: 'civil' });
  const h4 = await marry('Nduku Kilonzo', { startedOn: '1995-01-01' });
  await fam.endMarriage(h4.id, { reason: 'divorce', endedOn: '2001-01-01' });
  const h2a = await fam.recordMarriage(t, {
    mode: 'wife',
    sponsorHouseId: h2.id,
    startedOn: '2004-08-01',
    bride: { new: { firstName: 'Kavata', otherNames: 'Musau', sex: 'F', birthYear: 1983, clan: 'Ambua' } },
  });

  const child = (houseId: string, name: string, sex: 'M' | 'F', birthYear: number, father: any = { kind: 'head' }) =>
    fam.addChild(t, { houseId, child: { firstName: name, otherNames: 'Mutua', sex, birthYear }, father });

  await child(h1.id, 'Musyoka', 'M', 1976);
  await child(h1.id, 'Wanza', 'F', 1979);
  await child(h1.id, 'Kyalo', 'M', 1983);
  await child(h3.id, 'Nthenya', 'F', 1992);
  const nzioka = { kind: 'person', restricted: true, person: { new: { firstName: 'Nzioka', otherNames: 'Kilonzo', sex: 'M' } } };
  const mbithe = await child(h2a.id, 'Mbithe', 'F', 2005, nzioka);
  const [father] = await db.query(`SELECT parent_id FROM parent_links WHERE child_id = $1 AND restricted`, [mbithe.id]);
  await child(h2a.id, 'Kalekye', 'F', 2008, { kind: 'person', restricted: true, person: { id: father.parent_id } });

  console.log('Seeded the Mutua Kioko homestead. Login: demo@mbai.app / demo12345');
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
