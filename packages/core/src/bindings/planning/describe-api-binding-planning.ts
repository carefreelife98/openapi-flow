import type {
  ApiBindingPlanningDescription,
  ApiBindingPlanningInput,
} from '../../types/api-binding-planning.js';
import {
  apiBindingPlanningIdentitySchema,
  apiBindingMaterialRoleSchema,
  apiBindingPlanningOperationSchema,
} from '../../schemas/api-binding-planning-schema.js';
import { createApiBindingSourceRegistry } from '../create-api-binding-source-registry.js';
import { listApiResponsePointers } from '../../openapi/response/list-api-response-pointers.js';

/** Snapshot only declared source data before an asynchronous model invocation. */
export function describeApiBindingPlanning(
  input: ApiBindingPlanningInput,
): ApiBindingPlanningDescription {
  const { scenario } = apiBindingPlanningIdentitySchema.parse({
    scenario: input.scenario,
  });
  createApiBindingSourceRegistry(input);
  const materials = input.materials.map((material) => {
    const parsedOperation = apiBindingPlanningOperationSchema.safeParse(
      material.operation,
    );
    if (!parsedOperation.success)
      throw new Error(
        `binding material ${material.callId}.operation is invalid: ${parsedOperation.error.message}`,
      );
    const options = apiBindingMaterialRoleSchema.parse({
      purpose: material.purpose,
      requestMediaType: material.requestMediaType,
    });
    return {
      callId: material.callId,
      operation: structuredClone(material.operation),
      ...(options.purpose === undefined ? {} : { purpose: options.purpose }),
      ...(options.requestMediaType === undefined
        ? {}
        : { requestMediaType: options.requestMediaType }),
    };
  });
  const snapshot: ApiBindingPlanningInput = {
    scenario,
    materials,
    ...(input.nativeOutputs === undefined
      ? {}
      : {
          nativeOutputs: input.nativeOutputs.map((output) => ({
            nodeId: output.nodeId,
            schema: structuredClone(output.schema),
          })),
        }),
  };
  return {
    input: snapshot,
    context: {
      scenario,
      ...(snapshot.nativeOutputs === undefined
        ? {}
        : { nativeOutputs: structuredClone(snapshot.nativeOutputs) }),
      materials: materials.map(({ operation, ...material }) => ({
        ...material,
        operation: structuredClone({
          key: operation.key,
          method: operation.method,
          path: operation.path,
          operation: operation.operation,
          effective: operation.effective,
        }),
        responsePointerCatalog: listApiResponsePointers(operation),
      })),
    },
  };
}
