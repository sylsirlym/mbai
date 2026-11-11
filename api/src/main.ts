import 'reflect-metadata';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { DbService } from './db/db.service';

export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: process.env.NODE_ENV === 'test' ? false : ['error', 'warn', 'log'],
  });
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true });

  // In production the built web app is served from the same service, so there is one URL and no CORS.
  const webDist = process.env.WEB_DIST ? resolve(process.env.WEB_DIST) : null;
  if (webDist && existsSync(join(webDist, 'index.html'))) {
    app.useStaticAssets(webDist, { index: false, maxAge: '1h' });
    app.use((req: any, res: any, next: any) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(join(webDist, 'index.html'));
    });
  }
  return app;
}

async function bootstrap() {
  const app = await createApp();
  if (process.env.MIGRATE_ON_START !== 'false') {
    const applied = await app.get(DbService).migrate();
    if (applied.length) console.log(`Applied migrations: ${applied.join(', ')}`);
  }
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`Mbai listening on :${port}`);
}

if (require.main === module) bootstrap();
