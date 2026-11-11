import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/main';
import { DbService } from '../src/db/db.service';

export async function setup() {
  const app = await createApp();
  await app.init();
  const db = app.get(DbService);
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await db.migrate();
  return app;
}

/** A signed-in API client with one tree. */
export async function client(app: INestApplication, email = 'sylvester@example.com') {
  const server = app.getHttpServer();
  const reg = await request(server).post('/api/auth/register').send({ email, password: 'password123', name: 'Test User' });
  const token = reg.body.token as string;
  const call = (method: 'get' | 'post' | 'patch', url: string, body?: unknown) => {
    const r = request(server)[method]('/api' + url).set('Authorization', `Bearer ${token}`);
    return body === undefined ? r : r.send(body as object);
  };
  return { call, token, user: reg.body.user };
}

export const person = (firstName: string, otherNames: string, sex: 'M' | 'F', extra: Record<string, unknown> = {}) => ({
  firstName,
  otherNames,
  sex,
  ...extra,
});
