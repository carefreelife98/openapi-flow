import { z } from 'zod';
import type { WorkflowCapability, WorkflowGraphPlan } from '@openapi-flow/core';

export function createWorkflowGraphPlanSchema(
  capabilities: WorkflowCapability[],
): z.ZodType<WorkflowGraphPlan> {
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
    nativeNodes: z
      .array(z.union([nativeSchemas[0], ...nativeSchemas.slice(1)]))
      .describe(
        'Only native nodes needed by the scenario. API nodes already exist as materials.',
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
    starts: z
      .array(z.string().min(1))
      .describe(
        'Every root node exactly once. No node with incoming edges. May be empty for a non-executable gap report.',
      ),
    gaps: z
      .array(z.strictObject({ description: z.string().min(1) }))
      .describe(
        'Unmet scenario requirements. Never invent a capability, API, or executable code.',
      ),
  });
}
