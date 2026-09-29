import type {
  InboundResult,
  InboundWorkflowContext,
} from '../../types/inbound-workflow.js';
import { buildInboundWorkflow } from '../inbound/build-inbound-workflow.js';

export function compileWebhookOperation(
  context: InboundWorkflowContext,
): InboundResult {
  if (context.selected.candidate.source !== 'webhooks')
    throw new Error(
      `operationRef ${context.selected.candidate.operationRef} is not an OAS webhook`,
    );
  return buildInboundWorkflow(context);
}
