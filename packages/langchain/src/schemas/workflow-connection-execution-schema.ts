import { z } from 'zod';
import type { WorkflowConnectionPlanningContext } from '@openapi-flow/core';
import { workflowConnectionProposalSchema } from '@openapi-flow/core';
import type { WorkflowConnectionExecutionOutput } from '../types/workflow-connection-selection.js';
import { createWorkflowConnectionSelectionSchema } from './workflow-connection-selection-schema.js';

/** Validate executable fields independently of optional model-authored display text. */
export function createWorkflowConnectionExecutionSchema(
  context: WorkflowConnectionPlanningContext,
  includeExplanations: boolean,
): z.ZodType<WorkflowConnectionExecutionOutput> {
  const execution = createWorkflowConnectionSelectionSchema(context, false);
  if (!includeExplanations) return execution;
  const display = { reason: z.unknown().optional() };
  const base = execution.extend({
    ...display,
    edges: z.array(execution.shape.edges.element.extend(display)),
  });
  if (context.readyCallIds.length)
    return base.extend({
      blockedCalls: z.array(
        workflowConnectionProposalSchema.shape.blockedCalls.element.extend({
          callId: z.enum(context.readyCallIds),
          ...display,
        }),
      ),
    });
  return base;
}
