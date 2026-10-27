import { isAbsolute } from 'node:path';
import { z } from 'zod';

export const n8nOfficialSchemaDirectoriesSchema = z
  .array(
    z.string().refine(isAbsolute, 'schema directory must be an absolute path'),
  )
  .min(1, 'at least one explicit SDK-generated schema directory is required');

export const n8nOfficialNodeParametersSchema = z.record(z.string(), z.json());

export const n8nOfficialNodeIdentitySchema = z.object({
  id: z
    .string()
    .refine((value) => value.trim().length > 0, 'node id is required'),
  name: z
    .string()
    .refine((value) => value.trim().length > 0, 'node name is required'),
  position: z.tuple([z.number(), z.number()]),
});
