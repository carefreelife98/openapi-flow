import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { createNativeOutputContracts } from '@openapi-flow/core';
import type {
  NativeNodePlan,
  NativeNodeProposal,
  PlanNativeNodesInput,
} from '../types/native-node-planning.js';
import { createNativeNodePlanSchema } from '../schemas/native-node-plan-schema.js';
import { nativeNodePlanningPrompt } from '../prompts/native-node-planning-prompt.js';
import { assertSelectionInput } from '../legacy/planning/select-operation.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { createPreparedNativeNodeMaterials } from './create-prepared-native-node-materials.js';
import { assembleNativeNodeMaterials } from './assemble-native-node-materials.js';
import { NativeNodePlanningError } from './native-node-planning-error.js';

export async function planNativeNodes(
  input: PlanNativeNodesInput,
): Promise<NativeNodePlan> {
  assertSelectionInput(input.scenario, input.model);
  if (!input.planId?.trim())
    throw new Error('planNativeNodes.planId is required');
  const capabilities = input.capabilities ?? [];
  const apiMaterials = input.apiMaterials ?? [];
  const prepared = input.preparedNativeNodes ?? [];
  createNativeOutputContracts({ nativeNodes: prepared, capabilities });
  const apiIds = apiMaterials.map((material) => material.callId);
  const existingIds = [...apiIds, ...prepared.map((node) => node.id)];
  if (
    existingIds.some((id) => !id.trim()) ||
    new Set(existingIds).size !== existingIds.length
  )
    throw new Error('native planning materials require unique non-empty IDs');
  // No registered choice means no native-selection model call, not an inferred registry.
  if (!capabilities.length) return { nativeNodes: [], gaps: [] };
  const schema = createNativeNodePlanSchema(capabilities);
  const output: NativeNodeProposal = await input.model
    .withStructuredOutput<NativeNodeProposal>(z.toJSONSchema(schema), {
      name: 'plan_native_nodes',
      method: 'functionCalling',
      strict: true,
    })
    .invoke([
      new SystemMessage(nativeNodePlanningPrompt),
      new HumanMessage(
        JSON.stringify({
          scenario: input.scenario,
          apiMaterials: apiMaterials.map(({ callId, operation }) => ({
            callId,
            key: operation.key,
            method: operation.method,
            path: operation.path,
            operation: operation.operation,
            effective: operation.effective,
          })),
          preparedNativeNodes: createPreparedNativeNodeMaterials(
            prepared,
            capabilities,
          ),
          capabilities: capabilities.map((capability) => ({
            name: capability.name,
            description: capability.description,
            parametersSchema: z.toJSONSchema(capability.parametersSchema),
          })),
        }),
      ),
    ]);
  let proposal: NativeNodeProposal;
  try {
    proposal = parseStructuredOutput(schema, output, 'model native node plan');
    if (!isDeepStrictEqual(proposal, output))
      throw new Error(
        'native model schema must validate without defaults, coercion or transformation',
      );
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new NativeNodePlanningError(
      { stage: 'proposal-schema', output },
      error,
    );
  }
  try {
    const nodes = assembleNativeNodeMaterials(prepared, proposal.nativeNodes);
    if (proposal.nativeNodes.some((node) => apiIds.includes(node.id)))
      throw new Error('native node plan contains an API callId');
    createNativeOutputContracts({ nativeNodes: nodes, capabilities });
    const gaps = proposal.gaps.map((gap, index) => ({
      id: `${input.planId}-gap-${index + 1}`,
      stage: 'workflow-graph' as const,
      description: gap.description,
    }));
    if (
      gaps.some((gap) =>
        [...existingIds, ...nodes.map((node) => node.id)].includes(gap.id),
      )
    )
      throw new Error('native planning gap ID collides with a declared node');
    return { nativeNodes: proposal.nativeNodes, gaps };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new NativeNodePlanningError(
      { stage: 'node-validation', output: proposal },
      error,
    );
  }
}
