import {
  createResponseValueSchema,
  createNativeValueSchema,
  createNativeArrayItemSchema,
  createNativeObjectEntrySchema,
  isSchemaProvablyEmpty,
} from '@openapi-flow/core';
import type {
  BindingSchema,
  WorkflowNativeMaterialSources,
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
    schema = createNativeValueSchema(output, reference.pointer);
  }
  if (rule.kind === 'unassessed') return { rule };
  const root = { nodeId: reference.nodeId, schema };
  const itemSchema =
    rule.scope === 'value'
      ? schema
      : rule.scope === 'array-items'
        ? createNativeArrayItemSchema(root, '')
        : createNativeObjectEntrySchema(root, '');
  const valueSchema = createNativeValueSchema(
    { nodeId: reference.nodeId, schema: itemSchema },
    rule.valuePointer,
  );
  if (rule.measurement === 'array-length') {
    try {
      createNativeArrayItemSchema(
        { nodeId: reference.nodeId, schema: valueSchema },
        '',
      );
    } catch (cause) {
      throw new Error(
        `Evaluation ${reference.nodeId}${reference.pointer}${rule.valuePointer} cannot measure a declared non-array`,
        { cause },
      );
    }
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
