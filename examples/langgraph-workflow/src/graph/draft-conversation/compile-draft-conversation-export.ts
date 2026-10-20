import { compileN8nWorkflowTemplate } from '@openapi-flow/n8n';
import { inspectDraftReadiness } from '@openapi-flow/core';
import { draftConversationOutcomeSchema } from '../../schemas/workflow-draft-conversation-outcome-schema.js';
import { selectDraftConversationDeployments } from './select-draft-conversation-deployments.js';
import type {
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationState,
  WorkflowDraftConversationUpdate,
} from '../../types/workflow-draft-conversation.js';

export function compileDraftConversationExport(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): WorkflowDraftConversationUpdate {
  if (!state.draft || !state.messages || !state.events || !state.candidate)
    throw new Error(
      'Conversation export requires an adopted draft, original candidate, transcript and events',
    );
  if (state.phase !== 'exporting')
    throw new Error(
      'Conversation export requires the exporting phase after adoption',
    );
  const context = { ...dependencies.context, messages: state.messages };
  const readiness = inspectDraftReadiness({ draft: state.draft, context });
  const identity = {
    draftId: state.draft.id,
    revision: state.draft.revision,
    changeStatus: state.candidate.result.status,
  };
  if (readiness.nodes.length === 0) {
    return {
      artifact: undefined,
      outcome: draftConversationOutcomeSchema.parse({
        ...identity,
        kind: 'no-workflow',
        reason: 'no-api-or-native-instances',
        unresolvedRequirementIds: state.draft.requirements
          .filter((requirement) => requirement.state !== 'confirmed')
          .map((requirement) => requirement.id),
      }),
      phase: 'no-workflow',
      events: [
        ...state.events,
        {
          kind: 'no-workflow',
          id: `${state.draft.id}:${state.draft.revision}`,
        },
      ],
    };
  }
  const artifact = compileN8nWorkflowTemplate({
    draft: state.draft,
    context,
    name: dependencies.name,
    itemMode: dependencies.itemMode,
    deployments: selectDraftConversationDeployments(state.draft, dependencies),
  });
  return {
    artifact,
    outcome: draftConversationOutcomeSchema.parse({
      ...identity,
      kind: 'workflow-exported',
      triggerConnected: artifact.triggerConnected,
      runtimeInputsReady: artifact.runtimeInputsReady,
      deploymentConfigured: artifact.deploymentConfigured,
      ...(state.draft.gapNodes?.length
        ? { unresolvedGapNodeIds: state.draft.gapNodes.map((gap) => gap.id) }
        : {}),
    }),
    phase: 'complete',
    events: [
      ...state.events,
      { kind: 'exported', id: `${state.draft.id}:${state.draft.revision}` },
    ],
  };
}
