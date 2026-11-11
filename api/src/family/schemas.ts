import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const year = z.number().int().min(1500).max(2200);

export const PersonInput = z.object({
  firstName: z.string().trim().min(1),
  otherNames: z.string().trim().default(''),
  sex: z.enum(['M', 'F', 'U']),
  clan: z.string().trim().optional(),
  birthDate: date.optional(),
  birthYear: year.optional(),
  birthPlace: z.string().trim().optional(),
  deathDate: date.optional(),
  deathYear: year.optional(),
  isDeceased: z.boolean().optional(),
  notes: z.string().optional(),
});
export type PersonInput = z.infer<typeof PersonInput>;

export const PersonPatch = PersonInput.partial();
export type PersonPatch = z.infer<typeof PersonPatch>;

/** Either an existing person or a new one to create in the same tree. */
export const PersonRef = z.union([
  z.object({ id: z.string().uuid() }),
  z.object({ new: PersonInput }),
]);
export type PersonRef = z.infer<typeof PersonRef>;

const marriageCommon = {
  bride: PersonRef,
  startedOn: date.optional(),
  place: z.string().trim().optional(),
};

export const RecordMarriage = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('head'),
    husbandId: z.string().uuid(),
    form: z.enum(['customary', 'civil', 'religious']).default('customary'),
    ...marriageCommon,
  }),
  z.object({
    mode: z.literal('wife'),
    sponsorHouseId: z.string().uuid(),
    ...marriageCommon,
  }),
]);
export type RecordMarriage = z.infer<typeof RecordMarriage>;

export const EndMarriage = z.object({
  endedOn: date.optional(),
  reason: z.enum(['divorce', 'death', 'other']),
});
export type EndMarriage = z.infer<typeof EndMarriage>;

export const AddChild = z
  .object({
    child: PersonInput,
    houseId: z.string().uuid().optional(),
    motherId: z.string().uuid().optional(),
    father: z
      .discriminatedUnion('kind', [
        z.object({ kind: z.literal('head') }),
        z.object({ kind: z.literal('person'), person: PersonRef, restricted: z.boolean().default(true) }),
        z.object({ kind: z.literal('unknown') }),
      ])
      .default({ kind: 'unknown' }),
  })
  .refine((v) => !!v.houseId !== !!v.motherId, {
    message: 'Give either houseId (child of a house) or motherId (child of an unmarried mother)',
  });
export type AddChild = z.infer<typeof AddChild>;

export const AddParents = z.object({
  father: PersonRef,
  mother: z.union([PersonRef, z.object({ unknown: z.literal(true) })]),
});
export type AddParents = z.infer<typeof AddParents>;

export const Merge = z.object({ intoId: z.string().uuid() });

export const MatchQuery = z.object({
  firstName: z.string().trim().min(1),
  otherNames: z.string().trim().optional(),
  birthYear: z.coerce.number().int().optional(),
});

export const SearchQuery = z.object({ q: z.string().trim().default('') });
