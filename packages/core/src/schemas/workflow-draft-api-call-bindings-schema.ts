import { z } from 'zod';
import type {
  WorkflowDraftApiCallBindingsInput,
  WorkflowDraftApiCallBindingProposal,
} from '../types/workflow-draft-api-call-planning.js';
import { describeWorkflowDraftApiCallBindings } from '../draft/edits/api/describe-workflow-draft-api-call-bindings.js';
import { createWorkflowDraftSourceEvidenceFields } from './create-workflow-draft-source-evidence-fields.js';
import { createWorkflowDraftApiBindingQuestionSchema } from './create-workflow-draft-api-binding-question-schema.js';

export function createWorkflowDraftApiCallBindingsSchema(
  input: WorkflowDraftApiCallBindingsInput,
): z.ZodType<WorkflowDraftApiCallBindingProposal> {
  const description = describeWorkflowDraftApiCallBindings(input);
  const targets = description.inputIntent?.targets;
  const fields = createWorkflowDraftSourceEvidenceFields(description);
  const ids = description.sources.values.map((source) => source.nodeId);
  const mappings =
    ids.length && description.hasRequestInputs && targets?.length !== 0
      ? {
          mappings: z
            .array(
              z.strictObject({
                targetPointer:
                  targets === undefined
                    ? z
                        .string()
                        .min(1)
                        .describe(
                          'Exact RFC 6901 request input pointer in the selected OAS. No expressions or transformations.',
                        )
                    : z.enum(targets),
                sourceNodeId: z.enum(ids),
                sourcePointer: z
                  .string()
                  .describe(
                    'RFC 6901 pointer into the actual API response BODY or native JSON output. Empty selects the whole value. No transport envelope or name-based guesses.',
                  ),
              }),
            )
            .describe(
              'Only data dependencies explicitly requested for this selected instance. Empty means no predecessor data mapping.',
            ),
        }
      : {};
  const provided = z.strictObject({
    status: z.literal('provided'),
    ...mappings,
    ...fields,
  });
  if (!description.hasRequestInputs || targets?.length === 0)
    return z.strictObject({
      decision: provided,
    }) as z.ZodType<WorkflowDraftApiCallBindingProposal>;
  return z.strictObject({
    decision: z.union([
      provided,
      z.strictObject({
        status: z.literal('needs-clarification'),
        ...mappings,
        questions: z
          .array(
            createWorkflowDraftApiBindingQuestionSchema(
              description.requestSchema,
              ids,
              targets,
            ),
          )
          .min(1)
          .describe(
            'Unresolved binding decisions for actual inputs of THIS selected API only. Code generates questions, IDs, labels and original schema data. Do not generate a message or claim contracts are missing.',
          ),
        ...fields,
      }),
    ]),
  }) as z.ZodType<WorkflowDraftApiCallBindingProposal>;
}
