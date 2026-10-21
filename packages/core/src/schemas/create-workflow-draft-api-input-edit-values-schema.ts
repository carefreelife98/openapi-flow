import { z } from 'zod';
import type {
  WorkflowDraftApiInputEditContractInput,
  WorkflowDraftApiInputEditValuesSchema,
} from '../types/workflow-draft-api-input-edit.js';
import { validateWorkflowDraftApiInputEditContract } from '../draft/edits/inputs/validate-workflow-draft-api-input-edit-contract.js';
import { createWorkflowDraftEditMessageFields } from './workflow-draft-edit-message-fields.js';
import { createWorkflowDraftApiInputEditTargetValueSchema } from './create-workflow-draft-api-input-edit-target-value-schema.js';
import { createSchemaResourceContext } from '../bindings/resources/create-schema-resource-context.js';
import type { WorkflowMessageEvidence } from '../types/planning-evidence.js';
import { apiInputLiteralSourceSchema } from './api-input-literal-source-schema.js';

/** Only selected set-values are model-owned; per-field OAS assertions stay intact. */
export function createWorkflowDraftApiInputEditValuesSchema(
  input: WorkflowDraftApiInputEditContractInput,
  messageSchema?: z.ZodType<WorkflowMessageEvidence>,
): WorkflowDraftApiInputEditValuesSchema {
  validateWorkflowDraftApiInputEditContract(input);
  const evidence = createWorkflowDraftEditMessageFields(
    input.requestMessageIds,
    input.plan.options.includeExplanations,
    messageSchema,
  );
  const resources = createSchemaResourceContext(input.contract.schemaResource);
  const wire = resources.bundleStaticProjections(
    Object.fromEntries(
      input.contract.targets
        .filter((target) => target.kind === 'set')
        .map((target) => [target.id, target.schema]),
    ),
  );
  return z
    .strictObject({
      values: z.strictObject(
        Object.fromEntries(
          input.contract.targets
            .filter((target) => target.kind === 'set')
            .map((target) => [
              target.id,
              z.union([
                z.strictObject({
                  status: z.literal('provided'),
                  value: createWorkflowDraftApiInputEditTargetValueSchema(
                    target,
                    resources,
                    input.contract.nodeId,
                    wire.projections[target.id],
                  ),
                  source: apiInputLiteralSourceSchema.extend({
                    messageId: z.enum(input.requestMessageIds),
                  }),
                  ...evidence.fields,
                }),
                z.strictObject({
                  status: z.literal('needs-input'),
                  ...evidence.fields,
                }),
              ]),
            ]),
        ),
      ),
    })
    .meta({
      $defs: wire.definitions,
    }) as WorkflowDraftApiInputEditValuesSchema;
}
