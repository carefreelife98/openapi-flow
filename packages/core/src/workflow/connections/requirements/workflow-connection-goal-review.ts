import { isDeepStrictEqual } from 'node:util';
import type { WorkflowConnectionSessionInput } from '../../../types/workflow-connection-session.js';
import type {
  WorkflowConnectionGoalReviewDescription,
  WorkflowConnectionGoalReview,
  CreateWorkflowConnectionGoalReviewInput,
  ValidateWorkflowConnectionGoalReviewInput,
} from '../../../types/workflow-connection-goal-review.js';
import {
  workflowConnectionGoalReviewProposalSchema,
  workflowConnectionGoalReviewSchema,
} from '../../../schemas/workflow-connection-goal-review-schema.js';
import { runOpenApiFlowOperation } from '../../../errors/run-openapi-flow-operation.js';
import { describeWorkflowConnectionGoals } from '../incremental/describe-workflow-connection-goals.js';
import { describeWorkflowConnectionStep } from '../incremental/describe-workflow-connection-step.js';
import { describeWorkflowConnectionConflictMaterials } from '../materials/describe-workflow-connection-conflict-materials.js';
import { workflowConnectionEdgeId } from '../incremental/connection-graph-identity.js';

/** Coverage judgment is model evidence, not a code proof of natural-language meaning or a final graph assessment. */
export function describeWorkflowConnectionGoalReview(
  input: WorkflowConnectionSessionInput,
): WorkflowConnectionGoalReviewDescription {
  const description = describeWorkflowConnectionGoals(input);
  const step = describeWorkflowConnectionStep(input);
  const nodeIds = description.context.nodes.map((node) => node.id);
  return {
    scope: 'initial-goal-interpretation-before-connection-planning',
    sourceFingerprint: description.sourceFingerprint,
    requirements: description.requirements,
    apiOperations: description.apiOperations,
    nodeContracts: description.context.nodes,
    codePolicies: [
      {
        id: 'preserve-protected-original-edges',
        protectedEdges: structuredClone(
          description.context.edges.filter(
            (edge) =>
              !input.editableEdgeIds?.includes(workflowConnectionEdgeId(edge)),
          ),
        ),
        enforcement: 'core-atomic-connection-validation',
      },
    ],
    sessionId: input.session.id,
    goalFingerprint: input.session.goalFingerprint,
    goals: step.goals,
    materials:
      nodeIds.length === 0
        ? { apiCalls: [], nativeNodes: [], apiResponseContracts: [] }
        : describeWorkflowConnectionConflictMaterials({
            source: input,
            nodeIds,
          }),
  };
}

export function createWorkflowConnectionGoalReview(
  input: CreateWorkflowConnectionGoalReviewInput,
): WorkflowConnectionGoalReview {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'createWorkflowConnectionGoalReview',
      stage: 'contract-validation',
      code: 'WORKFLOW_GRAPH_PLANNING_FAILED',
    },
    () => {
      const description = describeWorkflowConnectionGoalReview(input);
      const proposal = workflowConnectionGoalReviewProposalSchema.parse(
        input.proposal,
      );
      if (!isDeepStrictEqual(proposal, input.proposal))
        throw new Error('Goal review must preserve the exact proposal');
      const facts = new Map(
        description.requirements.map((fact) => [fact.id, fact]),
      );
      const goals = new Set(description.goals.map((goal) => goal.id));
      const policies = new Set(
        description.codePolicies.map((policy) => policy.id),
      );
      const ids = new Set(proposal.assessments.map((item) => item.factId));
      if (
        ids.size !== proposal.assessments.length ||
        ids.size !== facts.size ||
        [...ids].some((id) => !facts.has(id))
      )
        throw new Error(
          'Goal review must assess every supplied requirement exactly once',
        );
      for (const assessment of proposal.assessments) {
        const fact = facts.get(assessment.factId)!;
        if (
          new Set(assessment.goalIds).size !== assessment.goalIds.length ||
          assessment.goalIds.some((id) => !goals.has(id))
        )
          throw new Error(
            `Goal review cites unknown or duplicate goals for ${fact.id}`,
          );
        if (
          new Set(assessment.policyIds).size !== assessment.policyIds.length ||
          assessment.policyIds.some((id) => !policies.has(id))
        )
          throw new Error(
            `Goal review cites unknown or duplicate code policies for ${fact.id}`,
          );
        if (
          assessment.status === 'covered' &&
          assessment.goalIds.length + assessment.policyIds.length === 0
        )
          throw new Error(
            `Covered requirement ${fact.id} needs actual goal or code-policy evidence`,
          );
        if (assessment.sourceQuotes.some((quote) => !fact.text.includes(quote)))
          throw new Error(
            `Goal review quote is not an exact part of requirement ${fact.id}`,
          );
      }
      return {
        sessionId: description.sessionId,
        sourceFingerprint: description.sourceFingerprint,
        goalFingerprint: description.goalFingerprint,
        assessments: structuredClone(proposal.assessments),
        accepted: proposal.assessments.every(
          (item) => item.status === 'covered',
        ),
      };
    },
  );
}

/** A review targets goals/material, not subsequent edge revisions. Native/material or goal changes require a new review. */
export function validateWorkflowConnectionGoalReview(
  input: ValidateWorkflowConnectionGoalReviewInput,
): void {
  runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'validateWorkflowConnectionGoalReview',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const review = workflowConnectionGoalReviewSchema.parse(input.review);
      const checked = createWorkflowConnectionGoalReview({
        ...input,
        proposal: { assessments: review.assessments },
      });
      if (
        !isDeepStrictEqual(review, input.review) ||
        !isDeepStrictEqual(checked, review)
      )
        throw new Error(
          'Goal review differs from the current source, session, goals or assessment result',
        );
    },
  );
}
