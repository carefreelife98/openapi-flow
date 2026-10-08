import { z } from 'zod';
import type { WorkflowCapability } from '@openapi-flow/core';
import type { NativeNodeProposal } from '../types/native-node-planning.js';

export function createNativeNodePlanSchema(
  capabilities: WorkflowCapability[],
): z.ZodType<NativeNodeProposal> {
  if (!capabilities.length)
    throw new Error('native planning schema requires supplied capabilities');
  const nodes = capabilities.map((capability) =>
    z.strictObject({
      id: z
        .string()
        .min(1)
        .describe(
          'Unique instance identity used by data references. Never repeat a supplied API or prepared native ID. Multiple instances of one capability may have different IDs.',
        ),
      capability: z.literal(capability.name).describe(capability.description),
      parameters: capability.parametersSchema,
    }),
  );
  return z.strictObject({
    nativeNodes: z
      .array(z.union([nodes[0], ...nodes.slice(1)]))
      .describe(
        'Only new instances required by the scenario, with values following the supplied implementation schema. No ports, output schemas, code or n8n JSON.',
      ),
    gaps: z
      .array(z.strictObject({ description: z.string().min(1) }))
      .describe(
        'Explicit requirements that supplied capabilities and contracts cannot implement. Never replace missing data with an invented value or a different capability.',
      ),
  });
}
