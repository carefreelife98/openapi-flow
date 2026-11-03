import { z } from 'zod';
import { describeConnectionRevisionRegion } from '../workflow/connections/describe-connection-revision-region.js';
import type { WorkflowConnectionRevisionDescription } from '@openapi-flow/core';
import type {
  WorkflowConnectionRevisionModelDecision,
  WorkflowConnectionRevisionModelOutput,
} from '../types/workflow-connection-revision.js';
import { createWorkflowConnectionGoalsSchema } from './workflow-connection-goals-schema.js';
import { createWorkflowConnectionRegionSelectionSchema } from './workflow-connection-region-selection-schema.js';
import { connectionChoicesSchema } from './connection-planning-field-schemas.js';
import { createConnectionMaterialRepairChoiceSchema } from './create-connection-material-repair-choice-schema.js';

export function createWorkflowConnectionRevisionSchema(
  description: WorkflowConnectionRevisionDescription,
): z.ZodType<WorkflowConnectionRevisionModelOutput> {
  const context = describeConnectionRevisionRegion(description);
  const choices: z.ZodType<WorkflowConnectionRevisionModelDecision>[] = [
    z.strictObject({
      kind: z.literal('revise-connections'),
      goals: createWorkflowConnectionGoalsSchema(description.after).shape.goals,
      graphChange: createWorkflowConnectionRegionSelectionSchema({
        ...context,
        goals: [],
      }),
    }),
  ];
  const material = createConnectionMaterialRepairChoiceSchema(
    description.after.materialRepairStages,
    description.after.requirements.map((fact) => fact.id),
  );
  if (material) choices.push(material);
  return z.strictObject({ decision: connectionChoicesSchema(choices) });
}
