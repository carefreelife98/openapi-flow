import { z } from 'zod';
import { planningEvidenceTextSchema as text } from './planning-evidence-schema.js';
import { workflowConnectionGoalProposalSchema } from './workflow-connection-session-schema.js';

export const workflowPlanningConstraintGoalsSchema = z.array(
  workflowConnectionGoalProposalSchema,
);

export const workflowPlanningDependencySchema = z.strictObject({
  from: text,
  to: text,
  scope: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('node') }),
    z.strictObject({ kind: z.literal('input-port'), port: text }),
  ]),
  origin: z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('value-reference'),
      source: z.enum(['response', 'node-output']),
      pointer: z.string(),
    }),
    z.strictObject({ kind: z.literal('native-dependency') }),
    z.strictObject({ kind: z.literal('protected-connection'), edgeId: text }),
    z.strictObject({
      kind: z.literal('goal'),
      goalIndex: z.number().int().nonnegative(),
      factIds: z.array(text).min(1),
      goalKind: z.enum(['precedence', 'route', 'join']),
    }),
  ]),
});

export const workflowPlanningConflictSchema = z.strictObject({
  code: z.enum(['DEPENDENCY_CYCLE', 'INDEPENDENCE_CONFLICT']),
  message: text,
  nodeIds: z.array(text).min(1),
  goalIndexes: z.array(z.number().int().nonnegative()),
  dependencies: z.array(workflowPlanningDependencySchema).min(1),
});

/** A necessary-condition inspection, never proof of complete workflow semantics. */
export const workflowPlanningConstraintInspectionSchema = z.strictObject({
  checkedScope: z.literal('necessary-node-order'),
  dependencies: z.array(workflowPlanningDependencySchema),
  conflicts: z.array(workflowPlanningConflictSchema),
});
