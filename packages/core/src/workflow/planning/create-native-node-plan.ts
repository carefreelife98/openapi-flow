import type {
  CreateNativeNodePlanInput,
  NativePlanningResult,
} from '../../types/native-node-planning.js';
import { nativePlanningProposalSchema } from '../../schemas/native-node-planning-record-schema.js';
import { describeNativeNodePlanning } from './describe-native-node-planning.js';
import { assembleNativeNodeMaterials } from './assemble-native-node-materials.js';
import { createNativeOutputContracts } from '../create-native-output-contracts.js';
import { validateNativeApiResponseReferences } from '../validate-native-api-response-references.js';
import { resolveNativeStructureParameters } from '../resolve-native-structure-parameters.js';
import { resolveNativePlanningMaterials } from './resolve-native-planning-materials.js';
import { createWorkflowPlanningCapabilities } from '../create-workflow-planning-capabilities.js';
import { createNativeParameterGenerationContract } from '../../schemas/create-native-parameter-generation-contract.js';
import { jsonValuesEqual } from '../../utils/json-values-equal.js';

/** Opaque symbolic IDs come from the proposal; original contracts and review gap IDs are code-owned. */
export function createNativeNodePlan(
  input: CreateNativeNodePlanInput,
): NativePlanningResult {
  const { input: snapshot } = describeNativeNodePlanning(input);
  const proposal = nativePlanningProposalSchema.parse(input.proposal);
  const prepared = snapshot.preparedNativeNodes,
    apis = snapshot.apiMaterials;
  if (
    !snapshot.capabilities.length &&
    (proposal.nativeNodes.length || proposal.gaps.length)
  )
    throw new Error(
      'native planning without capabilities cannot attribute a model proposal',
    );
  const apiIds = apis.map((material) => material.callId);
  const nodes = assembleNativeNodeMaterials(prepared, proposal.nativeNodes);
  if (proposal.nativeNodes.some((node) => apiIds.includes(node.id)))
    throw new Error('native node plan contains an API callId');
  const { capabilities, outputs } = resolveNativePlanningMaterials({
    nativeNodes: nodes,
    capabilities: snapshot.capabilities,
    apiMaterials: apis,
    nativeOutputs: [],
  });
  const planningCapabilities = createWorkflowPlanningCapabilities({
    capabilities,
    apiCallIds: apiIds,
    nativeOutputs: outputs,
  });
  for (const node of proposal.nativeNodes) {
    const capability = planningCapabilities.find(
      (candidate) => candidate.name === node.capability,
    );
    if (!capability)
      throw new Error(`node ${node.id}: unknown capability ${node.capability}`);
    if (
      node.runtimeParameters !== undefined &&
      snapshot.allowRuntimeParameters !== true
    )
      throw new Error(
        `node ${node.id}: native planning runtime parameters were not enabled`,
      );
    if (node.runtimeParameters === undefined) {
      resolveNativeStructureParameters(node, capability);
      continue;
    }
    const runtimeCapability = capabilities.find(
      (candidate) => candidate.name === node.capability,
    );
    if (!runtimeCapability)
      throw new Error(
        `node ${node.id}: missing executable capability ${node.capability}`,
      );
    resolveNativeStructureParameters(node, runtimeCapability);
    const contract = createNativeParameterGenerationContract({
      nodeId: node.id,
      capability: runtimeCapability,
      planningParametersSchema: capability.parametersSchema,
      runtimeParameters: node.runtimeParameters,
    });
    const checked = contract.valuesSchema.parse(node.parameters);
    if (!jsonValuesEqual(checked, node.parameters))
      throw new Error(
        `node ${node.id}: native planning must preserve original parameter values`,
      );
  }
  createNativeOutputContracts({ nativeNodes: nodes, capabilities });
  validateNativeApiResponseReferences({
    nativeNodes: nodes,
    capabilities,
    apiCallIds: apiIds,
  });
  const gaps = proposal.gaps.map((gap, index) => ({
    id: `${snapshot.planId}-gap-${index + 1}`,
    stage: 'workflow-graph' as const,
    description: gap.description,
  }));
  if (
    gaps.some((gap) =>
      [...apiIds, ...nodes.map((node) => node.id)].includes(gap.id),
    )
  )
    throw new Error('native planning gap ID collides with a declared node');
  return { nativeNodes: structuredClone(proposal.nativeNodes), gaps };
}
