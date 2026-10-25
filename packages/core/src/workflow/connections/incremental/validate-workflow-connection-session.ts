import { isDeepStrictEqual } from 'node:util';
import type {
  WorkflowConnectionSessionInput,
  WorkflowConnectionSessionValidation,
  WorkflowConnectionWorkingGraph,
  WorkflowConnectionStepProposal,
} from '../../../types/workflow-connection-session.js';
import { workflowConnectionSessionSchema } from '../../../schemas/workflow-connection-session-schema.js';
import { describeConnectionSessionSource } from './describe-connection-session-source.js';
import { resolveConnectionGoals } from './resolve-connection-goals.js';
import { applyConnectionPatch } from './apply-connection-patch.js';
import {
  workflowConnectionEdgeId,
  connectionValueFingerprint,
  connectionGraphFingerprint,
} from './connection-graph-identity.js';
import { inspectConnectionGraph } from './inspect-connection-graph.js';

export function validateConnectionStepReferences(
  input: WorkflowConnectionSessionInput,
  proposal: WorkflowConnectionStepProposal,
  nodeIds: Set<string>,
): void {
  const facts = new Set(input.requirements.map((item) => item.id));
  if (proposal.kind === 'patch') {
    if (
      new Set(proposal.factIds).size !== proposal.factIds.length ||
      proposal.factIds.some((id) => !facts.has(id))
    )
      throw new Error('Connection step references unknown or duplicate facts');
    return;
  }
  if (
    new Set(proposal.assessments.map((item) => item.goalId)).size !==
    proposal.assessments.length
  )
    throw new Error('Duplicate completion assessments');
  for (const item of proposal.assessments) {
    if (
      !input.session.goals.some(
        (goal) => goal.id === item.goalId && goal.decision.kind === 'semantic',
      ) ||
      item.nodeIds.some((id) => !nodeIds.has(id)) ||
      new Set(item.nodeIds).size !== item.nodeIds.length ||
      (item.satisfied && !item.nodeIds.length)
    )
      throw new Error(
        'Completion assessment requires a known semantic goal and actual node evidence',
      );
  }
}

/** Reconstruct from accepted receipts. Do not trust mutable state or stored checked flags. */
export function validateWorkflowConnectionSession(
  input: WorkflowConnectionSessionInput,
): WorkflowConnectionSessionValidation {
  const session = workflowConnectionSessionSchema.parse(input.session);
  const description = describeConnectionSessionSource(input);
  if (session.sourceFingerprint !== description.fingerprint)
    throw new Error(
      'Connection session belongs to a different source snapshot',
    );
  const expectedGoals = resolveConnectionGoals(
    input,
    description.source.context.nodes,
    session.goals.map((goal) => goal.decision),
  );
  if (
    !isDeepStrictEqual(expectedGoals, session.goals) ||
    connectionValueFingerprint(session.goals) !== session.goalFingerprint
  )
    throw new Error('Connection goals or identities changed');
  if (session.revision !== session.history.length)
    throw new Error('Connection revision differs from accepted step history');
  let graph: WorkflowConnectionWorkingGraph = {
    edges: structuredClone(description.source.input.edges),
    rootNodeIds: [],
    terminals: [],
    assessments: [],
  };
  const visitedGraphFingerprints = new Set([connectionGraphFingerprint(graph)]);
  const protectedEdgeIds = new Set(
    description.source.input.edges
      .map(workflowConnectionEdgeId)
      .filter((id) => !input.editableEdgeIds?.includes(id)),
  );
  for (const [index, receipt] of session.history.entries()) {
    if (receipt.baseRevision !== index)
      throw new Error('Connection step history has a stale revision');
    validateConnectionStepReferences(
      input,
      receipt.proposal,
      new Set(description.source.context.nodes.map((node) => node.id)),
    );
    graph =
      receipt.proposal.kind === 'patch'
        ? applyConnectionPatch({
            graph,
            proposal: receipt.proposal,
            protectedEdgeIds,
          })
        : {
            ...graph,
            assessments: structuredClone(receipt.proposal.assessments),
          };
    const inspection = inspectConnectionGraph({
      contracts: description.source.context.nodes,
      graph,
      apiIds: new Set(description.source.context.readyCallIds),
    });
    if (inspection.violations.length)
      throw new Error('Connection history contains an invalid accepted step', {
        cause: inspection.violations,
      });
    const fingerprint = connectionGraphFingerprint(graph);
    if (visitedGraphFingerprints.has(fingerprint))
      throw new Error('Connection history repeats a previous planning state');
    visitedGraphFingerprints.add(fingerprint);
  }
  if (
    !isDeepStrictEqual(graph, {
      edges: session.edges,
      rootNodeIds: session.rootNodeIds,
      terminals: session.terminals,
      assessments: session.assessments,
    })
  )
    throw new Error('Connection state differs from its accepted step history');
  return { ...description, visitedGraphFingerprints };
}
