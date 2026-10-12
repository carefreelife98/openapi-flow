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
      .array(
        z.strictObject({
          description: z
            .string()
            .min(1)
            .describe(
              'Describe a requested native behavior that cannot be represented and the missing capability or contract. Never a reminder to generate API requests, bindings or connections later.',
            ),
        }),
      )
      .describe(
        'Blocking unmet native behavior only. Return [] when requested native behavior is representable. Selected OAS API calls are implemented separately; their bindings, request arguments and connections belong to later stages, not these gaps. Never invent missing data or substitute a capability.',
      ),
  });
}
