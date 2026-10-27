import { prepareWorkflowConnectionRevisionSource } from './describe-workflow-connection-revision.js';
import { isDeepStrictEqual } from 'node:util';
import { runOpenApiFlowOperation } from '../../../errors/run-openapi-flow-operation.js';
import type {
  ApplyWorkflowConnectionRevisionInput,
  ValidateWorkflowConnectionRevisionInput,
  WorkflowConnectionRevision,
} from '../../../types/workflow-connection-revision.js';
import type {
  WorkflowConnectionSession,
  WorkflowConnectionStepProposal,
} from '../../../types/workflow-connection-session.js';
import {
  workflowConnectionRevisionProposalSchema,
  workflowConnectionRevisionImpactSchema,
} from '../../../schemas/workflow-connection-revision-schema.js';
import { workflowConnectionSessionSchema } from '../../../schemas/workflow-connection-session-schema.js';
import {
  validateWorkflowConnectionSession,
  validateConnectionStepReferences,
} from '../incremental/validate-workflow-connection-session.js';
import { describeConnectionSessionSource } from '../incremental/describe-connection-session-source.js';
import { createWorkflowConnectionSession } from '../incremental/create-workflow-connection-session.js';
import { applyWorkflowConnectionStep } from '../incremental/apply-workflow-connection-step.js';
import { applyConnectionPatch } from '../incremental/apply-connection-patch.js';
import {
  connectionValueFingerprint,
  connectionGraphFingerprint,
  workflowConnectionEdgeId,
} from '../incremental/connection-graph-identity.js';
import { inspectWorkflowConnectionCompletion } from '../incremental/inspect-workflow-connection-completion.js';
import { analyzeWorkflowConnectionRevisionImpact } from './analyze-workflow-connection-revision-impact.js';
import { WorkflowConnectionRevisionError } from './workflow-connection-revision-error.js';

/** Order and display-only reasons do not make structural goal rewrites progress. */
function goalMeaning(goals: WorkflowConnectionSession['goals']): string {
  return connectionValueFingerprint(
    goals
      .map(({ decision }) => {
        if (decision.kind === 'semantic')
          return connectionValueFingerprint({
            ...decision,
            factIds: [...decision.factIds].sort(),
          });
        const { reason, ...criteria } = decision;
        void reason;
        return connectionValueFingerprint({
          ...criteria,
          factIds: [...criteria.factIds].sort(),
          ...(criteria.kind === 'independent'
            ? { nodeIds: [...criteria.nodeIds].sort() }
            : {}),
          ...(criteria.kind === 'join'
            ? { producerIds: [...criteria.producerIds].sort() }
            : {}),
        });
      })
      .sort(),
  );
}

