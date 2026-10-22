import { createHash } from 'node:crypto';
import type { BindingSchema } from '../../types/api-bindings.js';
import type { JsonValue } from '../../types/api-arguments.js';
import type {
  ApiInputEnumCandidatesInput,
  ApiInputEnumCandidate,
} from '../../types/api-input-enum.js';
import { createOasValueValidator } from '../../openapi/common/create-oas-value-validator.js';

/** Enumerate declared values only. A source resource retains references and all sibling assertions. */
export function listApiInputEnumCandidates(
  input: ApiInputEnumCandidatesInput,
): ApiInputEnumCandidate[] {
  const material =
    input.source.kind === 'operation' ? input.source : input.source.requirement;
  const operation =
    input.source.kind === 'operation'
      ? input.source.operation.key
      : input.source.requirement.operation;
  if (!input.schemas.length)
    throw new Error(
      `API enum ${material.callId}${material.targetPointer} has no original OAS target schema`,
    );
  const schema =
    input.schemas.length === 1 ? input.schemas[0] : { anyOf: input.schemas };
  const validator = createOasValueValidator(
    input.resources.bundle(schema),
    'draft-2020-12',
    `API enum ${material.callId}${material.targetPointer}`,
  );
  const identity =
    input.source.kind === 'operation'
      ? JSON.stringify([
          input.source.callId,
          input.source.operation,
          input.source.requestMediaType,
          input.source.targetPointer,
        ])
      : JSON.stringify(['requirement', input.source.requirement]);
  const candidates: ApiInputEnumCandidate[] = [];
  const active = new Set<BindingSchema>();
  function visit(current: BindingSchema, pointer: string): void {
    if (typeof current === 'boolean' || active.has(current)) return;
    active.add(current);
    try {
      if (Array.isArray(current.enum))
        current.enum.forEach((value, index) => {
          if (!validator.validate(value).valid) return;
          const schemaPointer = `${pointer}/enum/${index}`;
          candidates.push({
            id: createHash('sha256')
              .update(identity)
              .update(JSON.stringify([schemaPointer, value]))
              .digest('hex'),
            callId: material.callId,
            operation: structuredClone(operation),
            targetPointer: material.targetPointer,
            schemaPointer,
            value: structuredClone(value) as JsonValue,
          });
        });
      if (typeof current.$ref === 'string') {
        const resolved = input.resources.resolve(current);
        if (typeof resolved !== 'boolean') {
          const reference = input.resources.reference(resolved);
          if (
            typeof reference === 'boolean' ||
            typeof reference.$ref !== 'string'
          )
            throw new Error(
              `API enum ${material.callId}${material.targetPointer} has no original schema reference`,
            );
          visit(
            resolved,
            decodeURIComponent(new URL(reference.$ref).hash.slice(1)),
          );
        }
      }
      for (const key of ['allOf', 'anyOf', 'oneOf']) {
        const children = current[key];
        if (Array.isArray(children))
          children.forEach((child, index) => {
            if (
              typeof child === 'boolean' ||
              (child !== null &&
                typeof child === 'object' &&
                !Array.isArray(child))
            )
              visit(child, `${pointer}/${key}/${index}`);
          });
      }
    } finally {
      active.delete(current);
    }
  }
  input.schemas.forEach((item, index) => visit(item, `/${index}`));
  return candidates.filter(
    (candidate, index) =>
      candidates.findIndex((item) => item.id === candidate.id) === index,
  );
}
