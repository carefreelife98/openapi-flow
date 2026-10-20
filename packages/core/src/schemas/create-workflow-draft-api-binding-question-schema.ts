import { z } from 'zod';
import type { JsonObject } from '../types/openapi.js';
import type { ProposedWorkflowDraftApiBindingQuestion } from '../types/workflow-draft-api-binding-clarification.js';
import { createApiRequestInputPointerSchema } from './create-api-request-input-pointer-schema.js';

export function createWorkflowDraftApiBindingQuestionSchema(
  requestSchema: JsonObject,
  sourceIds: string[],
  targets?: string[],
): z.ZodType<ProposedWorkflowDraftApiBindingQuestion> {
  const targetPointer =
    targets === undefined
      ? createApiRequestInputPointerSchema(requestSchema)
      : targets.length
        ? z.enum(targets)
        : z.never();
  const intent = z.strictObject({
    kind: z.literal('binding-intent'),
    targetPointer,
  });
  if (!sourceIds.length) return intent;
  return z.union([
    intent,
    z.strictObject({
      kind: z.literal('choose-source'),
      targetPointer,
      candidates: z
        .array(
          z.strictObject({
            sourceNodeId: z.enum(sourceIds),
            sourcePointer: z
              .string()
              .describe(
                'Exact supplied response-body/native output pointer. Each candidate must be compatible with this target input.',
              ),
          }),
        )
        .min(1),
    }),
  ]);
}
