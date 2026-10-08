import { z } from 'zod';
import type { WorkflowCapability } from '@openapi-flow/core';
import type { WorkflowGraphOutput } from '../types/workflow-planning.js';

export function createWorkflowGraphProposalSchema(
  capabilities: WorkflowCapability[],
): z.ZodType<WorkflowGraphOutput> {
  if (!capabilities.length)
    throw new Error('capabilities must contain a native node definition');
  const nativeSchemas = capabilities.map((capability) =>
    z.strictObject({
      id: z
        .string()
        .min(1)
        .describe('Unique native node ID. Must not collide with API callIds.'),
      capability: z.literal(capability.name).describe(capability.description),
      parameters: capability.parametersSchema,
    }),
  );
  return z.strictObject({
    additionalNativeNodes: z
      .array(z.union([nativeSchemas[0], ...nativeSchemas.slice(1)]))
      .describe(
        'NEW native nodes only. Existing preparedNativeNodes and API materials are already present. Never repeat their IDs or parameters. Return [] when no new native node is needed.',
      ),
    edges: z
      .array(
        z.strictObject({
          from: z
            .string()
            .min(1)
            .describe('Exact API callId or native node ID.'),
          output: z
            .string()
            .min(1)
            .describe('Declared source output port, e.g. main, true or false.'),
          to: z.string().min(1).describe('Exact API callId or native node ID.'),
          input: z
            .string()
            .min(1)
            .describe('Declared target input port, e.g. main or input1.'),
        }),
      )
      .describe(
        'Explicit DAG connections; array order never defines execution order.',
      ),
    gaps: z
      .array(z.strictObject({ description: z.string().min(1) }))
      .describe(
        'Only explicitly requested requirements that cannot be met. Do not invent a success/end/display requirement; a terminal node completes normally. Never invent a capability, API, or executable code.',
      ),
  });
}
