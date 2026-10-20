import { z } from 'zod';
import type { ApiOperationCandidate } from '../types/api-catalog.js';
import { apiOperationKeySchema } from './api-operation-key-schema.js';

export const apiOperationCandidateSchema = z
  .strictObject({
    key: apiOperationKeySchema,
    source: z.enum(['paths', 'webhooks', 'callbacks']),
    operationRef: z.string().min(1),
    method: z.string().min(1),
    path: z.string(),
    operationId: z.string().optional(),
    summary: z.string(),
    description: z.string(),
    tags: z.array(z.string()),
  })
  .refine(
    (candidate) => candidate.operationRef === candidate.key.operationRef,
    {
      message: 'candidate.operationRef must equal candidate.key.operationRef',
      path: ['operationRef'],
    },
  ) satisfies z.ZodType<ApiOperationCandidate>;
