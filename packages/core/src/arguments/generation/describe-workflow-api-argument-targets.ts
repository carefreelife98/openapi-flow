import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ApiLiteralGenerationInput } from '../../types/api-literal-generation.js';
import type { WorkflowApiArgumentTarget } from '../../types/workflow-api-arguments.js';
import type { JsonObject } from '../../types/openapi.js';
import { describeApiLiteralGeneration } from './describe-api-literal-generation.js';
import { createSchemaResourceContext } from '../../bindings/resources/create-schema-resource-context.js';
import { listBindingPointerTemplates } from '../../bindings/candidates/list-binding-pointer-templates.js';

/** Reuse finite declaration templates; recursive/open paths remain explicit symbolic descendants. */
export function describeWorkflowApiArgumentTargets(
  input: ApiLiteralGenerationInput,
): WorkflowApiArgumentTarget[] {
  const description = describeApiLiteralGeneration(input);
  const schema = z.toJSONSchema(
    description.contract.valuesSchema,
  ) as JsonObject;
  const resources = createSchemaResourceContext(schema);
  return listBindingPointerTemplates(resources.root, resources)
    .filter(({ segments }) => {
      const root = segments[0];
      return (
        root?.kind === 'property' &&
        (root.value === 'body' ||
          (segments.length >= 2 && segments[1].kind === 'property'))
      );
    })
    .map((template) => ({
      id: `target:${createHash('sha256')
        .update(JSON.stringify([description.input, template]))
        .digest('hex')}`,
      template,
    }));
}
