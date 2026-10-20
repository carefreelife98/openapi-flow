import { createHash } from 'node:crypto';
import type {
  PrepareWorkflowDraftEditInput,
  StagedWorkflowDraftEdit,
} from '../../types/workflow-draft-edit-assembly.js';
import { resolvePreparedWorkflowDraftEdit } from './assembly/resolve-prepared-workflow-draft-edit.js';
import { resolveWorkflowDraftApiResponseSources } from './references/resolve-workflow-draft-api-response-sources.js';
import { describeWorkflowDraftClarificationOwnership } from './clarification/describe-workflow-draft-clarification-ownership.js';

/** Re-derive completed materials, named missing results and unavailable output sources. */
export function stageWorkflowDraftEdit(
  input: PrepareWorkflowDraftEditInput,
): StagedWorkflowDraftEdit {
  const prepared = resolvePreparedWorkflowDraftEdit(input, 'staged');
  const apiResponseSources = resolveWorkflowDraftApiResponseSources({
    ...input,
    content: prepared.content,
    pendingResolutionStepIds: prepared.pendingResolutionStepIds,
  });
  const blockedContracts = input.plan.steps.flatMap((step) => {
    if (!prepared.pendingResolutionStepIds.includes(step.id)) return [];
    if (
      step.decision.kind === 'replace-api-operation' ||
      step.decision.kind === 'revise-native-node'
    )
      return [step.decision.nodeId];
    if (
      step.decision.kind === 'add-api-call' ||
      step.decision.kind === 'add-native-node'
    )
      return [step.newNodeId!];
    return [];
  });
  const nodeIds = [
    ...prepared.content.apiCalls,
    ...prepared.content.nativeNodes,
  ].map((node) => node.id);
  const blockedSourceNodeIds = [
    ...new Set([
      ...blockedContracts,
      ...prepared.content.requirements.flatMap((requirement) =>
        requirement.state === 'confirmed'
          ? []
          : requirement.scope.kind === 'workflow'
            ? nodeIds
            : requirement.scope.nodeIds,
      ),
    ]),
  ];
  const state = {
    planId: prepared.planId,
    baseRevision: prepared.baseRevision,
    content: prepared.content,
    nodeRemovalConnections: prepared.nodeRemovalConnections,
    pendingResolutionStepIds: prepared.pendingResolutionStepIds,
    clarificationOwnership: describeWorkflowDraftClarificationOwnership({
      draft: input.draft,
      context: input.context,
      requestMessageIds: input.requestMessageIds,
      plan: input.plan,
    }),
    apiResponseSources,
    blockedSourceNodeIds,
    pendingRepairs: prepared.pendingRepairs,
    deferredRequirementIds: prepared.deferredRequirementIds,
    pendingClarificationQuestionIds: prepared.pendingClarificationQuestionIds,
  };
  return {
    kind: 'unvalidated-edit-stage',
    fingerprint: createHash('sha256')
      .update(JSON.stringify(state))
      .digest('hex'),
    ...state,
  };
}
