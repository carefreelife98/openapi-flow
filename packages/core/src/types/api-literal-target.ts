import type { z } from 'zod';
import type { JsonValue } from './api-arguments.js';

/** A concrete selected destination and its original, projected OAS value contract. */
export interface ApiLiteralTargetContract {
  targetPointer: string;
  valueSchema: z.ZodType<JsonValue>;
}
