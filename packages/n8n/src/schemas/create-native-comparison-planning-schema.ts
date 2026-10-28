import { z } from 'zod';
import type { WorkflowCapabilityPlanningContext } from '@openapi-flow/core';
import {
  createNativeOutputPointerSelectionSchema,
  isSchemaProvablyEmpty,
} from '@openapi-flow/core';
import type {
  NativeOperand,
  NativeReferenceOperand,
} from '../types/native-capability.js';
import {
  nativeResponseOperandSchema,
  nativeLiteralOperandSchema,
  nativeOutputOperandSchema,
  nativeCheckSchema,
  ifParametersSchema,
  assertionParametersSchema,
} from './native-capability-schemas.js';

export function createPlanningReferenceSchemas({
  apiCallIds,
  nativeOutputs,
}: WorkflowCapabilityPlanningContext) {
  const variants: z.ZodType<NativeReferenceOperand>[] = [];
  if (apiCallIds.length)
    variants.push(
      nativeResponseOperandSchema.extend({
        nodeId: z
          .enum(apiCallIds)
          .describe(
            'Exact supplied API callId; choose a response source, never create an ID.',
          ),
      }),
    );
  for (const output of nativeOutputs === undefined ? [] : nativeOutputs) {
    const pointer = createNativeOutputPointerSelectionSchema(output);
    if (isSchemaProvablyEmpty(z.toJSONSchema(pointer))) continue;
    variants.push(
      nativeOutputOperandSchema.extend({
        nodeId: z.literal(output.nodeId),
        pointer,
      }),
    );
  }
  return variants;
}

function createPlanningCheckSchema(context: WorkflowCapabilityPlanningContext) {
  const variants: z.ZodType<NativeOperand>[] = [
    nativeLiteralOperandSchema,
    ...createPlanningReferenceSchemas(context),
  ];
  const operand =
    variants.length === 1 ? nativeLiteralOperandSchema : z.union(variants);
  return nativeCheckSchema.extend({ left: operand, right: operand });
}

export function createIfPlanningParametersSchema(
  context: WorkflowCapabilityPlanningContext,
) {
  return ifParametersSchema.extend({
    conditions: z
      .array(createPlanningCheckSchema(context))
      .min(1)
      .describe(
        'Only scenario-required comparisons of supplied API responses or actual declared native outputs. Keep source values and types unchanged.',
      ),
  });
}

export function createAssertionPlanningParametersSchema(
  context: WorkflowCapabilityPlanningContext,
) {
  const check = createPlanningCheckSchema(context);
  return assertionParametersSchema.extend({
    checks: z
      .array(
        assertionParametersSchema.shape.checks.element.extend({
          left: check.shape.left,
          right: check.shape.right,
        }),
      )
      .min(1)
      .describe(
        'Declarative assertions over supplied API responses or actual native outputs. Exact supplied IDs and pointers only; no invented references or model-written JavaScript.',
      ),
  });
}
