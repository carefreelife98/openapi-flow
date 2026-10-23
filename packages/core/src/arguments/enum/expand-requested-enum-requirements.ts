import { createHash } from 'node:crypto';
import type { ApiArgumentEnumRequirementsInput } from '../../types/api-argument-enum.js';
import type { ApiInputRequirement } from '../../types/api-clarification.js';
import { requestBindingSchemas } from '../../bindings/request-binding-schema.js';
import { unionBindingSchemas } from '../../bindings/combine-binding-schemas.js';
import { hasPointer } from '../../bindings/json-pointer.js';

/** Missing containers need no fabricated value to expose their explicitly requested OAS descendants. */
export function expandRequestedEnumRequirements(
  input: ApiArgumentEnumRequirementsInput,
): ApiInputRequirement[] {
  const requirements = structuredClone(input.requirements);
  const owned = [
    ...input.bindings.map((binding) => binding.targetPointer),
    ...(input.confirmedInputs === undefined
      ? []
      : input.confirmedInputs.map((value) => value.targetPointer)),
  ];
  for (const parent of input.requirements) {
    if (parent.requestedInputs === undefined) continue;
    for (const targetPointer of parent.requestedInputs) {
      if (
        requirements.some((item) => item.targetPointer === targetPointer) ||
        hasPointer(input.values, targetPointer) ||
        owned.some((pointer) => overlaps(pointer, targetPointer))
      )
        continue;
      const schemas = requestBindingSchemas(input, targetPointer);
      if (!schemas.length)
        throw new Error(
          `Requested enum input ${targetPointer} has no original OAS contract`,
        );
      const schema = unionBindingSchemas(schemas);
      requirements.push({
        ...parent,
        kind: 'requested-input',
        id: createHash('sha256')
          .update(JSON.stringify([parent.id, targetPointer, schema]))
          .digest('hex'),
        targetPointer,
        schema,
        requestedInputs: [targetPointer],
        message: `Provide scenario-requested value ${targetPointer} for ${input.operation.method} ${input.operation.path}.`,
      });
    }
  }
  return requirements;
}

function overlaps(left: string, right: string): boolean {
  return (
    left === right ||
    left.startsWith(right + '/') ||
    right.startsWith(left + '/')
  );
}
