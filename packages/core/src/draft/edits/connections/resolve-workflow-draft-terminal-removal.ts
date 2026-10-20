import { createHash } from 'node:crypto';
import type {
  WorkflowDraftTerminalRemovalInput,
  WorkflowDraftTerminalRemovalResult,
} from '../../../types/workflow-draft-terminal-removal.js';
import { stageWorkflowDraftEdit } from '../stage-workflow-draft-edit.js';
import { assembleWorkflowDraftEdit } from '../assemble-workflow-draft-edit.js';

/** Deleting only a terminal subgraph needs incident-edge removal, never invented reconnection. */
export function resolveWorkflowDraftTerminalRemoval(
  input: WorkflowDraftTerminalRemovalInput,
): WorkflowDraftTerminalRemovalResult {
  const stage = stageWorkflowDraftEdit(input);
  if (
    !input.plan.steps.length ||
    input.plan.steps.some((step) => step.decision.kind !== 'remove-node')
  )
    return { status: 'not-applicable' };
  const removedNodeIds = input.plan.steps.flatMap((step) =>
    step.decision.kind === 'remove-node' ? [step.decision.nodeId] : [],
  );
  if (
    stage.pendingResolutionStepIds.length ||
    stage.pendingRepairs.length ||
    stage.blockedSourceNodeIds.length ||
    stage.pendingClarificationQuestionIds.length ||
    stage.deferredRequirementIds.length ||
    input.draft.edges.some(
      (edge) =>
        removedNodeIds.includes(edge.from) && !removedNodeIds.includes(edge.to),
    )
  )
    return { status: 'not-applicable' };
  const connections = stage.nodeRemovalConnections;
  const fields = {
    kind: 'terminal-node-removal' as const,
    removedNodeIds,
    connections,
    candidate: assembleWorkflowDraftEdit(input),
  };
  return {
    status: 'ready',
    result: {
      fingerprint: createHash('sha256')
        .update(JSON.stringify([input.plan, stage.fingerprint, fields]))
        .digest('hex'),
      ...fields,
    },
  };
}
