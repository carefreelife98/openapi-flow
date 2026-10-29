import {
  createResponseValueSchema,
  createNativeValueSchema,
  projectNativeValueSchema,
  NativeSchemaProjectionError,
  isSchemaProvablyEmpty,
} from '@openapi-flow/core';
import type {
  BindingSchema,
  WorkflowNativeMaterialSources,
  NativeSchemaProjectionStep,
} from '@openapi-flow/core';
import type {
  ResponseEvaluationRule,
  ResponseEvaluationRuleContract,
} from '../../../types/response-evaluation.js';

/** Project only declared source contracts; never turn a missing field into a value. */
export function describeResponseEvaluationRule(
  rule: ResponseEvaluationRule,
  sources: WorkflowNativeMaterialSources,
): ResponseEvaluationRuleContract {
  const reference = rule.source;
  let schema: BindingSchema;
  if (reference.source === 'response') {
    const material = sources.apiMaterials.find(
      (entry) => entry.callId === reference.nodeId,
    );
    if (!material)
      throw new Error(`Evaluation requires supplied API ${reference.nodeId}`);
    schema = createResponseValueSchema(material.operation, reference.pointer);
  } else {
    const output = sources.nativeOutputs.find(
      (entry) => entry.nodeId === reference.nodeId,
    );
    if (!output)
      throw new Error(
        `Evaluation requires actual native output ${reference.nodeId}`,
      );
    schema =
      rule.kind === 'unassessed'
        ? createNativeValueSchema(output, reference.pointer)
        : output.schema;
  }
  if (rule.kind === 'unassessed') return { rule };
  const steps: NativeSchemaProjectionStep[] = [
    {
      kind: 'value',
      pointer: reference.source === 'response' ? '' : reference.pointer,
    },
  ];
  if (rule.scope === 'array-items') steps.push({ kind: 'array-items' });
  else if (rule.scope === 'object-values')
    steps.push({ kind: 'object-entries' });
  steps.push({ kind: 'value', pointer: rule.valuePointer });
  if (rule.measurement === 'array-length')
    steps.push({ kind: 'require-array' });
  let valueSchema: BindingSchema;
  try {
    valueSchema = projectNativeValueSchema({
      output: { nodeId: reference.nodeId, schema },
      steps,
    });
  } catch (cause) {
    if (
      cause instanceof NativeSchemaProjectionError &&
      cause.step.kind === 'require-array'
    )
      throw new Error(
        `Evaluation ${reference.nodeId}${reference.pointer}${rule.valuePointer} cannot measure a declared non-array`,
        { cause },
      );
    throw cause;
  }
  if (
    rule.measurement === 'value' &&
    rule.cases.every(
      (entry) =>
        entry.operator === 'greaterThan' || entry.operator === 'lessThan',
    ) &&
    isSchemaProvablyEmpty({ allOf: [valueSchema, { type: 'number' }] })
  )
    throw new Error(
      `Evaluation ${reference.nodeId}${reference.pointer}${rule.valuePointer} cannot compare a declared non-number numerically`,
    );
  return { rule, valueSchema };
}
