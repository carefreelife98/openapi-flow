import { z } from 'zod';
import type {
  WorkflowDraftApiCallArgumentsInput,
  WorkflowDraftApiCallArgumentsProposal,
} from '../types/workflow-draft-api-call-planning.js';
import { resolveApiCallArgumentsContext } from '../draft/edits/api/resolve-api-call-arguments-context.js';
import { createWorkflowDraftSourceEvidenceFields } from './create-workflow-draft-source-evidence-fields.js';
import { apiInputLiteralSourceSchema } from './api-input-literal-source-schema.js';
import { pointerTokens } from '../bindings/json-pointer.js';
import { createApiRequestInputPointerSchema } from './create-api-request-input-pointer-schema.js';

/** Only remaining OAS-typed literal fields. All binding and confirmed-input owners are excluded. */
export function createWorkflowDraftApiCallArgumentsSchema(
  input: WorkflowDraftApiCallArgumentsInput,
): z.ZodType<WorkflowDraftApiCallArgumentsProposal> {
  const { description, contract } = resolveApiCallArgumentsContext(input);
  const roots = [
    ...new Set(
      description.requestInputRoots.map((pointer) => pointerTokens(pointer)[0]),
    ),
  ];
  const pointerPattern = roots.length
    ? new RegExp(`^(?:$|/(?:${roots.join('|')})(?:/(?:[^~/]|~[01])*)*)$`)
    : /^$/;
  return z.strictObject({
    values: contract.valuesSchema,
    ...(input.trackRequestedInputs === true
      ? {
          requestedInputs: z
            .array(
              createApiRequestInputPointerSchema(description.requestSchema),
            )
            .refine((pointers) => new Set(pointers).size === pointers.length)
            .describe(
              'Exact OAS input paths explicitly requested for THIS call by the user, whether their literal values are known or unknown. Include requested optional inputs; omit unrequested filters, defaults and examples. Do not generate values here. Code checks the original OAS and missing presence separately. Use original request pointers even for confirmed fields on answer resume.',
            ),
        }
      : {}),
    literalSources: z
      .array(
        apiInputLiteralSourceSchema.extend({
          targetPointer: z
            .string()
            .regex(pointerPattern)
            .describe(
              'RFC 6901 pointer relative to proposal.values and literalInputSchema, NOT relative to the entire response. Example: /query/id, never /values/query/id. Cover each literal leaf, or cite a complete object/array subtree once. The empty pointer covers explicitly supplied whole values. Never cover a bound or confirmed field.',
            ),
          messageId: z
            .enum(
              [...description.messages, ...description.backgroundMessages].map(
                (message) => message.id,
              ),
            )
            .describe(
              'Original user message containing this value, including supplied background messages. Current edit authority remains sourceMessageIds.',
            ),
        }),
      )
      .optional()
      .describe(
        'Exact original text for every proposed value. Omit only for empty values; never cite OAS defaults, examples or invented text. Code verifies coverage, occurrence, parsing and typed equality.',
      ),
    ...createWorkflowDraftSourceEvidenceFields(description),
  }) as z.ZodType<WorkflowDraftApiCallArgumentsProposal>;
}
