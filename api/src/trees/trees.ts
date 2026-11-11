import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../db/db.service';
import { AuthUser, CurrentUser, Zod } from '../common/http';
import { JwtGuard } from '../auth/auth';

export type Role = 'admin' | 'editor' | 'viewer';
const rank: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };

@Injectable()
export class AccessService {
  constructor(private db: DbService) {}

  /** Returns the user's role in the tree, or throws if it is below `min`. */
  async require(treeId: string, userId: string, min: Role): Promise<Role> {
    const [m] = await this.db.query<{ role: Role }>(
      'SELECT role FROM tree_members WHERE tree_id = $1 AND user_id = $2',
      [treeId, userId],
    );
    if (!m) throw new NotFoundException('Tree not found');
    if (rank[m.role] < rank[min]) throw new ForbiddenException(`Needs ${min} access`);
    return m.role;
  }

  /** Looks up which tree a row belongs to, so routes keyed by person/house/household can check access. */
  async treeOf(table: 'persons' | 'houses' | 'households', id: string): Promise<string> {
    const [r] = await this.db.query<{ tree_id: string }>(`SELECT tree_id FROM ${table} WHERE id = $1`, [id]);
    if (!r) throw new NotFoundException('Not found');
    return r.tree_id;
  }
}

const CreateTree = z.object({ name: z.string().trim().min(1) });
const AddMember = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim()),
  role: z.enum(['admin', 'editor', 'viewer']),
});

@Controller('trees')
@UseGuards(JwtGuard)
export class TreesController {
  constructor(private db: DbService, private access: AccessService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.db.query(
      `SELECT t.id, t.name, m.role,
              (SELECT count(*)::int FROM persons p WHERE p.tree_id = t.id AND NOT p.is_placeholder) AS people
         FROM trees t JOIN tree_members m ON m.tree_id = t.id
        WHERE m.user_id = $1 ORDER BY t.created_at`,
      [u.id],
    );
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body(new Zod(CreateTree)) body: z.infer<typeof CreateTree>) {
    return this.db.tx(async (q) => {
      const [tree] = await q('INSERT INTO trees (name, created_by) VALUES ($1,$2) RETURNING id, name', [body.name, u.id]);
      await q(`INSERT INTO tree_members (tree_id, user_id, role) VALUES ($1,$2,'admin')`, [tree.id, u.id]);
      return { ...tree, role: 'admin' };
    });
  }

  @Get(':treeId/members')
  async members(@CurrentUser() u: AuthUser, @Param('treeId', ParseUUIDPipe) treeId: string) {
    await this.access.require(treeId, u.id, 'viewer');
    return this.db.query(
      `SELECT u.id, u.email, u.name, m.role FROM tree_members m JOIN users u ON u.id = m.user_id
        WHERE m.tree_id = $1 ORDER BY u.name`,
      [treeId],
    );
  }

  /** Adds someone who already has an account. Re-adding changes their role. */
  @Post(':treeId/members')
  async addMember(
    @CurrentUser() u: AuthUser,
    @Param('treeId', ParseUUIDPipe) treeId: string,
    @Body(new Zod(AddMember)) body: z.infer<typeof AddMember>,
  ) {
    await this.access.require(treeId, u.id, 'admin');
    const [user] = await this.db.query('SELECT id FROM users WHERE email = $1', [body.email]);
    if (!user) throw new NotFoundException('No account with that email. Ask them to sign up first.');
    await this.db.query(
      `INSERT INTO tree_members (tree_id, user_id, role) VALUES ($1,$2,$3)
       ON CONFLICT (tree_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [treeId, user.id, body.role],
    );
    return { ok: true };
  }
}
