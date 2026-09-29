import { validatedDocument } from '../../openapi/common/validate-spec.js';
import { inboundOperationSourcesFromDocument } from '../../openapi/list-inbound-operations.js';
import type {
  InboundRequest,
  InboundResult,
} from '../../types/inbound-workflow.js';
import { assertSerializablePlan, isObject } from '../../utils/validation.js';
import { compileCallbackOperation } from '../callback/compile-callback-workflow.js';
import { compileWebhookOperation } from '../webhook/compile-webhook-workflow.js';

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
  const document = await validatedDocument(spec);
  const selected = inboundOperationSourcesFromDocument(document).find(
    ({ candidate }) => candidate.operationRef === plan.operationRef,
  );
  if (!selected)
    throw new Error(
      'plan.operationRef is not in spec.webhooks or callbacks: ' +
        plan.operationRef,
    );
  const context = { document, selected, plan };
  switch (selected.candidate.source) {
    case 'webhooks':
      return compileWebhookOperation(context);
    case 'callbacks':
      return compileCallbackOperation(context);
  }
}
