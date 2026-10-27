import { z } from 'zod';
import {
  workflowConnectionAssessmentSchema,
  workflowConnectionMaterialRequestSchema,
  workflowConnectionUserDecisionSchema,
} from '@openapi-flow/core';
import type {
  WorkflowConnectionStepDescription,
  WorkflowCapability,
  WorkflowPlanNodeContract,
} from '@openapi-flow/core';
import type {
  WorkflowConnectionStepModelOutput,
  WorkflowConnectionStepModelDecision,
  WorkflowConnectionPatchContext,
  WorkflowConnectionPatchSelection,
} from '../types/incremental-connection-planning.js';
import type { WorkflowConnectionOutlineBundleDescription } from '@openapi-flow/core';
import {
  connectionChoicesSchema,
  connectionDecisionTextSchema as text,
  connectionIdListSchema,
  connectionPortSelectionListSchema,
} from './connection-planning-field-schemas.js';

export function createWorkflowConnectionPatchSelectionSchema(
  description: WorkflowConnectionPatchContext,
  removalNodes: WorkflowPlanNodeContract[],
  outline?: WorkflowConnectionOutlineBundleDescription,
): z.ZodType<WorkflowConnectionPatchSelection> {
  const nodes = description.context.nodes;
  const canConnect =
    nodes.some((node) => node.outputs.length) &&
    nodes.some((node) => node.inputs.length);
  const edge = z.strictObject({
    source: connectionPortSelectionListSchema(nodes, 'outputs').element,
    target: connectionPortSelectionListSchema(nodes, 'inputs').element,
  });
  const scoped =
    outline === undefined
      ? []
      : [
          {
            sources: nodes.filter((node) =>
              outline.bundle.nodeIds.includes(node.id),
            ),
            targets: nodes,
          },
          {
            sources: nodes,
            targets: nodes.filter((node) =>
              outline.bundle.nodeIds.includes(node.id),
            ),
          },
        ]
          .filter(
            ({ sources, targets }) =>
              sources.some((node) => node.outputs.length) &&
              targets.some((node) => node.inputs.length),
          )
          .map(({ sources, targets }) =>
            z.strictObject({
              source: connectionPortSelectionListSchema(sources, 'outputs')
                .element,
              target: connectionPortSelectionListSchema(targets, 'inputs')
                .element,
            }),
          );
  const roots = nodes.filter(
    (node) =>
      !node.waitsForAllInputs &&
      node.rejoinsExclusiveOutputs === undefined &&
      !node.references.length &&
      !node.dependencyNodeIds.length &&
      !Object.values(node.inputReferences ?? {}).some(
        (references) => references.length,
      ),
  );
  const currentTerminalNodes = removalNodes.map((node) => ({
    ...node,
    outputs: node.outputs.filter((output) =>
      description.terminals.some(
        (terminal) => terminal.nodeId === node.id && terminal.output === output,
      ),
    ),
  }));
  return z.strictObject({
    kind: z.literal('patch'),
    addEdges: (outline !== undefined
      ? scoped.length
        ? z.array(connectionChoicesSchema(scoped))
        : z.array(edge).max(0)
      : canConnect
        ? z.array(edge)
        : z.array(edge).max(0)
    ).describe(
      'One atomic semantic bundle or repair, not a full graph replacement.',
    ),
    removeEdgeIds: connectionIdListSchema(
      description.edgeCatalog
        .filter(
          (item) =>
            item.editable &&
            (outline === undefined ||
              outline.bundle.nodeIds.includes(item.edge.from) ||
              outline.bundle.nodeIds.includes(item.edge.to)),
        )
        .map((item) => item.id),
    ),
    addRootNodeIds: connectionIdListSchema(
      roots.map((node) => node.id),
    ).describe(
      'Only explicitly intended independent starts in this patch. An unconnected node is not automatically a start.',
    ),
    removeRootNodeIds: connectionIdListSchema(description.rootNodeIds),
    addTerminals: connectionPortSelectionListSchema(nodes, 'outputs').describe(
      'Only outputs explicitly intended to finish here. Leave unfinished paths open.',
    ),
    removeTerminals: connectionPortSelectionListSchema(
      currentTerminalNodes,
      'outputs',
    ).describe(
      'Explicitly reopen a previously accepted terminal before continuing its path.',
    ),
    factIds: z
      .array(z.enum(description.requirements.map((fact) => fact.id)))
      .min(1),
    reason: text,
  });
}

export function createWorkflowConnectionStepSchema(
  description: WorkflowConnectionStepDescription,
  capabilities: WorkflowCapability[],
  outline?: WorkflowConnectionOutlineBundleDescription,
): z.ZodType<WorkflowConnectionStepModelOutput> {
  const nodes = description.context.nodes;
  const ids = nodes.map((node) => node.id);
  if (!ids.length) throw new Error('Connection steps require supplied nodes');
  const factIds = z
    .array(z.enum(description.requirements.map((fact) => fact.id)))
    .min(1);
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
    createWorkflowConnectionPatchSelectionSchema(description, nodes, outline),
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
