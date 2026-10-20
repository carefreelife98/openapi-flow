import type { JsonValueObject } from '../types/api-arguments.js';
import type {
  PlannedNativeNode,
  WorkflowCapability,
} from '../types/workflow-plan.js';
import { parseNativeNodeParameters } from './parse-native-node-parameters.js';
import {
  nativeRuntimeParametersSchema,
  nativeParameterValuesSchema,
} from '../schemas/native-runtime-input-slot-schema.js';
import {
  hasPointer,
  pointerTokens,
  pointerValue,
} from '../bindings/json-pointer.js';
import { createNativeRuntimeParametersSchema } from '../schemas/create-native-runtime-parameters-schema.js';
import { optionalRequestProperties } from '../schemas/operation-plan-schema.js';
import { createOasValueValidator } from '../openapi/common/create-oas-value-validator.js';
import type { BindingSchema } from '../types/api-bindings.js';
import { projectLiteralInputSchema } from '../schemas/project-literal-input-schema.js';

/** {} is a declared binding source, never a fabricated complete parameter value. */
export function resolveNativeStructureParameters(
  planned: PlannedNativeNode,
  capability: WorkflowCapability,
): JsonValueObject {
  if (planned.runtimeParameters === undefined)
    return parseNativeNodeParameters(planned, capability);
  if (capability.supportsRuntimeParameters !== true)
    throw new Error(
      `node ${planned.id}: capability ${capability.name} does not declare runtime-independent parameter structure`,
    );
  const parsed = nativeRuntimeParametersSchema.safeParse(
    planned.runtimeParameters,
  );
  if (!parsed.success)
    throw new Error(
      `node ${planned.id}: runtime-independent parameters require true or explicit pointer selection`,
      { cause: parsed.error },
    );
  const ownership = parsed.data;
  if (ownership !== true) {
    nativeParameterValuesSchema.parse(planned.parameters);
    const seen: string[] = [];
    for (const pointer of ownership.pointers) {
      const tokens = pointerTokens(pointer);
      for (let length = 1; length < tokens.length; length++) {
        const parent =
          '/' +
          tokens
            .slice(0, length)
            .map((token) => token.replaceAll('~', '~0').replaceAll('/', '~1'))
            .join('/');
        if (!hasPointer(planned.parameters, parent)) continue;
        const value = pointerValue(planned.parameters, parent);
        if (value === null || typeof value !== 'object')
          throw new Error(
            `node ${planned.id}: runtime parameter ${pointer} traverses literal non-container ${parent}`,
          );
      }
      if (
        seen.some(
          (other) =>
            other === pointer ||
            other.startsWith(pointer + '/') ||
            pointer.startsWith(other + '/'),
        )
      )
        throw new Error(
          `node ${planned.id}: runtime parameter pointers overlap at ${pointer}`,
        );
      if (hasPointer(planned.parameters, pointer))
        throw new Error(
          `node ${planned.id}: runtime parameter ${pointer} also contains a literal value`,
        );
      seen.push(pointer);
    }
    const literalSchema = optionalRequestProperties(
      createNativeRuntimeParametersSchema(capability),
    ) as BindingSchema;
    const schema = projectLiteralInputSchema(
      literalSchema,
      ownership.pointers.map(pointerTokens),
      `native partial parameters ${planned.id}`,
    ).schema;
    const checked = createOasValueValidator(
      schema,
      'draft-2020-12',
      `native partial parameters ${planned.id}`,
    ).validate(planned.parameters);
    if (!checked.valid)
      throw new Error(
        `node ${planned.id}: partial parameter literals violate their schema: ${checked.errors.map((error) => error.message).join('; ')}`,
      );
    return planned.parameters;
  }
  if (
    !planned.parameters ||
    typeof planned.parameters !== 'object' ||
    Array.isArray(planned.parameters) ||
    Object.keys(planned.parameters).length !== 0
  )
    throw new Error(
      `node ${planned.id}: runtime parameters must not also contain literal parameter values`,
    );
  return planned.parameters;
}
