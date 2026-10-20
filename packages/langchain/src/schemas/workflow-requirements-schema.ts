import { createWorkflowRequirementsProposalSchema } from '@openapi-flow/core';
import type {
  ClarificationQuestionLimits,
  ResolvedWorkflowClarificationOptions,
  WorkflowPlanningContextDescription,
} from '@openapi-flow/core';
import type { WorkflowClarificationOasCandidate } from '../types/workflow-clarification.js';
import { createWorkflowPlanningEvidenceSchemas } from './workflow-planning-evidence-schemas.js';

export function createWorkflowRequirementsSchema(
  limits: ClarificationQuestionLimits,
  options: ResolvedWorkflowClarificationOptions,
  context: WorkflowPlanningContextDescription,
  candidates: WorkflowClarificationOasCandidate[],
) {
  const { message, evidence } = createWorkflowPlanningEvidenceSchemas(
    context,
    candidates.map((candidate) => candidate.candidateId),
    context.messages.map((item) => item.id),
  );
  return createWorkflowRequirementsProposalSchema(
    limits,
    options,
    evidence,
    message,
  );
}
