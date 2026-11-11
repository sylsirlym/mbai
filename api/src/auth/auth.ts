import {
  Body,
  CanActivate,
  ConflictException,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { z } from 'zod';
import { DbService } from '../db/db.service';
import { AuthUser, CurrentUser, Zod } from '../common/http';

const Register = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim()),
  password: z.string().min(8, 'Use at least 8 characters'),
  name: z.string().trim().min(1),
});
const Login = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim()),
  password: z.string().min(1),
});

@Injectable()
export class AuthService {
  constructor(private db: DbService, private jwt: JwtService) {}

  async register(input: z.infer<typeof Register>) {
    const hash = await bcrypt.hash(input.password, 12);
    try {
      const [user] = await this.db.query(
        'INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id, email, name',
        [input.email, hash, input.name],
      );
      return { user, token: this.sign(user) };
    } catch (e: any) {
      if (e.code === '23505') throw new ConflictException('An account with that email already exists');
      throw e;
    }
  }

  async login(input: z.infer<typeof Login>) {
    const [user] = await this.db.query('SELECT id, email, name, password_hash FROM users WHERE email = $1', [input.email]);
    // Compare even when the user is missing, so timing doesn't reveal which emails exist.
    const ok = await bcrypt.compare(input.password, user?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    if (!user || !ok) throw new UnauthorizedException('Wrong email or password');
    const { password_hash, ...safe } = user;
    return { user: safe, token: this.sign(safe) };
  }

  private sign(user: { id: string; email: string }) {
    return this.jwt.sign({ sub: user.id, email: user.email });
  }
}

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private jwt: JwtService) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException();
    try {
      const payload = this.jwt.verify(header.slice(7));
      req.user = { id: payload.sub, email: payload.email } satisfies AuthUser;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private db: DbService) {}

  @Post('register')
  register(@Body(new Zod(Register)) body: z.infer<typeof Register>) {
    return this.auth.register(body);
  }

  @Post('login')
  login(@Body(new Zod(Login)) body: z.infer<typeof Login>) {
    return this.auth.login(body);
  }

  @Get('me')
  @UseGuards(JwtGuard)
  async me(@CurrentUser() u: AuthUser) {
    const [user] = await this.db.query('SELECT id, email, name FROM users WHERE id = $1', [u.id]);
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
