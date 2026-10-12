import { z } from 'zod';
import type { WorkflowCapabilityPlanningContext } from '@openapi-flow/core';
import {
  nativeOperandSchema,
  nativeCheckSchema,
  ifParametersSchema,
  assertionParametersSchema,
} from './native-capability-schemas.js';

function createPlanningCheckSchema({
  apiCallIds,
}: WorkflowCapabilityPlanningContext) {
  const literal = nativeOperandSchema.options[1];
  const operand =
    apiCallIds.length === 0
      ? literal
      : z.union([
          nativeOperandSchema.options[0].extend({
            nodeId: z
              .enum(apiCallIds)
              .describe(
                'Exact supplied API callId; choose a response source, never create an ID.',
              ),
          }),
          literal,
        ]);
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
        'Only conditions required by the scenario, with supplied API callIds and OAS-derived response pointers.',
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
        'Declarative assertions over supplied API responses. Exact API callIds only; no invented references or model-written JavaScript.',
      ),
  });
}
