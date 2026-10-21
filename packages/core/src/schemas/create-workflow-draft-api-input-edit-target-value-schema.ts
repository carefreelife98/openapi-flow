import type { WorkflowDraftApiInputEditTarget } from '../types/workflow-draft-api-input-edit.js';
import type { SchemaResourceContext } from '../types/schema-resource.js';
import type { BindingSchema } from '../types/api-bindings.js';
import { createOasValueValidator } from '../openapi/common/create-oas-value-validator.js';
import { createOasValueValidationSchema } from './create-oas-value-validation-schema.js';

/** The same original OAS value assertions for model proposals and explicit typed replies. */
export function createWorkflowDraftApiInputEditTargetValueSchema(
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
