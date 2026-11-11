import { Controller, Get, Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DbService } from './db/db.service';
import { AuthController, AuthService, JwtGuard } from './auth/auth';
import { AccessService, TreesController } from './trees/trees';
import { FamilyController } from './family/family.controller';
import { FamilyService } from './family/family.service';

@Controller('health')
class HealthController {
  constructor(private db: DbService) {}
  @Get()
  async ok() {
    await this.db.query('SELECT 1');
    return { ok: true };
  }
}

function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s && process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production');
  return s ?? 'dev-only-secret';
}

@Global()
@Module({
  imports: [JwtModule.register({ secret: jwtSecret(), signOptions: { expiresIn: '7d' } })],
  controllers: [HealthController, AuthController, TreesController, FamilyController],
  providers: [DbService, AuthService, JwtGuard, AccessService, FamilyService],
  exports: [DbService],
})
export class AppModule {}
