import { createHash } from 'node:crypto';
import type {
  CreateWorkflowDraftEditPlanInput,
  WorkflowDraftEditPlan,
} from '../../types/workflow-draft-edit.js';
import { apiOperationKeySchema } from '../../schemas/api-operation-key-schema.js';
import {
  workflowMessageEvidenceSchema,
  workflowPlanningEvidenceSchema,
} from '../../schemas/planning-evidence-schema.js';
import { resolveWorkflowDraftEditOptions } from './resolve-workflow-draft-edit-options.js';
import { createWorkflowDraftEditProposalSchema } from '../../schemas/create-workflow-draft-edit-proposal-schema.js';
import { describeWorkflowDraftEditContext } from './describe-workflow-draft-edit-context.js';
import { validateDescribedWorkflowPlanningEvidence } from '../../planning/evidence/validate-workflow-planning-evidence.js';
import { apiOperationKeyEquals } from '../../openapi/catalog/api-operation-key-equals.js';
import { workflowDraftEditStages } from './workflow-draft-edit-stages.js';
import { resolveWorkflowDraftClarificationOwnerIndex } from './clarification/resolve-workflow-draft-clarification-owner-index.js';

/** Bounded semantic plan only. Actual values/edges must pass their own stages and atomic change validation. */
export function createWorkflowDraftEditPlan(
  input: CreateWorkflowDraftEditPlanInput,
): WorkflowDraftEditPlan {
  const described = describeWorkflowDraftEditContext(input);
  const options = resolveWorkflowDraftEditOptions(input.options);
  const proposal = createWorkflowDraftEditProposalSchema(options, {
    ...(described.planning.operations.length
      ? { operationSchema: apiOperationKeySchema }
      : {}),
    apiNodeIds: described.draft.apiCalls.map((call) => call.id),
    nativeNodeIds: described.draft.nativeNodes.map((node) => node.id),
    gapNodeIds: described.draft.gapNodes?.map((node) => node.id),
    capabilityNames: described.planning.capabilities.map(
      (capability) => capability.name,
    ),
    requirementIds: described.draft.requirements.map(
      (requirement) => requirement.id,
    ),
    removedRequirementIds: described.removedRequirements.map(
      (requirement) => requirement.id,
    ),
    messageSchema: workflowMessageEvidenceSchema,
    evidenceSchema: workflowPlanningEvidenceSchema,
  }).parse(input.proposal);
  const signatures = new Set<string>();
  const requirementDecisions = new Set<string>();
  const removals = new Set(
    proposal.decisions
      .filter((decision) => decision.kind === 'remove-node')
      .map((decision) => decision.nodeId),
  );
  for (const [index, decision] of proposal.decisions.entries()) {
    if (decision.kind === 'needs-clarification')
      resolveWorkflowDraftClarificationOwnerIndex({
        decisions: proposal.decisions,
        sourceIndex: index,
      });
    if (
      decision.kind === 'revise-requirement' ||
      decision.kind === 'remove-requirement' ||
      decision.kind === 'restore-requirement'
    ) {
      if (requirementDecisions.has(decision.requirementId))
        throw new Error(
          `Draft edit repeats or conflicts on requirement ${decision.requirementId}`,
        );
      requirementDecisions.add(decision.requirementId);
    }
    validateDescribedWorkflowPlanningEvidence(
      described.planning,
      decision.sources,
    );
    if (
      decision.sources.some(
        (source) => !described.requestMessageIds.includes(source.messageId),
      )
    )
      throw new Error(
        'Draft edit sources must cite the current requestMessageIds',
      );
    if (decision.explanation)
      validateDescribedWorkflowPlanningEvidence(
        described.planning,
        decision.explanation.evidence,
      );
    if (
      'operation' in decision &&
      !described.planning.operations.some((operation) =>
        apiOperationKeyEquals(operation.key, decision.operation),
      )
    )
      throw new Error(
        'Draft edit references an unavailable or stale operation',
      );
    if (decision.kind === 'replace-api-operation') {
      const previous = described.draft.apiCalls.find(
        (call) => call.id === decision.nodeId,
      )!;
      if (apiOperationKeyEquals(previous.operation, decision.operation))
        throw new Error(
          'Replacing an API operation requires a different supplied operation',
        );
    }
    if (
      decision.kind === 'report-capability-gap' &&
      decision.finding.kind === 'api-contract-gap'
    ) {
      const operation = decision.finding.operation;
      if (
        !described.planning.operations.some((candidate) =>
          apiOperationKeyEquals(candidate.key, operation),
        )
      )
        throw new Error(
          'Capability gap references an unavailable or stale OAS operation',
        );
    }
    if (
      'nodeId' in decision &&
      decision.kind !== 'remove-node' &&
      removals.has(decision.nodeId)
    )
      throw new Error(`Draft edit both removes and revises ${decision.nodeId}`);
    if (
      decision.kind === 'revise-connections' &&
      new Set(decision.nodeIds).size !== decision.nodeIds.length
    )
      throw new Error('Draft edit connection scope requires distinct node IDs');
    if (
      decision.kind === 'needs-clarification' &&
      decision.owner.kind === 'semantic' &&
      decision.owner.scope.kind === 'nodes' &&
      new Set(decision.owner.scope.nodeIds).size !==
        decision.owner.scope.nodeIds.length
    )
      throw new Error(
        'Draft edit clarification scope requires distinct node IDs',
      );
    const signature = JSON.stringify(decision);
    if (signatures.has(signature))
      throw new Error(
        'Draft edit repeats an identical decision; distinct new instances require distinct roles',
      );
    signatures.add(signature);
  }
  if (
    proposal.decisions.some((decision) => decision.kind === 'no-change') &&
    (described.planning.clarification?.pendingQuestions.length ||
      described.planning.clarification?.deferredQuestions.length)
  )
    throw new Error(
      'A no-change edit cannot discard unresolved original clarification questions',
    );
  const id =
    'draft-edit:' +
    createHash('sha256')
      .update(
        JSON.stringify([
          described.draftFingerprint,
          described.contextFingerprint,
          described.nodeContractsFingerprint,
          described.requestMessageIds,
          options,
          proposal,
        ]),
      )
      .digest('hex');
  const known = new Set(
    [
      ...described.draft.apiCalls,
      ...described.draft.nativeNodes,
      ...(described.draft.gapNodes === undefined
        ? []
        : described.draft.gapNodes),
    ].map((node) => node.id),
  );
  const steps = proposal.decisions.map((decision, index) => {
    const stepId = `${id}:step:${index + 1}`;
    const newNodeId =
      decision.kind === 'add-api-call' ||
      decision.kind === 'add-native-node' ||
      decision.kind === 'report-capability-gap'
        ? 'node-' + createHash('sha256').update(stepId).digest('hex')
        : undefined;
    if (newNodeId !== undefined && known.has(newNodeId))
      throw new Error(
        'Allocated draft edit instance ID conflicts with an existing node',
      );
    if (newNodeId !== undefined) known.add(newNodeId);
    return {
      id: stepId,
      decision,
      ...(newNodeId === undefined ? {} : { newNodeId }),
      stages: workflowDraftEditStages(decision),
    };
  });
  return {
    id,
    draftId: described.draft.id,
    baseRevision: described.draft.revision,
    draftFingerprint: described.draftFingerprint,
    contextFingerprint: described.contextFingerprint,
    nodeContractsFingerprint: described.nodeContractsFingerprint,
    requestMessageIds: described.requestMessageIds,
    options,
    status: proposal.decisions.some(
      (decision) =>
        decision.kind === 'needs-clarification' &&
        decision.owner.kind === 'semantic',
    )
      ? 'needs-clarification'
      : proposal.decisions.every((decision) => decision.kind === 'no-change')
        ? 'no-change'
        : 'ready-for-planning',
    steps,
  };
}
