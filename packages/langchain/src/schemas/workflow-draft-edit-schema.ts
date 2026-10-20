import { z } from 'zod';
import { createWorkflowDraftEditProposalSchema } from '@openapi-flow/core';
import type {
  ResolvedWorkflowDraftEditOptions,
  WorkflowDraftEditContextDescription,
} from '@openapi-flow/core';
import { createWorkflowPlanningEvidenceSchemas } from './workflow-planning-evidence-schemas.js';

export function createWorkflowDraftEditSchema(
  context: WorkflowDraftEditContextDescription,
  options: ResolvedWorkflowDraftEditOptions,
  candidateIds: string[],
) {
  const evidence = createWorkflowPlanningEvidenceSchemas(
    context.planning,
    candidateIds,
    context.requestMessageIds,
  );
  return createWorkflowDraftEditProposalSchema(options, {
    ...(candidateIds.length ? { operationSchema: z.enum(candidateIds) } : {}),
    apiNodeIds: context.draft.apiCalls.map((call) => call.id),
    nativeNodeIds: context.draft.nativeNodes.map((node) => node.id),
    gapNodeIds: context.draft.gapNodes?.map((node) => node.id),
    capabilityNames: context.planning.capabilities.map(
      (capability) => capability.name,
    ),
    requirementIds: context.draft.requirements.map(
      (requirement) => requirement.id,
    ),
    removedRequirementIds: context.removedRequirements.map(
      (requirement) => requirement.id,
    ),
    messageSchema: evidence.message,
    evidenceSchema: evidence.evidence,
  });
}
