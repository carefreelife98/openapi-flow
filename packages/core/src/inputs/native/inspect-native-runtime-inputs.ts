import type {
  InspectNativeRuntimeInputsInput,
  NativeRuntimeInputInspection,
  NativeRuntimeInputIssue,
} from '../../types/native-runtime-inputs.js';
import { deferredApiInputValuesSchema } from '../../schemas/deferred-api-input-schema.js';
import { collectNativeRuntimeInputSlots } from './collect-native-runtime-input-slots.js';
import { parseNativeNodeParameters } from '../../workflow/parse-native-node-parameters.js';
import { createOasValueValidator } from '../../openapi/common/create-oas-value-validator.js';
import type { PlannedNativeNode } from '../../types/workflow-plan.js';
import type { JsonValueObject } from '../../types/api-arguments.js';
import { nativeParameterValuesSchema } from '../../schemas/native-runtime-input-slot-schema.js';
import { createNativeRuntimeParameterMaterializations } from './create-native-runtime-parameter-materialization.js';
import { materializeNativeRuntimeParameters } from './materialize-native-runtime-parameters.js';

export function inspectNativeRuntimeInputs(
  input: InspectNativeRuntimeInputsInput,
): NativeRuntimeInputInspection {
  const slots = collectNativeRuntimeInputSlots(input);
  const parsed = deferredApiInputValuesSchema.safeParse(input.inputValues);
  if (!parsed.success)
    return {
      status: 'invalid-input',
      slots,
      issues: [
        {
          code: 'invalid-value',
          inputId: '',
          message: 'native inputValues must be a JSON value map',
        },
      ],
    };
  const values = parsed.data;
  const known = new Set(slots.map((slot) => slot.id));
  const issues: NativeRuntimeInputIssue[] = Object.keys(values)
    .filter((id) => !known.has(id))
    .map((inputId) => ({
      code: 'unknown-input',
      inputId,
      message: `Undeclared or stale native runtime input ${inputId}`,
    }));
  const resolved = new Map<string, PlannedNativeNode>();
  for (const slot of slots) {
    if (!Object.hasOwn(values, slot.id)) {
      issues.push({
        code: 'missing-input',
        inputId: slot.id,
        nodeId: slot.nodeId,
        message: `Missing native runtime input ${slot.id} for ${slot.nodeId}`,
      });
      continue;
    }
    if (
      slot.targetPointer === '' &&
      !nativeParameterValuesSchema.safeParse(values[slot.id]).success
    ) {
      issues.push({
        code: 'invalid-value',
        inputId: slot.id,
        nodeId: slot.nodeId,
        message: `Native runtime input ${slot.nodeId} must be a JSON parameter object`,
      });
      continue;
    }
    try {
      const checked = createOasValueValidator(
        slot.schema,
        'draft-2020-12',
        `native input ${slot.nodeId}`,
      ).validate(values[slot.id]);
      if (!checked.valid)
        throw new Error(
          checked.errors.map((error) => error.message).join('; '),
        );
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      issues.push({
        code: 'invalid-value',
        inputId: slot.id,
        nodeId: slot.nodeId,
        message: `Native runtime input ${slot.nodeId} violates its original parameter schema: ${error.message}`,
      });
    }
  }
  if (issues.length)
    return {
      status: issues.every((issue) => issue.code === 'missing-input')
        ? 'needs-input'
        : 'invalid-input',
      slots,
      issues,
    };
  for (const material of createNativeRuntimeParameterMaterializations(input)) {
    const node = input.nativeNodes.find((node) => node.id === material.nodeId)!;
    const capability = input.capabilities.find(
      (entry) => entry.name === node.capability,
    )!;
    try {
      const parameters = parseNativeNodeParameters(
        {
          id: node.id,
          capability: node.capability,
          parameters: materializeNativeRuntimeParameters(material, values),
        },
        capability,
      );
      const checked = createOasValueValidator(
        material.schema,
        'draft-2020-12',
        `native complete input ${node.id}`,
      ).validate(parameters);
      if (!checked.valid)
        throw new Error(
          checked.errors.map((error) => error.message).join('; '),
        );
      resolved.set(node.id, {
        id: node.id,
        capability: node.capability,
        parameters: structuredClone(parameters) as JsonValueObject,
      });
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      issues.push({
        code: 'invalid-value',
        inputId: material.inputs[0].id,
        nodeId: node.id,
        message: `Native runtime input ${node.id} violates its complete original parameter schema: ${error.message}`,
      });
    }
  }
  if (issues.length) return { status: 'invalid-input', slots, issues };
  return {
    status: 'ready',
    slots,
    issues: [],
    nativeNodes: input.nativeNodes.map((node) =>
      node.runtimeParameters !== undefined
        ? resolved.get(node.id)!
        : structuredClone(node),
    ),
  };
}
