import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CurrentUser, Zod } from '../common/http';
import { JwtGuard } from '../auth/auth';
import { AccessService } from '../trees/trees';
import { FamilyService } from './family.service';
import {
  AddChild,
  AddParents,
  EndMarriage,
  MatchQuery,
  Merge,
  PersonInput,
  PersonPatch,
  RecordMarriage,
  SearchQuery,
} from './schemas';

const uuid = new ParseUUIDPipe();

@Controller()
@UseGuards(JwtGuard)
export class FamilyController {
  constructor(private family: FamilyService, private access: AccessService) {}

  // ----- tree-scoped -----

  @Get('trees/:treeId/households')
  async households(@CurrentUser() u: AuthUser, @Param('treeId', uuid) treeId: string) {
    await this.access.require(treeId, u.id, 'viewer');
    return this.family.listHouseholds(treeId);
  }

  @Get('trees/:treeId/persons')
  async search(@CurrentUser() u: AuthUser, @Param('treeId', uuid) treeId: string, @Query(new Zod(SearchQuery)) query: z.infer<typeof SearchQuery>) {
    await this.access.require(treeId, u.id, 'viewer');
    return this.family.searchPersons(treeId, query.q);
  }

  @Get('trees/:treeId/persons/matches')
  async matches(@CurrentUser() u: AuthUser, @Param('treeId', uuid) treeId: string, @Query(new Zod(MatchQuery)) query: z.infer<typeof MatchQuery>) {
    await this.access.require(treeId, u.id, 'viewer');
    return this.family.matches(treeId, query.firstName, query.otherNames, query.birthYear);
  }

  /** Creates a person with no parents, e.g. the founder of a new line. */
  @Post('trees/:treeId/persons')
  async createPerson(@CurrentUser() u: AuthUser, @Param('treeId', uuid) treeId: string, @Body(new Zod(PersonInput)) body: PersonInput) {
    await this.access.require(treeId, u.id, 'editor');
    return this.family.createPerson(treeId, body);
  }

  @Post('trees/:treeId/marriages')
  async marry(@CurrentUser() u: AuthUser, @Param('treeId', uuid) treeId: string, @Body(new Zod(RecordMarriage)) body: RecordMarriage) {
    await this.access.require(treeId, u.id, 'editor');
    return this.family.recordMarriage(treeId, body);
  }

  @Post('trees/:treeId/children')
  async addChild(@CurrentUser() u: AuthUser, @Param('treeId', uuid) treeId: string, @Body(new Zod(AddChild)) body: AddChild) {
    await this.access.require(treeId, u.id, 'editor');
    return this.family.addChild(treeId, body);
  }

  // ----- object-scoped -----

  @Get('households/:id')
  async household(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) {
    const role = await this.access.require(await this.access.treeOf('households', id), u.id, 'viewer');
    return this.family.getHousehold(id, role);
  }

  @Get('persons/:id')
  async person(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) {
    const role = await this.access.require(await this.access.treeOf('persons', id), u.id, 'viewer');
    return this.family.getPerson(id, role);
  }

  @Patch('persons/:id')
  async updatePerson(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(new Zod(PersonPatch)) body: PersonPatch) {
    await this.access.require(await this.access.treeOf('persons', id), u.id, 'editor');
    return this.family.updatePerson(id, body);
  }

  @Post('persons/:id/parents')
  async addParents(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(new Zod(AddParents)) body: AddParents) {
    await this.access.require(await this.access.treeOf('persons', id), u.id, 'editor');
    return this.family.addParents(id, body);
  }

  @Post('persons/:id/merge')
  async merge(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(new Zod(Merge)) body: z.infer<typeof Merge>) {
    await this.access.require(await this.access.treeOf('persons', id), u.id, 'admin');
    return this.family.merge(id, body.intoId);
  }

  @Post('houses/:id/end')
  async end(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(new Zod(EndMarriage)) body: EndMarriage) {
    await this.access.require(await this.access.treeOf('houses', id), u.id, 'editor');
    return this.family.endMarriage(id, body);
  }
}
