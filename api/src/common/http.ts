import {
  ArgumentMetadata,
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
  PipeTransform,
} from '@nestjs/common';
import { ZodSchema } from 'zod';

/** Validates a body or query against a zod schema. */
export class Zod<T> implements PipeTransform {
  constructor(private schema: ZodSchema<T>) {}
  transform(value: unknown, _meta: ArgumentMetadata): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        message: 'Invalid input',
        issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return r.data;
  }
}

export interface AuthUser {
  id: string;
  email: string;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

/** A broken family rule: 400 with a readable message for the UI. */
export class RuleError extends BadRequestException {
  constructor(message: string) {
    super({ message, rule: true });
  }
}
