import { z } from 'zod';
import { workflowConnectionStepExpectationSchema } from './workflow-connection-session-schema.js';

const text = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0);
const fingerprint =
  workflowConnectionStepExpectationSchema.shape.sourceFingerprint;

export const workflowConnectionOutlineBundleProposalSchema = z.strictObject({
  purpose: text.describe(
    'One coherent planning task, such as a branch, join or dependent sequence; not execution order.',
  ),
  nodeIds: z
    .array(text)
    .min(1)
    .describe(
      'Actual supplied node anchors. Shared boundary nodes may appear in several bundles.',
    ),
  goalIds: z
    .array(text)
    .describe(
      'Actual session goals addressed by this task, not new requirements.',
    ),
  factIds: z
    .array(text)
    .min(1)
    .describe(
      'Unchanged original requirement IDs supporting this planning task.',
    ),
  reason: text.describe(
    'Short evidence-based rationale, not private chain of thought.',
  ),
});
export const workflowConnectionOutlineProposalSchema = z.strictObject({
  purpose: text.describe(
    'Overall confirmed workflow purpose; never replace or relax the original requirements.',
  ),
  bundles: z
    .array(workflowConnectionOutlineBundleProposalSchema)
    .min(1)
    .describe(
      'Planning tasks covering all supplied nodes, goals and facts. Array order does not establish execution order.',
    ),
});
export const workflowConnectionOutlineSchema =
  workflowConnectionOutlineProposalSchema.extend({
    id: fingerprint,
    sessionId: workflowConnectionStepExpectationSchema.shape.sessionId,
    sourceFingerprint: fingerprint,
    goalFingerprint: fingerprint,
    bundles: z
      .array(
        workflowConnectionOutlineBundleProposalSchema.extend({
          id: fingerprint,
        }),
      )
      .min(1),
  });
