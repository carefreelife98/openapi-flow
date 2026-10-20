import type { ValidateWorkflowDraftNativeReferenceInput } from '../../../types/native-reference-validation.js';
import { createResponseValueSchema } from '../../../openapi/response/create-response-value-schema.js';
import { schemasAtPointer } from '../../../bindings/schema-at-pointer.js';
import { createSchemaResourceContext } from '../../../bindings/resources/create-schema-resource-context.js';

export function validateWorkflowDraftNativeReference(
  input: ValidateWorkflowDraftNativeReferenceInput,
): void {
  const { reference, sources } = input;
  if (reference.source === 'exclusive-output') {
    if (
      !sources.exclusiveOutputs.some(
        (source) => source.nodeId === reference.nodeId,
      )
    )
      throw new Error(
        `Native control reference ${reference.nodeId} is not an available exclusive-output source`,
      );
    return;
  }
  const source = sources.values.find(
    (source) => source.nodeId === reference.nodeId,
  );
  if (
    !source ||
    source.kind !== (reference.source === 'response' ? 'api' : 'native')
  )
    throw new Error(
      `Native parameter reference ${reference.nodeId} is not an available ${reference.source} source`,
    );
  if (source.kind === 'api')
    createResponseValueSchema(source.operation, reference.pointer);
  else {
    const resources = createSchemaResourceContext(source.schema);
    if (!schemasAtPointer(resources.root, reference.pointer, resources).length)
      throw new Error(
        `Native parameter reference ${reference.nodeId}${reference.pointer} is not declared by its native output`,
      );
  }
}
