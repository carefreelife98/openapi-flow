import { z } from 'zod';
import { apiOperationCandidateSchema } from './api-operation-candidate-schema.js';
import { apiOperationKeySchema } from './api-operation-key-schema.js';
import { planningEvidenceTextSchema } from './planning-evidence-schema.js';
import type {
  ApiSelectionContext,
  ApiSelectionExplanationBasis,
  ApiSelectionExplanation,
} from '../types/api-selection-evidence.js';

export const apiSelectionContextSchema = z.strictObject({
  scenario: planningEvidenceTextSchema,
  operations: z.array(apiOperationCandidateSchema),
}) satisfies z.ZodType<ApiSelectionContext>;

export const apiSelectionExplanationBasisSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('catalog') }),
  z.strictObject({
    kind: z.literal('candidates'),
    operations: z.array(apiOperationKeySchema).min(1),
  }),
]) satisfies z.ZodType<ApiSelectionExplanationBasis>;

export const apiSelectionExplanationSchema = z.strictObject({
  reason: planningEvidenceTextSchema,
  evidence: z.array(
    z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('scenario'), text: z.string() }),
      z.strictObject({
        kind: z.literal('discovery'),
        candidates: z.array(apiOperationCandidateSchema),
      }),
    ]),
  ),
}) satisfies z.ZodType<ApiSelectionExplanation>;
