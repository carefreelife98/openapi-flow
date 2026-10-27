import { z } from 'zod';
import {
  workflowConnectionOutlineBundleProposalSchema,
  workflowConnectionOutlineProposalSchema,
} from '@openapi-flow/core';
import type {
  WorkflowConnectionStepDescription,
  WorkflowConnectionOutlineProposal,
} from '@openapi-flow/core';
import { connectionIdListSchema } from './connection-planning-field-schemas.js';

export function createWorkflowConnectionOutlineSchema(
  description: WorkflowConnectionStepDescription,
): z.ZodType<WorkflowConnectionOutlineProposal> {
  const ids = description.context.nodes.map((node) => node.id);
  if (!ids.length)
    throw new Error('Outline planning requires actual supplied nodes');
  const bundle = workflowConnectionOutlineBundleProposalSchema.extend({
    nodeIds: z
      .array(z.enum(ids))
      .min(1)
      .describe(
        'Choose actual node anchors for a coherent planning task. Shared boundary nodes may appear in several tasks.',
      ),
    goalIds: connectionIdListSchema(
      description.goals.map((goal) => goal.id),
    ).describe(
      'Select actual current goals addressed by this task; all goals must appear somewhere in the outline.',
    ),
    factIds: z
      .array(z.enum(description.requirements.map((fact) => fact.id)))
      .min(1)
      .describe(
        'Select unchanged original requirement IDs supporting this task; never create replacement requirements.',
      ),
  });
  return workflowConnectionOutlineProposalSchema.extend({
    bundles: z
      .array(bundle)
      .min(1)
      .describe(
        'Cover all supplied node, goal and fact identities with planning tasks. Array order is not execution order.',
      ),
  });
}
