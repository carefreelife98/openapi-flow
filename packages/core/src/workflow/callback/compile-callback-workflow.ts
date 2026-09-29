import type {
  InboundResult,
  InboundWorkflowContext,
} from '../../types/inbound-workflow.js';
import { buildInboundWorkflow } from '../inbound/build-inbound-workflow.js';

export function compileCallbackOperation(
  context: InboundWorkflowContext,
): InboundResult {
  const { candidate } = context.selected;
  if (candidate.source !== 'callbacks' || !candidate.parentOperationRef)
    throw new Error(
      `operationRef ${candidate.operationRef} is not an OAS callback with a parent operation`,
    );
  return buildInboundWorkflow(context);
}
