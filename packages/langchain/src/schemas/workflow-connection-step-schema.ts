import { z } from 'zod';
import {
  workflowConnectionAssessmentSchema,
  workflowConnectionMaterialRequestSchema,
  workflowConnectionUserDecisionSchema,
} from '@openapi-flow/core';
import type {
  WorkflowConnectionStepDescription,
  WorkflowCapability,
} from '@openapi-flow/core';
import type {
  WorkflowConnectionStepModelOutput,
  WorkflowConnectionStepModelDecision,
} from '../types/incremental-connection-planning.js';
import {
  connectionChoicesSchema,
  connectionDecisionTextSchema as text,
  connectionIdListSchema,
  connectionPortSelectionListSchema,
} from './connection-planning-field-schemas.js';

export function createWorkflowConnectionStepSchema(
  description: WorkflowConnectionStepDescription,
  capabilities: WorkflowCapability[],
): z.ZodType<WorkflowConnectionStepModelOutput> {
  const nodes = description.context.nodes;
  const ids = nodes.map((node) => node.id);
  if (!ids.length) throw new Error('Connection steps require supplied nodes');
  const factIds = z
    .array(z.enum(description.requirements.map((fact) => fact.id)))
    .min(1);
  const sources = connectionPortSelectionListSchema(nodes, 'outputs');
  const targets = connectionPortSelectionListSchema(nodes, 'inputs');
  const edge = z.strictObject({
    source: sources.element,
    target: targets.element,
  });
  const canConnect =
    nodes.some((node) => node.outputs.length) &&
    nodes.some((node) => node.inputs.length);
  const roots = nodes
    .filter(
      (node) =>
        !node.waitsForAllInputs &&
        node.rejoinsExclusiveOutputs === undefined &&
        !node.references.length &&
        !node.dependencyNodeIds.length &&
        !Object.values(node.inputReferences ?? {}).some(
          (references) => references.length,
        ),
    )
    .map((node) => node.id);
  const terminalNodes = nodes.map((node) => ({
    ...node,
    outputs: node.outputs.filter((output) =>
      description.terminals.some(
        (terminal) => terminal.nodeId === node.id && terminal.output === output,
      ),
    ),
  }));
  const semanticGoalIds = description.goals
    .filter((goal) => goal.decision.kind === 'semantic')
    .map((goal) => goal.id);
  const assessments = semanticGoalIds.length
    ? z.array(
        workflowConnectionAssessmentSchema.extend({
          goalId: z.enum(semanticGoalIds),
          nodeIds: z.array(z.enum(ids)),
        }),
      )
    : z.array(workflowConnectionAssessmentSchema).max(0);
  const choices: z.ZodType<WorkflowConnectionStepModelDecision>[] = [
    z.strictObject({
      kind: z.literal('patch'),
      addEdges: (canConnect ? z.array(edge) : z.array(edge).max(0)).describe(
        'One complete connection bundle, including both conditional branches or the intended fan-out/join where needed. Not a full graph replacement.',
      ),
      removeEdgeIds: connectionIdListSchema(
        description.edgeCatalog
          .filter((item) => item.editable)
          .map((item) => item.id),
      ),
      addRootNodeIds: connectionIdListSchema(roots).describe(
        'Explicit independent roots. Unconnected nodes are not automatic roots.',
      ),
      removeRootNodeIds: connectionIdListSchema(description.rootNodeIds),
      addTerminals: sources,
      removeTerminals: connectionPortSelectionListSchema(
        terminalNodes,
        'outputs',
      ),
      factIds,
      reason: text,
    }),
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
  return z.strictObject({ decision: connectionChoicesSchema(choices) });
}