function resolveRevision(
  input: ApplyWorkflowConnectionRevisionInput,
): WorkflowConnectionRevision {
  const { before, after, expected } =
    prepareWorkflowConnectionRevisionSource(input);
  const proposal = workflowConnectionRevisionProposalSchema.parse(
    input.proposal,
  );
  validateConnectionStepReferences(
    input.before,
    proposal.graphChange,
    new Set(before.source.context.nodes.map((node) => node.id)),
  );
  const graph = applyConnectionPatch({
    graph: {
      edges: input.before.session.edges,
      rootNodeIds: input.before.session.rootNodeIds,
      terminals: input.before.session.terminals,
      assessments: input.before.session.assessments,
    },
    proposal: proposal.graphChange,
    protectedEdgeIds: new Set(
      before.source.input.edges
        .map(workflowConnectionEdgeId)
        .filter((id) => !input.before.editableEdgeIds?.includes(id)),
    ),
  });
  const sourceUpdate = {
    edges: before.source.input.edges.filter((edge) =>
      graph.edges.some(
        (retained) =>
          workflowConnectionEdgeId(retained) === workflowConnectionEdgeId(edge),
      ),
    ),
    ...(input.before.editableEdgeIds === undefined
      ? {}
      : {
          editableEdgeIds: input.before.editableEdgeIds.filter((id) =>
            graph.edges.some((edge) => workflowConnectionEdgeId(edge) === id),
          ),
        }),
  };
  const nextSource = { ...input.after, ...sourceUpdate };
  const nextDescription = describeConnectionSessionSource(nextSource);
  const digest = connectionValueFingerprint({
    previous: expected,
    source: nextDescription.fingerprint,
    proposal,
  });
  const variant = ((Number.parseInt(digest[16], 16) & 3) | 8).toString(16);
  const sessionId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-8${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  // Only executable graph fields cross the epoch. Prior receipts remain in previousSession.
  let session = {
    ...createWorkflowConnectionSession({
      ...nextSource,
      goals: proposal.goals,
    }),
    id: sessionId,
  };
  const impact = workflowConnectionRevisionImpactSchema.parse(
    analyzeWorkflowConnectionRevisionImpact({
      before,
      after,
      previousSession: input.before.session,
      goals: session.goals,
      graph,
    }),
  );
  if (
    impact.affectedFactIds.some(
      (id) => !proposal.graphChange.factIds.includes(id),
    )
  )
    throw new Error(
      'Connection revision must cite every changed goal requirement',
    );
  if (
    impact.changedNodeIds.length === 0 &&
    goalMeaning(input.before.session.goals) === goalMeaning(session.goals) &&
    connectionGraphFingerprint({
      ...graph,
      assessments: input.before.session.assessments,
    }) === connectionGraphFingerprint(input.before.session)
  )
    throw new Error('Connection revision makes no planning progress');
  const adopt = (value: WorkflowConnectionStepProposal) => {
    const result = applyWorkflowConnectionStep({
      ...nextSource,
      session,
      expected: {
        sessionId: session.id,
        sourceFingerprint: session.sourceFingerprint,
        revision: session.revision,
      },
      proposal: value,
    });
    if (result.status !== 'accepted')
      throw new WorkflowConnectionRevisionError(result.violations);
    session = result.session;
  };
  const baselineIds = new Set(session.edges.map(workflowConnectionEdgeId));
  const retainedIds = new Set(graph.edges.map(workflowConnectionEdgeId));
  if (connectionGraphFingerprint(session) !== connectionGraphFingerprint(graph))
    adopt({
      ...proposal.graphChange,
      addEdges: graph.edges.filter(
        (edge) => !baselineIds.has(workflowConnectionEdgeId(edge)),
      ),
      removeEdgeIds: session.edges
        .map(workflowConnectionEdgeId)
        .filter((id) => !retainedIds.has(id)),
      addRootNodeIds: graph.rootNodeIds,
      removeRootNodeIds: [],
      addTerminals: graph.terminals,
      removeTerminals: [],
    });
  const assessments = input.before.session.assessments.filter(
    (assessment) =>
      !impact.invalidatedAssessmentGoalIds.includes(assessment.goalId),
  );
  if (assessments.length)
    adopt({
      kind: 'request-completion',
      assessments: structuredClone(assessments),
      reason:
        'Retain prior assessments whose goals and causal evidence did not change.',
    });
  validateWorkflowConnectionSession({ ...nextSource, session });
  return {
    previous: expected,
    previousSession: structuredClone(input.before.session),
    proposal,
    session,
    impact,
    inspection: inspectWorkflowConnectionCompletion({
      ...nextSource,
      session,
    }),
    sourceUpdate,
  };
}

/** Stage-origin repair is explicit: the caller supplies actual replanned material and a graph/goal proposal. */
export function applyWorkflowConnectionRevision(
  input: ApplyWorkflowConnectionRevisionInput,
): WorkflowConnectionRevision {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'applyWorkflowConnectionRevision',
      stage: 'contract-validation',
      code: 'WORKFLOW_GRAPH_PLANNING_FAILED',
    },
    () => resolveRevision(input),
  );
}

/** Replay against both original source epochs. A receipt is evidence, never an authority flag. */
export function validateWorkflowConnectionRevision(
  input: ValidateWorkflowConnectionRevisionInput,
): void {
  runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'validateWorkflowConnectionRevision',
      stage: 'contract-validation',
      code: 'WORKFLOW_GRAPH_PLANNING_FAILED',
    },
    () => {
      workflowConnectionSessionSchema.parse(input.revision.session);
      const reconstructed = resolveRevision(input);
      if (!isDeepStrictEqual(reconstructed, input.revision))
        throw new Error(
          'Connection revision differs from the original sources and proposal',
        );
    },
  );
}
