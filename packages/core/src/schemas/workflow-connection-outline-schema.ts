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
      'Optional legacy trace IDs. Core derives goal association from typed session goals and actual node anchors.',
    )
    .optional(),
  factIds: z
    .array(text)
    .describe(
      'Unchanged original requirement IDs supporting this planning task.',
    )
    .optional(),
  reason: text
    .describe(
      'Optional evidence-based UI trace, not private chain of thought or completion proof.',
    )
    .optional(),
});
export const workflowConnectionOutlineProposalSchema = z.strictObject({
  purpose: text.describe(
    'Overall confirmed workflow purpose; never replace or relax the original requirements.',
  ),
  bundles: z
    .array(workflowConnectionOutlineBundleProposalSchema)
    .min(1)
    .describe(
      'Planning tasks covering all supplied nodes. Core retains every session goal globally. Array order does not establish execution order.',
    ),
});
export const workflowConnectionOutlineSchema =
  workflowConnectionOutlineProposalSchema.extend({
    id: fingerprint,
    sessionId: workflowConnectionStepExpectationSchema.shape.sessionId,
    sourceFingerprint: fingerprint,
    goalFingerprint: fingerprint,
    goalIds: z.array(text).min(1).describe('Every unchanged session goal ID.'),
    globalGoalIds: z
      .array(text)
      .describe(
        'Semantic goals and structural goals spanning bundles; always checked by whole-session completion.',
      ),
    bundles: z
      .array(
        workflowConnectionOutlineBundleProposalSchema.extend({
          id: fingerprint,
          scope: z
            .enum(['local', 'global'])
            .describe(
              'Local model grouping or code-owned whole-session goal work; neither proves goal satisfaction.',
            ),
          goalIds: z
            .array(text)
            .describe(
              'Code-derived goals touching actual bundle anchors; association is not satisfaction.',
            ),
        }),
      )
      .min(1),
  });
