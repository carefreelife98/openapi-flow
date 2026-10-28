import { z } from 'zod';
import {
  workflowConnectionOutlineBundleProposalSchema,
  workflowConnectionOutlineProposalSchema,
} from '@openapi-flow/core';
import type { WorkflowConnectionStepDescription } from '@openapi-flow/core';
import type { WorkflowConnectionOutlineModelProposal } from '../types/workflow-connection-outline.js';

export function createWorkflowConnectionOutlineSchema(
  description: WorkflowConnectionStepDescription,
): z.ZodType<WorkflowConnectionOutlineModelProposal> {
  const ids = description.context.nodes.map((node) => node.id);
  if (!ids.length)
    throw new Error('Outline planning requires actual supplied nodes');
  const bundle = workflowConnectionOutlineBundleProposalSchema
    .pick({ purpose: true, nodeIds: true })
    .extend({
      nodeIds: z
        .array(z.enum(ids))
        .min(1)
        .describe(
          'Choose actual node anchors for a coherent planning task. Shared boundary nodes may appear in several tasks.',
        ),
    });
  return workflowConnectionOutlineProposalSchema.extend({
    bundles: z
      .array(bundle)
      .min(1)
      .describe(
        'Cover all supplied node identities with planning tasks. Core derives typed goal associations and retains all goals globally. Array order is not execution order.',
      ),
  });
}
