import { isDeepStrictEqual } from 'node:util';
import {
  assembleWorkflowDraftEdit,
  resolveWorkflowDraftConnectionEdit,
  approveWorkflowDraft,
  inspectDraftReadiness,
  createWorkflowDraftEditCandidateContext,
  validateWorkflowDraftNativeDependencyResolutions,
  resolveWorkflowDraftTerminalRemoval,
} from '@openapi-flow/core';
import type {
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationState,
  WorkflowDraftConversationUpdate,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationEditInput } from './draft-conversation-context.js';
import { draftConversationReviewToken } from './draft-conversation-review-token.js';

/** Re-derive from original validated decisions. A persisted preview/change set is never mutation authority. */
export function adoptDraftConversationCandidate(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): WorkflowDraftConversationUpdate {
  const input = draftConversationEditInput(state, dependencies);
  if (state.nativeDependencies !== undefined)
    validateWorkflowDraftNativeDependencyResolutions({
      ...input,
      producerDependencies: state.nativeDependencies,
    });
  if (!state.candidate || !state.events)
    throw new Error('Conversation adoption requires a validated candidate');
  if (
    dependencies.reviewPolicy === 'review' &&
    state.candidate.result.status === 'changed'
  ) {
    if (!state.candidateApproved || state.review?.phase !== 'candidate')
      throw new Error(
        'Conversation candidate requires explicit human approval',
      );
    if (
      state.review.token !==
      draftConversationReviewToken({ ...state, phase: 'candidate' })
    )
      throw new Error(
        'Conversation candidate changed after approval; no automatic rebase or adoption',
      );
  }
  const routing = state.connectionResult;
  const structural =
    state.structuralConnectionResult === undefined
      ? undefined
      : resolveWorkflowDraftTerminalRemoval(input);
  if (
    state.structuralConnectionResult !== undefined &&
    (routing !== undefined ||
      structural?.status !== 'ready' ||
      !isDeepStrictEqual(structural.result, state.structuralConnectionResult))
  )
    throw new Error(
      'Conversation structural connection result changed; no automatic rebase or adoption',
    );
  const resolved =
    routing === undefined
      ? undefined
      : routing.status === 'ready'
        ? resolveWorkflowDraftConnectionEdit({
            ...input,
            fingerprint: routing.fingerprint,
            proposal: routing.proposal,
          })
        : undefined;
  if (routing !== undefined && resolved?.status !== 'ready')
    throw new Error(
      'Conversation adoption requires its original validated connection proposal',
    );
  const result =
    structural?.status === 'ready'
      ? structural.result.candidate
      : resolved?.status === 'ready'
        ? resolved.candidate
        : assembleWorkflowDraftEdit(input);
  if (!isDeepStrictEqual(result, state.candidate.result))
    throw new Error(
      'Conversation candidate differs from the current original decisions',
    );
  let draft = result.draft;
  const candidateContext = createWorkflowDraftEditCandidateContext(input);
  if (dependencies.reviewPolicy === 'review' && result.status === 'changed') {
    const readiness = inspectDraftReadiness({
      draft,
      context: candidateContext,
    });
    const nodeIds = readiness.nodes
      .filter(
        (node) =>
          node.planningStatus === 'ready' &&
          result.impact.affectedNodeIds.includes(node.nodeId),
      )
      .map((node) => node.nodeId);
    if (nodeIds.length)
      draft = approveWorkflowDraft({
        draft,
        context: candidateContext,
        expectedRevision: draft.revision,
        nodeIds,
      });
  }
  return {
    draft,
    phase: 'exporting',
    artifact: undefined,
    outcome: undefined,
    response: undefined,
    issues: [],
    events: [
      ...state.events,
      {
        kind: result.status === 'changed' ? 'adopted' : 'unchanged',
        id: `${draft.id}:${draft.revision}`,
      },
    ],
  };
}
