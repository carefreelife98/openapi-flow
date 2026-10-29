import { z } from 'zod';
import type { NativeSchemaProjectionStep } from '../types/native-schema-projection.js';

export const nativeSchemaProjectionStepsSchema = z.array(
  z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('value'), pointer: z.string() }),
    z.strictObject({ kind: z.literal('array-items') }),
    z.strictObject({ kind: z.literal('object-entries') }),
    z.strictObject({ kind: z.literal('require-array') }),
  ]),
) satisfies z.ZodType<NativeSchemaProjectionStep[]>;
