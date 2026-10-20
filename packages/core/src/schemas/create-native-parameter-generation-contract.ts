import { z } from 'zod';
import type { JsonValueObject } from '../types/api-arguments.js';
import type {
  NativeParameterGenerationInput,
  NativeParameterGenerationContract,
} from '../types/native-node-planning.js';
import { collectNativeRuntimeInputSlots } from '../inputs/native/collect-native-runtime-input-slots.js';
import { hasFixedEmptyNativeParameters } from '../workflow/planning/has-fixed-empty-native-parameters.js';
import { projectNativeLiteralParameters } from './project-native-literal-parameters.js';
import { createJsonSchemaValueSchema } from './create-json-schema-value-schema.js';
import { createSchemaResourceContext } from '../bindings/resources/create-schema-resource-context.js';

/** Shared by standalone and draft planning; only explicit owners remove value choices. */
export function createNativeParameterGenerationContract(
  input: NativeParameterGenerationInput,
): NativeParameterGenerationContract {
  const { capability, runtimeParameters } = input;
  const original = z.toJSONSchema(capability.parametersSchema, {
    io: 'input',
    target: 'draft-2020-12',
    reused: 'inline',
    cycles: 'ref',
  });
  if (runtimeParameters !== undefined)
    collectNativeRuntimeInputSlots({
      nativeNodes: [
        {
          id: input.nodeId,
          capability: capability.name,
          parameters: {},
          runtimeParameters,
        },
      ],
      capabilities: [capability],
    });
  if (runtimeParameters === undefined)
    return {
      literalParametersSchema: original,
      valuesSchema: capability.parametersSchema,
      definitions: {},
      hasLiteralParameters: !hasFixedEmptyNativeParameters(
        original,
        capability,
      ),
    };
  if (runtimeParameters === true)
    return {
      literalParametersSchema: false,
      valuesSchema: z.strictObject({}),
      definitions: {},
      hasLiteralParameters: false,
    };
  const projected = projectNativeLiteralParameters(
    original,
    runtimeParameters.pointers,
    `Native instance ${input.nodeId}`,
  );
  if (typeof projected.schema === 'boolean')
    throw new Error(
      `Native instance ${input.nodeId} literal parameters require an object schema`,
    );
  const resources = createSchemaResourceContext(projected.schema);
  const wire = resources.bundleStaticProjections({
    parameters: resources.root,
  });
  const projection = wire.projections.parameters;
  return {
    literalParametersSchema: projected.schema,
    hasLiteralParameters: projected.hasLiteralValues,
    definitions: wire.definitions,
    valuesSchema: createJsonSchemaValueSchema(
      projected.schema,
      `Native instance ${input.nodeId} literals`,
    ).meta(
      typeof projection === 'boolean' ? { not: {} } : projection,
    ) as z.ZodType<JsonValueObject>,
  };
}
