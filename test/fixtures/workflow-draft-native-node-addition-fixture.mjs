import { connectionEditPlan } from './workflow-draft-connection-edit-fixture.mjs';
import {
  nativeParameterEditFixture,
  nativeParameterModel,
} from './workflow-draft-native-parameter-edit-fixture.mjs';
import {
  createN8nNativeCapabilities,
  createPassThroughCapability,
} from '@openapi-flow/n8n';

export async function nativeNodeAdditionFixture(
  capability = 'typed-context',
  includeExplanations = false,
  text = 'Add a separate native node. Use count 4, enabled true and nested value "new". Keep existing nodes and routes unchanged.',
) {
  const input = await nativeParameterEditFixture(text);
  const context = {
    ...input.context,
    capabilities: [
      ...input.context.capabilities,
      ...createN8nNativeCapabilities(),
      createPassThroughCapability(),
    ],
  };
  const base = { ...input, context };
  const plan = connectionEditPlan(
    base,
    [{ kind: 'add-native-node', capability }],
    includeExplanations,
  );
  return { ...base, plan, stepId: plan.steps[0].id, resolutions: [] };
}
export const nativeAdditionParameters = {
  count: 4,
  enabled: true,
  nested: { value: 'new' },
};
export function nativeAdditionProposal(input, decision, sourceIds = []) {
  return {
    decision: {
      ...decision,
      sourceMessageIds: input.requestMessageIds,
      ...(input.plan.options.includeExplanations
        ? {
            explanation: {
              reason:
                'The selected implementation and supplied request define this configuration.',
              evidence: [
                { kind: 'message', messageId: input.requestMessageIds[0] },
                ...sourceIds.map((nodeId) => ({ kind: 'source', nodeId })),
              ],
            },
          }
        : {}),
    },
  };
}
export const nativeAdditionModel = (output, during) =>
  nativeParameterModel([output], during);
