import { z } from 'zod';
import {
  workflowConnectionAssessmentSchema,
  workflowConnectionMaterialRequestSchema,
  workflowConnectionUserDecisionSchema,
  listWorkflowConnectionEvidencePointers,
} from '@openapi-flow/core';
import type {
  WorkflowConnectionStepDescription,
  WorkflowConnectionMaterialRepairStage,
  WorkflowCapability,
} from '@openapi-flow/core';
import type {
  WorkflowConnectionStepModelOutput,
  WorkflowConnectionStepModelDecision,
} from '../types/incremental-connection-planning.js';
import type { WorkflowConnectionOutlineBundleDescription } from '@openapi-flow/core';
import { createConnectionMaterialRepairChoiceSchema } from './create-connection-material-repair-choice-schema.js';
import { createWorkflowConnectionRegionSelectionSchema } from './workflow-connection-region-selection-schema.js';
import { isWorkflowConnectionCompletionReview } from '../workflow/connections/is-workflow-connection-completion-review.js';
import {
  connectionChoicesSchema,
  connectionDecisionTextSchema as text,
} from './connection-planning-field-schemas.js';

export function createWorkflowConnectionStepSchema(
  description: WorkflowConnectionStepDescription,
  capabilities: WorkflowCapability[],
  outline?: WorkflowConnectionOutlineBundleDescription,
  materialRepairStages?: WorkflowConnectionMaterialRepairStage[],
): z.ZodType<WorkflowConnectionStepModelOutput> {
  const nodes = description.context.nodes;
  const ids = nodes.map((node) => node.id);
  if (!ids.length) throw new Error('Connection steps require supplied nodes');
  const factIds = z
    .array(z.enum(description.requirements.map((fact) => fact.id)))
    .min(1);
  const assessments = z.strictObject(
    Object.fromEntries(
      description.goals
        .filter((goal) => goal.decision.kind === 'semantic')
        .map((goal) => {
          if (goal.decision.kind !== 'semantic')
            throw new Error('Completion review requires a semantic goal');
          const decision = goal.decision;
          return [
            goal.id,
            workflowConnectionAssessmentSchema
              .omit({
                evidenceRefs: true,
                nodeIds: true,
                goalId: true,
                scope: true,
              })
              .extend({
                evidence: z.strictObject(
                  Object.fromEntries(
                    description.evidence.map((item) => [
                      item.id,
                      item.kind === 'requirement'
                        ? decision.factIds.includes(item.factId!)
                          ? z.literal('/text')
                          : z.null()
                        : item.kind === 'material-inventory'
                          ? z.literal('')
                          : item.kind === 'graph'
                            ? decision.scope === 'workflow'
                              ? z.literal('')
                              : z.null()
                            : z
                                .enum(
                                  listWorkflowConnectionEvidencePointers(item),
                                )
                                .nullable(),
                    ]),
                  ),
                ),
              }),
          ];
        }),
    ),
  );
  const choices: z.ZodType<WorkflowConnectionStepModelDecision>[] = [
    ...(isWorkflowConnectionCompletionReview(description)
      ? []
      : [createWorkflowConnectionRegionSelectionSchema(description, outline)]),
    z.strictObject({
      kind: z.literal('request-completion'),
      assessments,
      reason: text,
    }),
    workflowConnectionUserDecisionSchema
      .extend({ factIds })
      .describe(
        'Only a genuine unresolved BUSINESS decision. Never ask the user to fix ports, cycles, model output or a missing connection.',
      ),
  ];
  if (capabilities.length)
    choices.push(
      workflowConnectionMaterialRequestSchema.extend({
        capability: z.enum(capabilities.map((capability) => capability.name)),
        factIds,
      }),
    );
  if (materialRepairStages !== undefined) {
    const repair = createConnectionMaterialRepairChoiceSchema(
      materialRepairStages,
      description.requirements.map((fact) => fact.id),
    );
    if (repair !== undefined) choices.push(repair);
  }
  return z.strictObject({ decision: connectionChoicesSchema(choices) });
}
