import { createHash } from 'node:crypto';
import type {
  WorkflowDraftEditInput,
  WorkflowDraftEditContextDescription,
} from '../../types/workflow-draft-edit.js';
import { validateWorkflowDraft } from '../validate-workflow-draft.js';
import { describeWorkflowPlanningContext } from '../../planning/evidence/describe-workflow-planning-context.js';
import { workflowPlanningContextFingerprintFromDescription } from '../../planning/evidence/workflow-planning-context-fingerprint.js';
import { workflowDraftEditRequestIdsSchema } from '../../schemas/workflow-draft-edit-options-schema.js';
import { listRemovedWorkflowDraftRequirements } from '../requirements/history/list-removed-workflow-draft-requirements.js';
import { resolveWorkflowDraftNodeContracts } from '../contracts/resolve-workflow-draft-node-contracts.js';

/** Snapshot authority before model invocation; no model-owned versions or identities. */
export function describeWorkflowDraftEditContext(
  input: WorkflowDraftEditInput,
): WorkflowDraftEditContextDescription {
  validateWorkflowDraft(input);
  const requestMessageIds = workflowDraftEditRequestIdsSchema.parse(
    input.requestMessageIds,
  );
  const planning = describeWorkflowPlanningContext(input.context);
  if (
    requestMessageIds.some(
      (id) => !planning.messages.some((message) => message.id === id),
    )
  )
    throw new Error(
      'draft edit requestMessageIds references an unknown source message',
    );
  const draft = structuredClone(input.draft);
  const nodeContracts = structuredClone(
    resolveWorkflowDraftNodeContracts(input),
  );
  return {
    draft,
    nodeContracts,
    nodeContractsFingerprint: createHash('sha256')
      .update(JSON.stringify(nodeContracts))
      .digest('hex'),
    removedRequirements: listRemovedWorkflowDraftRequirements(draft),
    planning,
    requestMessageIds,
    draftFingerprint: createHash('sha256')
      .update(JSON.stringify(draft))
      .digest('hex'),
    contextFingerprint:
      workflowPlanningContextFingerprintFromDescription(planning),
  };
}
