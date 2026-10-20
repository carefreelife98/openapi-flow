import type { ApiArgumentGenerationContract } from './api-argument-generation.js';
import type { WorkflowDraftApiCallPlanningDescription } from './workflow-draft-api-call-planning.js';

export interface WorkflowDraftApiCallArgumentsContext {
  description: WorkflowDraftApiCallPlanningDescription;
  contract: ApiArgumentGenerationContract;
  fingerprint: string;
}
