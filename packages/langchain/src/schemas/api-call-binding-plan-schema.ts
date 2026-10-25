import { z } from 'zod';
import { createApiRequestInputPointerSchema } from '@openapi-flow/core';
import type {
  ApiBindingSourceProposal,
  ApiCallBindingProposal,
  ApiCallBindingPlanningDescription,
} from '@openapi-flow/core';
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

export function createApiBindingSourceSelectionSchema(
  description: ApiCallBindingPlanningDescription,
): z.ZodType<ApiBindingSourceProposal> {
  const ids = description.sourceCandidates.map((candidate) => candidate.nodeId);
  const schema = z.strictObject({
    sourceNodeIds: (ids.length
      ? z.array(z.enum(ids))
      : z.array(z.string()).max(0)
    ).describe(
      'Select only possible producers needed by THIS target. All API/native identities remain available regardless of array order. [] means no supplied producer is needed. Code retrieves the selected original contracts; this index is not proof of a compatible field.',
    ),
    gaps: callGapsSchema(description),
  });
  return description.input.includeExplanations === true
    ? schema.extend({ reason: apiBindingCallReasonSchema })
    : schema;
}

export function createApiCallBindingPlanSchema(
  description: ApiCallBindingPlanningDescription,
  sourceNodeIds: string[],
): z.ZodType<ApiCallBindingProposal> {
  if (!sourceNodeIds.length)
    throw new Error('field planning requires selected source contracts');
  const schema = z.strictObject({
    bindings: z.array(
      z.strictObject({
        targetPointer: createApiRequestInputPointerSchema(
          description.requestSchema,
        ),
        sourceNodeId: z
          .enum(sourceNodeIds)
          .describe(
            'Exact identity of a retrieved producer, never an inferred predecessor.',
          ),
        sourcePointer: z
          .string()
          .describe(
            'RFC 6901 pointer into the unchanged API response BODY or native JSON output. Empty string reads the entire value. Never an expression, cast or invented value.',
          ),
      }),
    ),
    gaps: callGapsSchema(description),
  });
  return description.input.includeExplanations === true
    ? schema.extend({ reason: apiBindingCallReasonSchema })
    : schema;
}
