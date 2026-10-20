import { isDeepStrictEqual } from 'node:util';
import type {
  CreateWorkflowGraphPlanningRecordInput,
  WorkflowGraphPlanningRecord,
} from '../../types/workflow-graph-planning.js';
import {
  workflowGraphPlanningProposalSchema,
  workflowGraphPlanningAssessmentSchema,
  executableGraphPlanningResultSchema,
  reviewableGraphPlanningResultSchema,
  workflowGraphPlanningRecordSchema,
} from '../../schemas/workflow-graph-planning-schema.js';
import { describeWorkflowGraphPlanning } from './describe-workflow-graph-planning.js';
import { createWorkflowGraphPlanningResult } from './create-workflow-graph-planning-result.js';
import { describeWorkflowGraphPlanningVerification } from './describe-workflow-graph-planning-verification.js';

export function createWorkflowGraphPlanningRecord(
  input: CreateWorkflowGraphPlanningRecordInput,
): WorkflowGraphPlanningRecord {
  const {
    input: snapshot,
    context,
    sources,
  } = describeWorkflowGraphPlanning(input);
  const proposal = workflowGraphPlanningProposalSchema.parse(input.proposal);
  const assessment = workflowGraphPlanningAssessmentSchema.parse(
    input.assessment,
  );
  const ids = assessment.nodes.map((node) => node.nodeId);
  if (
    new Set(ids).size !== ids.length ||
    ids.length !== proposal.additionalNativeNodes.length ||
    proposal.additionalNativeNodes.some((node) => !ids.includes(node.id))
  )
    throw new Error(
      'graph reasons must name every additional native node exactly once',
    );
  const edges = assessment.edges.map(({ from, output, to, input }) => ({
    from,
    output,
    to,
    input,
  }));
  const blockedCalls = assessment.blockedCalls.map(({ callId, gapIds }) => ({
    callId,
    gapIds,
  }));
  if (
    !isDeepStrictEqual(edges, proposal.edges) ||
    !isDeepStrictEqual(
      blockedCalls,
      proposal.mode === 'reviewable' ? proposal.blockedCalls : [],
    )
  )
    throw new Error(
      'graph reasons must match every proposed edge and newly blocked call exactly',
    );
  const fields = {
    nativeNodes: input.plan.nativeNodes,
    edges: input.plan.edges,
    gaps: input.plan.gaps,
    starts: input.plan.starts,
  };
  const plan =
    snapshot.mode === 'executable'
      ? executableGraphPlanningResultSchema.parse(fields)
      : reviewableGraphPlanningResultSchema.parse({
          ...fields,
          blockedCalls:
            'blockedCalls' in input.plan ? input.plan.blockedCalls : undefined,
        });
  const expected = createWorkflowGraphPlanningResult({ ...snapshot, proposal });
  if (!isDeepStrictEqual(plan, expected))
    throw new Error(
      'graph planning result differs from original prepared/API materials or proposed graph',
    );
  return workflowGraphPlanningRecordSchema.parse({
    kind: snapshot.mode,
    proposal,
    assessment,
    evidence: { kind: 'supplied-graph-materials', context, sources },
    plan: structuredClone(plan),
    verification: structuredClone(
      describeWorkflowGraphPlanningVerification(snapshot, expected),
    ),
  });
}
