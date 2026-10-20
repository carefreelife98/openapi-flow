import { z } from 'zod';
import type {
  WorkflowDraftApiInputEditContractInput,
  WorkflowDraftApiInputEditTarget,
  WorkflowDraftApiInputEditValuesSchema,
} from '../types/workflow-draft-api-input-edit.js';
import type { SchemaResourceContext } from '../types/schema-resource.js';
import type { BindingSchema } from '../types/api-bindings.js';
import { validateWorkflowDraftApiInputEditContract } from '../draft/edits/inputs/validate-workflow-draft-api-input-edit-contract.js';
import { createWorkflowDraftEditMessageFields } from './workflow-draft-edit-message-fields.js';
import { createOasValueValidator } from '../openapi/common/create-oas-value-validator.js';
import { createOasValueValidationSchema } from './create-oas-value-validation-schema.js';
import { createSchemaResourceContext } from '../bindings/resources/create-schema-resource-context.js';
import type { WorkflowMessageEvidence } from '../types/planning-evidence.js';
import { apiInputLiteralSourceSchema } from './api-input-literal-source-schema.js';

function targetValueSchema(
  target: WorkflowDraftApiInputEditTarget,
  resources: SchemaResourceContext,
  nodeId: string,
  projection: BindingSchema,
) {
  if (target.kind !== 'set')
    throw new Error(
      `API input edit set target ${target.pointer} has no OAS schema`,
    );
  const assertions =
    typeof target.schema === 'boolean'
      ? target.schema
        ? {}
        : { not: {} }
      : target.schema;
  const source = `API input edit ${nodeId}${target.pointer}`;
  const wireAssertions =
    typeof projection === 'boolean'
      ? projection
        ? {}
        : { not: {} }
      : projection;
  return createOasValueValidationSchema(
    createOasValueValidator(
      { ...assertions, $defs: { resource: resources.root } },
      'draft-2020-12',
      source,
    ),
    source,
  ).meta(
    typeof wireAssertions.$ref === 'string'
      ? wireAssertions
      : {
          ...wireAssertions,
          description:
            'The complete actual value explicitly supplied by the current user request. Preserve its type. No examples, defaults, old field values or invented placeholders.',
        },
  );
}

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
                  value: targetValueSchema(
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
