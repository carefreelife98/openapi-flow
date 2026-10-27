import { z } from 'zod';
import type { WorkflowConnectionGoalPlanningDescription } from '@openapi-flow/core';
import type { WorkflowConnectionGoalRecoveryModelOutput } from '../types/workflow-connection-goal-recovery.js';
import { createWorkflowConnectionGoalsSchema } from './workflow-connection-goals-schema.js';
import { createConnectionMaterialRepairChoiceSchema } from './create-connection-material-repair-choice-schema.js';
import { connectionChoicesSchema } from './connection-planning-field-schemas.js';

export function createWorkflowConnectionGoalRecoverySchema(
  description: WorkflowConnectionGoalPlanningDescription,
): z.ZodType<WorkflowConnectionGoalRecoveryModelOutput> {
  const choices: z.ZodType<
    WorkflowConnectionGoalRecoveryModelOutput['decision']
  >[] = [
    z.strictObject({
      kind: z.literal('goals'),
      goals: createWorkflowConnectionGoalsSchema(description).shape.goals,
    }),
  ];
  const material = createConnectionMaterialRepairChoiceSchema(
    description.materialRepairStages,
    description.requirements.map((fact) => fact.id),
  );
  if (material) choices.push(material);
  return z.strictObject({ decision: connectionChoicesSchema(choices) });
}
