import { z } from 'zod';
import type { WorkflowDraftClarificationPlanningStage } from '../types/workflow-draft-clarification-ownership.js';

export const workflowDraftClarificationPlanningStageSchema = z.enum([
  'api-bindings',
  'api-arguments',
  'native-parameters',
  'requirements',
  'connections',
]) satisfies z.ZodType<WorkflowDraftClarificationPlanningStage>;
