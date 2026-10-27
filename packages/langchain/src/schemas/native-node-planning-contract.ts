import { z } from 'zod';
import type { WorkflowCapability } from '@openapi-flow/core';
import type { NativeNodePlanningContract } from '../types/native-node-planning.js';
import { createNativeNodeParameterContract } from './native-node-parameter-contract.js';
import { nativeNodePlanningReasonSchema } from './native-node-explanation-schema.js';

export function createNativeNodePlanningContract(
  capabilities: WorkflowCapability[],
  allowRuntimeParameters = false,
  includeExplanations = false,
): NativeNodePlanningContract {
  if (!capabilities.length)
    throw new Error('native planning schema requires supplied capabilities');
  const contracts = capabilities.map((capability) =>
    createNativeNodeParameterContract(capability, allowRuntimeParameters),
  );
  const nodes = contracts.flatMap((contract) => contract.schemas);
  const [first, ...rest] = nodes;
  const nodeSchema =
    first === undefined ? undefined : z.union([first, ...rest]);
  const gaps = z
    .array(
      z.strictObject({
        description: nativeNodePlanningReasonSchema.describe(
          'Describe a requested native behavior that cannot be represented and the missing capability or contract. Never a reminder to generate API requests, bindings or connections later.',
        ),
      }),
    )
    .describe(
      'Blocking unmet native behavior only. Return [] when requested native behavior is representable. Selected OAS API calls are implemented separately; their bindings, request arguments and connections belong to later stages, not these gaps. Never invent missing data or substitute a capability.',
    );
  const noAdditions = z.strictObject({
    noAdditionalNodesReason: nativeNodePlanningReasonSchema.describe(
      'Why no NEW native instance is proposed, including when prepared nodes suffice or only unmet native requirements remain. Do not repeat supplied nodes or generate a fixed empty node array.',
    ),
    gaps,
  });
  const explainedDecision =
    nodeSchema === undefined
      ? noAdditions
      : z.union([
          z.strictObject({
            additions: z
              .array(
                z.strictObject({
                  node: nodeSchema,
                  reason: nativeNodePlanningReasonSchema,
                }),
              )
              .min(1)
              .describe(
                'Only NEW native instances required by the scenario. Code extracts node data and keeps the reason outside executable parameters.',
              ),
            gaps,
          }),
          noAdditions,
        ]);
  const schema = includeExplanations
    ? z.strictObject({
        decision: explainedDecision,
      })
    : nodeSchema === undefined
      ? z.strictObject({ gaps })
      : z.strictObject({
          nativeNodes: z
            .array(nodeSchema)
            .describe(
              'Only new instances required by the scenario, with values following the supplied implementation schema. No ports, output schemas, code or n8n JSON.',
            ),
          gaps,
        });
  return {
    schema,
    capabilities: contracts.map((contract) => contract.material),
  };
}
