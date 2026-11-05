import { z } from 'zod';
import type { JsonObject } from '../../types/openapi.js';
import type { ApiArgumentGenerationContract } from '../../types/api-argument-generation.js';
import type { ApiLiteralTargetContract } from '../../types/api-literal-target.js';
import { listApiRequestInputRoots } from '../list-api-request-input-roots.js';
import { pointerTokens } from '../../bindings/json-pointer.js';
import { projectSchemaPointer } from '../../bindings/project-schema-pointer.js';
import { createOasValueSchema } from '../../schemas/create-oas-value-schema.js';

/** Resolve only selected paths. Recursive resources stay referenced, never depth-unrolled. */
export function describeApiLiteralTargets(
  contract: ApiArgumentGenerationContract,
  targetPointers: string[],
): ApiLiteralTargetContract[] {
  if (
    !targetPointers.length ||
    new Set(targetPointers).size !== targetPointers.length
  )
    throw new Error(
      'Literal target selection requires nonempty distinct paths',
    );
  const schema = z.toJSONSchema(contract.valuesSchema) as JsonObject;
  const roots = listApiRequestInputRoots(schema);
  return targetPointers.map((targetPointer) => {
    pointerTokens(targetPointer);
    if (
      targetPointers.some(
        (other) =>
          other !== targetPointer && targetPointer.startsWith(other + '/'),
      )
    )
      throw new Error(
        `Literal target ${targetPointer} overlaps a selected parent`,
      );
    const root = roots.find(
      (candidate) =>
        targetPointer === candidate ||
        targetPointer.startsWith(candidate + '/'),
    );
    if (root === undefined)
      throw new Error(
        `Literal target ${targetPointer} is outside the remaining OAS inputs`,
      );
    const tokens = pointerTokens(root);
    const properties = schema.properties as Record<string, JsonObject>;
    const rootSchema =
      tokens[0] === 'body'
        ? properties.body
        : (properties[tokens[0]].properties as Record<string, JsonObject>)[
            tokens[1]
          ];
    if (rootSchema === undefined)
      throw new Error(`Literal input contract is missing ${root}`);
    const projected = projectSchemaPointer(
      rootSchema,
      targetPointer.slice(root.length),
    );
    if (!projected.length)
      throw new Error(
        `Literal target ${targetPointer} is forbidden by the OAS input contract`,
      );
    const value = projected.length === 1 ? projected[0] : { anyOf: projected };
    return {
      targetPointer,
      valueSchema: createOasValueSchema(
        value,
        'draft-2020-12',
        `literal target ${targetPointer}`,
      ),
    };
  });
}
