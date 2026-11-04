import { z } from 'zod';
import type { WorkflowConnectionGoalPlanningDescription } from '@openapi-flow/core';
import {
  listWorkflowConnectionMaterialValueChoices,
  listWorkflowConnectionMaterialShapeChoices,
  workflowConnectionMaterialShapeGoalSchema,
  workflowConnectionMaterialValueGoalSchema,
  workflowConnectionOperationSetGoalSchema,
  workflowConnectionUnsupportedGoalSchema,
} from '@openapi-flow/core';
import type { WorkflowConnectionGoalSelection } from '../types/incremental-connection-planning.js';
import {
  connectionChoicesSchema,
  connectionDecisionTextSchema as text,
  connectionPortSelectionListSchema,
} from './connection-planning-field-schemas.js';

export function createWorkflowConnectionGoalsSchema(
  description: WorkflowConnectionGoalPlanningDescription,
) {
  const nodes = description.context.nodes;
  const ids = nodes.map((node) => node.id);
  if (!ids.length) throw new Error('Connection goals require supplied nodes');
  const basis = {
    factIds: z
      .array(z.enum(description.requirements.map((fact) => fact.id)))
      .min(1)
      .describe(
        'Exact confirmed requirement IDs that justify this goal. Cover every supplied fact without changing it.',
      ),
    reason: text.describe(
      'Brief evidence-based explanation, not private reasoning or new requirements.',
    ),
  };
  const choices: z.ZodType<WorkflowConnectionGoalSelection>[] = [
    ...listWorkflowConnectionMaterialShapeChoices(description.evidence).map(
      (choice) =>
        workflowConnectionMaterialShapeGoalSchema.extend({
          nodeId: z.literal(choice.nodeId),
          materialKind: z.literal(choice.materialKind),
          pointer: z.enum(choice.pointers),
          ...basis,
        }),
    ),
    ...listWorkflowConnectionMaterialValueChoices(description.evidence).map(
      (choice) =>
        workflowConnectionMaterialValueGoalSchema.extend({
          nodeId: z.literal(choice.nodeId),
          materialKind: z.literal(choice.materialKind),
          pointer: z.enum(choice.pointers),
          ...basis,
        }),
    ),
    workflowConnectionUnsupportedGoalSchema.extend({
      nodeIds: z
        .array(z.enum(ids))
        .min(1)
        .describe(
          'Every affected supplied node. Use all nodes for a whole-workflow guarantee. Do not use this for an invented condition outside the original request.',
        ),
      ...basis,
    }),
    ...(description.apiOperations.length === 0
      ? []
      : [
          workflowConnectionOperationSetGoalSchema.extend({
            nodeIds: z
              .array(
                z.enum(
                  description.apiOperations.map(
                    (operation) => operation.nodeId,
                  ),
                ),
              )
              .describe(
                'Exact complete permitted API call inventory, including repeated calls as distinct IDs. Code compares this set with all configured API calls. No claim about hidden server implementation.',
              ),
            ...basis,
          }),
        ]),
    ...(description.reviewBoundary === 'declared-contract'
      ? []
      : [
          z.strictObject({
            kind: z.literal('semantic'),
            scope: z.enum(['materials', 'workflow']),
            ...basis,
          }),
        ]),
  ];
  if (ids.length > 1) {
    choices.push(
      z.strictObject({
        kind: z.literal('precedence'),
        before: z.enum(ids),
        after: z.enum(ids),
        ...basis,
      }),
      z.strictObject({
        kind: z.literal('independent'),
        nodeIds: z.array(z.enum(ids)).min(2),
        ...basis,
      }),
    );
    if (nodes.some((node) => node.outputs.length))
      choices.push(
        z.strictObject({
          kind: z.literal('route'),
          source: connectionPortSelectionListSchema(nodes, 'outputs').element,
          to: z.enum(ids),
          ...basis,
        }),
      );
    const joinIds = nodes
      .filter((node) => node.waitsForAllInputs)
      .map((node) => node.id);
    if (ids.length > 2 && joinIds.length)
      choices.push(
        z.strictObject({
          kind: z.literal('join'),
          nodeId: z.enum(joinIds),
          producerIds: z.array(z.enum(ids)).min(2),
          ...basis,
        }),
      );
  }
  return z.strictObject({
    goals: z
      .array(connectionChoicesSchema(choices))
      .min(1)
      .describe(
        'Interpret confirmed requirements as goals, not as a complete edge list. Structural goals are checked by code. Use semantic only where a structural goal cannot express the requirement.',
      ),
  });
}
