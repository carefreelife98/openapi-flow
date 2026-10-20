import { z } from 'zod';
import type {
  WorkflowDraftNativeParameterEditContractInput,
  WorkflowDraftNativeParameterEditValues,
} from '../types/workflow-draft-native-parameter-edit.js';
import { validateWorkflowDraftNativeParameterEditContract } from '../draft/edits/native/validate-workflow-draft-native-parameter-edit-contract.js';
import { createWorkflowDraftEditMessageFields } from './workflow-draft-edit-message-fields.js';
import { createJsonSchemaValueSchema } from './create-json-schema-value-schema.js';
import { createSchemaResourceContext } from '../bindings/resources/create-schema-resource-context.js';
import type { WorkflowMessageEvidence } from '../types/planning-evidence.js';

export function createWorkflowDraftNativeParameterEditValuesSchema(
  input: WorkflowDraftNativeParameterEditContractInput,
  messageSchema?: z.ZodType<WorkflowMessageEvidence>,
): z.ZodType<WorkflowDraftNativeParameterEditValues> {
  validateWorkflowDraftNativeParameterEditContract(input);
  const evidence = createWorkflowDraftEditMessageFields(
    input.requestMessageIds,
    input.plan.options.includeExplanations,
    messageSchema,
  );
  const fields = {
    sources: z.array(evidence.message).min(1),
    ...evidence.fields,
  };
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
            .map((target) => {
              const assertions =
                typeof target.schema === 'boolean'
                  ? target.schema
                    ? {}
                    : { not: {} }
                  : target.schema;
              const projected = wire.projections[target.id];
              const wireAssertions =
                typeof projected === 'boolean'
                  ? projected
                    ? {}
                    : { not: {} }
                  : projected;
              const value = createJsonSchemaValueSchema(
                {
                  ...assertions,
                  $defs: { resource: input.contract.schemaResource },
                },
                `Native parameter ${input.contract.nodeId}${target.pointer}`,
              ).meta(
                typeof wireAssertions.$ref === 'string'
                  ? wireAssertions
                  : {
                      ...wireAssertions,
                      description:
                        'Only this requested parameter value, following the registered native contract. Preserve actual types. Do not output the node, unchanged siblings, inferred literals, code or a workflow.',
                    },
              );
              return [
                target.id,
                z.union([
                  z.strictObject({
                    status: z.literal('provided'),
                    value,
                    ...fields,
                  }),
                  z.strictObject({
                    status: z.literal('needs-input'),
                    message: z.string().min(1),
                    ...fields,
                  }),
                ]),
              ];
            }),
        ),
      ),
    })
    .meta({
      $defs: wire.definitions,
    }) as z.ZodType<WorkflowDraftNativeParameterEditValues>;
}
