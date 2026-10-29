import { z } from 'zod';
import { literalDataParametersSchema } from './literal-data-schema.js';

/** Derive the exact producer contract from its validated typed fields. */
export function createLiteralDataOutputSchema(parameters: unknown) {
  const { fields } = literalDataParametersSchema.parse(parameters);
  return z.strictObject(
    Object.fromEntries(
      fields.map(({ name, value }) => [name, z.literal(value)]),
    ),
  );
}
