import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { migrations } from './migrations';

export type Q = <T extends QueryResultRow = any>(sql: string, params?: unknown[]) => Promise<T[]>;

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
  }

  query: Q = async (sql, params) => (await this.pool.query(sql, params as any[])).rows;

  /** Runs fn in one transaction; everything inside sees the same snapshot. */
  async tx<T>(fn: (q: Q, client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const q: Q = async (sql, params) => (await client.query(sql, params as any[])).rows;
      const result = await fn(q, client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async migrate(): Promise<string[]> {
    return this.tx(async (q) => {
      await q('SELECT pg_advisory_xact_lock(424242)');
      await q('CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      const done = new Set((await q<{ id: string }>('SELECT id FROM schema_migrations')).map((r) => r.id));
      const applied: string[] = [];
      for (const m of migrations) {
        if (done.has(m.id)) continue;
        await q(m.sql);
        await q('INSERT INTO schema_migrations (id) VALUES ($1)', [m.id]);
        applied.push(m.id);
      }
      return applied;
    });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
