import { z } from 'zod';
import type { HttpRequestPagination } from '../types/http-request-pagination.js';

export const httpRequestPaginationSchema = z.strictObject({
  mode: z.literal('page-number'),
  output: z.literal('per-page'),
  parameter: z.string().min(1),
  start: z.number().int().safe(),
  step: z.number().int().positive().safe(),
  maxRequests: z.number().int().min(1).safe(),
  requestInterval: z.number().int().nonnegative(),
  termination: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('max-requests') }),
    z.strictObject({
      kind: z.literal('status-codes'),
      statusCodes: z.array(z.number().int().min(200).max(599)).min(1),
    }),
  ]),
}) satisfies z.ZodType<HttpRequestPagination>;
