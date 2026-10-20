import { isDeepStrictEqual } from 'node:util';
import type {
  CreateWorkflowConnectionPlanningRecordInput,
  WorkflowConnectionPlanningRecord,
} from '../../types/workflow-connection-planning.js';
import {
  workflowConnectionDecisionSchema,
  workflowConnectionPlanningResultSchema,
  workflowConnectionPlanningRecordSchema,
} from '../../schemas/workflow-connection-planning-schema.js';
import { describeWorkflowConnectionPlanning } from './describe-workflow-connection-planning.js';
import { projectWorkflowConnectionDecision } from './project-workflow-connection-decision.js';
import { createWorkflowConnectionPlan } from './create-workflow-connection-plan.js';
import { createReviewableNodeContracts } from '../create-reviewable-node-contracts.js';

export function createWorkflowConnectionPlanningRecord(
  input: CreateWorkflowConnectionPlanningRecordInput,
): WorkflowConnectionPlanningRecord {
  const {
    input: snapshot,
    context,
    sources,
  } = describeWorkflowConnectionPlanning(input);
  const decision = workflowConnectionDecisionSchema.parse(input.decision);
  const plan = workflowConnectionPlanningResultSchema.parse({
    nativeNodes: input.plan.nativeNodes,
    edges: input.plan.edges,
    gaps: input.plan.gaps,
    blockedCalls: input.plan.blockedCalls,
    starts: input.plan.starts,
  });
  const expected = createWorkflowConnectionPlan({
    ...snapshot,
    proposal: projectWorkflowConnectionDecision(decision),
  });
  if (!isDeepStrictEqual(plan, expected))
    throw new Error(
      'connection planning result differs from its original fixed materials or explained proposal',
    );
  return workflowConnectionPlanningRecordSchema.parse({
    kind: 'proposed-connections',
    decision,
    plan: structuredClone(plan),
    evidence: { kind: 'supplied-connection-materials', context, sources },
    verification: {
      contracts: structuredClone(
        createReviewableNodeContracts({ ...snapshot, plan }),
      ),
    },
  });
}
