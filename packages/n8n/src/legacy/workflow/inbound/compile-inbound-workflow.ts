import { validateAndResolveOpenApiDocument } from '@openapi-flow/core/internal';
import { inboundOperationSourcesFromDocument } from '@openapi-flow/core/internal';
import type {
  InboundRequest,
  InboundResult,
} from '../../../types/legacy/inbound-workflow.js';
import { isObject } from '@openapi-flow/core/internal';
import { assertSerializablePlan } from '../common/plan-validation.js';
import { buildInboundWorkflow } from './build-inbound-workflow.js';

export async function compileInboundWorkflow({
  spec,
  plan,
}: InboundRequest): Promise<InboundResult> {
  if (
    !isObject(plan) ||
    plan.version !== '1' ||
    typeof plan.goal !== 'string' ||
    !plan.goal.trim() ||
    typeof plan.operationRef !== 'string' ||
    typeof plan.webhookPath !== 'string' ||
    !plan.webhookPath.trim() ||
    !Number.isInteger(plan.responseStatus) ||
    plan.responseStatus < 100 ||
    plan.responseStatus > 599
  )
    throw new Error(
      'plan must contain version 1, goal, operationRef, webhookPath, and responseStatus',
    );
  assertSerializablePlan(plan);
  const document = await validateAndResolveOpenApiDocument(spec);
  const selected = inboundOperationSourcesFromDocument(document).find(
    ({ candidate }) => candidate.operationRef === plan.operationRef,
  );
  if (!selected)
    throw new Error(
      'plan.operationRef is not in spec.webhooks or callbacks: ' +
        plan.operationRef,
    );
  return buildInboundWorkflow({ document, selected, plan });
}
