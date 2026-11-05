import type { ApiLiteralTargetContract } from '../../types/api-literal-target.js';
import type { JsonObject } from '../../types/openapi.js';
import { createClosedSchemaPointerResolver } from '../../bindings/resources/create-closed-schema-pointer-resolver.js';
import { schemaAllowsContainer } from '../../bindings/schema-allows-container.js';

/** Only OAS roots admitting containers can own descendant construction paths. */
export function listApiLiteralContainerTargets(
  targets: ApiLiteralTargetContract[],
): string[] {
  return targets
    .filter((target) => {
      const schema = target.valueSchema.meta() as JsonObject | undefined;
      if (schema === undefined)
        throw new Error(
          `Literal target ${target.targetPointer} has no OAS metadata`,
        );
      const resources = createClosedSchemaPointerResolver(schema);
      return (
        schemaAllowsContainer(schema, 'object', resources) ||
        schemaAllowsContainer(schema, 'array', resources)
      );
    })
    .map((target) => target.targetPointer);
}
