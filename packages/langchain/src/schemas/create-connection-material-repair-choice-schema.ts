import { z } from 'zod';
import {
  workflowConnectionMaterialRepairTargetSchema,
  workflowConnectionMaterialRepairRequestSchema,
} from '@openapi-flow/core';
import type {
  WorkflowConnectionMaterialRepairRequest,
  WorkflowConnectionMaterialRepairTarget,
  WorkflowConnectionMaterialRepairStage,
} from '@openapi-flow/core';
import { connectionChoicesSchema } from './connection-planning-field-schemas.js';

/** The same actual stage/identity choices serve initial goal recovery and accepted-session revision. */
export function createConnectionMaterialRepairChoiceSchema(
  stages: WorkflowConnectionMaterialRepairStage[],
  factIds: string[],
): z.ZodType<WorkflowConnectionMaterialRepairRequest> | undefined {
  const targets: z.ZodType<WorkflowConnectionMaterialRepairTarget>[] = [];
  for (const stage of stages) {
    if (!stage.nodeIds.length) continue;
    targets.push(
      workflowConnectionMaterialRepairTargetSchema.extend({
        stage: z
          .literal(stage.stage)
          .describe(
            'Origin-stage ownership: api-bindings changes API producer references; api-arguments changes only API literals/requested inputs and retains bindings; native-dependencies changes native producer IDs and then regenerates its settings; native-parameters changes settings or pointers while retaining the existing producer IDs. Request native-dependencies for a producer substitution, not native-parameters alone.',
          ),
        nodeId: z.enum(stage.nodeIds),
      }),
    );
  }
  if (!targets.length) return undefined;
  return workflowConnectionMaterialRepairRequestSchema.extend({
    targets: z.array(connectionChoicesSchema(targets)).min(1),
    factIds: z.array(z.enum(factIds)).min(1),
  });
}
