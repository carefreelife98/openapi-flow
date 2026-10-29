import { z } from 'zod';
import {
  createApiRequestInputPointerSchema,
  optionalPlanningExplanationSchema,
} from '@openapi-flow/core';
import type { ApiCallBindingPlanningDescription } from '@openapi-flow/core';
import { createApiBindingKeyGenerationSchema } from './api-binding-key-generation-schema.js';
import { apiBindingCallReasonSchema } from './api-binding-plan-schema.js';

export const apiBindingCallExecutionSchema = z.object({
  concurrency: z.number().int().positive(),
});

function callGapsSchema(description: ApiCallBindingPlanningDescription) {
  return z.array(
    z.strictObject({
      targetPointer: createApiRequestInputPointerSchema(
        description.requestSchema,
      ),
      description: z
        .string()
        .min(1)
        .describe(
          'Only an explicitly requested data dependency that cannot be represented. Missing independent literal inputs belong to argument generation, not this gap.',
        ),
    }),
  );
}

export function createApiBindingSourceDecisionSchema(
  description: ApiCallBindingPlanningDescription,
  requireExplanations = true,
) {
  const ids = description.sourceCandidates.map((candidate) => candidate.nodeId);
  const independent = z.strictObject({
    kind: z
      .literal('independent-inputs')
      .describe(
        'No upstream response value is requested for this target. Required or missing independent request values are handled later; they are not missing producers.',
      ),
  });
  const missing = z.strictObject({
    kind: z.literal('missing-response-sources'),
    gaps: callGapsSchema(description)
      .min(1)
      .describe(
        'Only explicit response-to-request dependencies with no supplied producer. Never use this decision for absent independent runtime values.',
      ),
  });
  const keys = createApiBindingKeyGenerationSchema(description);
  const selected = z.strictObject({
    kind: z.literal('selected-response-sources'),
    sourceNodeIds: ids.length
      ? z.array(z.enum(ids)).min(1)
      : z.array(z.string()).max(0),
  });
  const partial = z.strictObject({
    kind: z.literal('partially-missing-response-sources'),
    sourceNodeIds: ids.length
      ? z.array(z.enum(ids)).min(1)
      : z.array(z.string()).max(0),
    gaps: callGapsSchema(description).min(1),
  });
  const available = ids.length
    ? [
        keys === undefined
          ? selected
          : selected.extend({ keySelections: keys }),
        keys === undefined ? partial : partial.extend({ keySelections: keys }),
      ]
    : [];
  const schema = z.strictObject({
    // Distinct literal kinds keep these branches exclusive; union emits strict-provider-compatible anyOf.
    decision: z.union([independent, missing, ...available]),
  });
  if (!requireExplanations)
    return schema.extend({ reason: optionalPlanningExplanationSchema });
  return description.input.includeExplanations === true
    ? schema.extend({ reason: apiBindingCallReasonSchema })
    : schema;
}
