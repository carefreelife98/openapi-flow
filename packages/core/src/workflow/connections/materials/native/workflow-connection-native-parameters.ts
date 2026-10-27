import { isDeepStrictEqual } from 'node:util';
import type {
  NativeNodeParameterProposal,
  ReadyNativeNodeParameters,
} from '../../../../types/native-node-planning.js';
import type {
  WorkflowConnectionNativeParametersInput,
  WorkflowConnectionNativeParametersDescription,
  PreparedConnectionNativeParameters,
  ResolveWorkflowConnectionNativeParametersInput,
  WorkflowConnectionNativeParameterResult,
} from '../../../../types/workflow-connection-native-repair.js';
import { prepareConnectionNativeRepair } from './prepare-connection-native-repair.js';
import { resolveWorkflowConnectionNativeDependencies } from './workflow-connection-native-dependencies.js';
import { nativeParameterProducerIds } from '../../../planning/native-parameter-producer-ids.js';
import { bindNativeMaterialContracts } from '../../../bind-native-material-contracts.js';
import { createWorkflowPlanningCapabilities } from '../../../create-workflow-planning-capabilities.js';
import { createNativeParameterGenerationContract } from '../../../../schemas/create-native-parameter-generation-contract.js';
import { createNativeNodeParameterProposalSchema } from '../../../../schemas/create-native-node-parameter-proposal-schema.js';
import { nativeMaterialRequirementsSchema } from '../../../../schemas/native-material-requirements-schema.js';
import { connectionValueFingerprint } from '../../incremental/connection-graph-identity.js';
import { nativeParameterQuestionIdentity } from '../../../planning/native-parameter-question-identity.js';
import { resolveNativeStructureParameters } from '../../../resolve-native-structure-parameters.js';
import { validateNativeNodeProducerReferences } from '../../../planning/resolve-native-configuration-materials.js';
import { createNativeOutputContracts } from '../../../create-native-output-contracts.js';
import { resolveNativeMaterialSnapshot } from '../../../resolve-native-material-snapshot.js';

function prepareConnectionNativeParameterTarget(
  input: WorkflowConnectionNativeParametersInput,
  completed: ReadyNativeNodeParameters[],
): PreparedConnectionNativeParameters {
  const { context, description } = prepareConnectionNativeRepair(input);
  const stages = input.request.request.targets
    .filter((target) => target.nodeId === input.nodeId)
    .map((target) => target.stage);
  if (
    !stages.some(
      (stage) =>
        stage === 'native-parameters' || stage === 'native-dependencies',
    )
  )
    throw new Error(
      'Native parameter repair requires an authorized existing target',
    );
  const target = context.nativeNodes.find((node) => node.id === input.nodeId);
  if (!target)
    throw new Error(`Native parameter repair node is absent: ${input.nodeId}`);
  const checkedDependencies =
    input.dependencies === undefined
      ? undefined
      : resolveWorkflowConnectionNativeDependencies({
          ...input,
          proposal: input.dependencies.proposal,
        });
  if (
    checkedDependencies !== undefined &&
    !isDeepStrictEqual(checkedDependencies, input.dependencies)
  )
    throw new Error('Native repair dependencies are stale or changed');
  let sourceNodeIds: string[];
  if (stages.includes('native-dependencies')) {
    if (!input.dependencies)
      throw new Error(
        `Native repair ${input.nodeId} requires its checked dependency result`,
      );
    sourceNodeIds =
      checkedDependencies!.proposal.sourcesByNodeId[input.nodeId].sourceNodeIds;
  } else {
    sourceNodeIds = nativeParameterProducerIds(
      description.source.context.nodes.find(
        (node) => node.id === input.nodeId,
      )!,
    );
  }
  const selected = new Set(sourceNodeIds);
  const completedNodes = new Map(
    completed.map((result) => [result.node.id, result.node]),
  );
  const pendingIds = [
    ...new Set(
      input.request.request.targets
        .filter(
          (target) =>
            target.stage === 'native-dependencies' ||
            target.stage === 'native-parameters',
        )
        .map((target) => target.nodeId),
    ),
  ].filter((id) => !completedNodes.has(id));
  const current = resolveNativeMaterialSnapshot({
    capabilities: description.source.input.capabilities,
    apiMaterials: description.source.input.materials.map((material) => ({
      operation: material.operation,
      callId:
        material.status === 'ready'
          ? material.arguments.callId
          : material.callId,
    })),
    nativeNodes: context.nativeNodes.map((node) =>
      completedNodes.has(node.id) ? completedNodes.get(node.id)! : node,
    ),
    nativeOutputs: [],
    deferredNodeIds: pendingIds,
  });
  for (const sourceNodeId of selected)
    if (
      context.nativeNodes.some((node) => node.id === sourceNodeId) &&
      !current.bindings.some((binding) => binding.nodeId === sourceNodeId)
    )
      throw new Error(
        `Native repair ${input.nodeId} requires completed producer ${sourceNodeId}; old pending output cannot be reused`,
      );
  const sources = {
    apiMaterials: description.source.input.materials
      .filter((material) =>
        selected.has(
          material.status === 'ready'
            ? material.arguments.callId
            : material.callId,
        ),
      )
      .map((material) => ({
        callId:
          material.status === 'ready'
            ? material.arguments.callId
            : material.callId,
        operation: material.operation,
        requestMediaType:
          material.status === 'ready'
            ? material.arguments.requestMediaType
            : material.requestMediaType,
        ...(material.purpose === undefined
          ? {}
          : { purpose: material.purpose }),
      })),
    nativeOutputs: current.outputs.filter((output) =>
      selected.has(output.nodeId),
    ),
  };
  const definition = description.source.input.capabilities.find(
    (item) => item.name === target.capability,
  )!;
  const requirements =
    definition.materialRequirements === undefined
      ? []
      : nativeMaterialRequirementsSchema.parse(definition.materialRequirements);
  for (const requirement of requirements)
    if (sources[requirement.field].length < requirement.minimumItems)
      throw new Error(
        `Native repair ${target.id} lacks selected ${requirement.field} contracts`,
      );
  const capability = bindNativeMaterialContracts(definition, sources);
  const [planning] = createWorkflowPlanningCapabilities({
    capabilities: [capability],
    apiCallIds: sources.apiMaterials.map((material) => material.callId),
    nativeOutputs: sources.nativeOutputs,
  });
  const contract = createNativeParameterGenerationContract({
    nodeId: target.id,
    capability,
    planningParametersSchema: planning.parametersSchema,
    runtimeParameters: target.runtimeParameters,
  });
  const fields = {
    ...context,
    apiMaterials: context.apiMaterials.filter((material) =>
      selected.has(material.nodeId),
    ),
    nativeNodes: context.nativeNodes
      .filter((node) => selected.has(node.id))
      .map((node) =>
        completedNodes.has(node.id) ? completedNodes.get(node.id)! : node,
      ),
    outputs: sources.nativeOutputs,
    target,
    capabilityDescription: capability.description,
    sourceNodeIds,
    literalParametersSchema: contract.literalParametersSchema,
    hasLiteralParameters: contract.hasLiteralParameters,
  };
  return {
    description: structuredClone({
      ...fields,
      fingerprint: connectionValueFingerprint({
        fields,
        dependencies: input.dependencies,
        completedParameters: completed,
      }),
    }),
    capability,
    contract,
    schema: createNativeNodeParameterProposalSchema(
      contract,
      input.includeExplanations === true,
    ),
  };
}

function prepareConnectionNativeParameters(
  input: WorkflowConnectionNativeParametersInput,
): PreparedConnectionNativeParameters {
  const completed =
    input.completedParameters === undefined ? [] : input.completedParameters;
  if (!Array.isArray(completed))
    throw new Error(
      'Native repair completedParameters must be an ordered array',
    );
  const verified: ReadyNativeNodeParameters[] = [];
  const seen = new Set<string>();
  for (const result of completed) {
    if (
      !result ||
      result.status !== 'ready' ||
      !result.node ||
      seen.has(result.node.id) ||
      result.node.id === input.nodeId
    )
      throw new Error(
        'Native repair completedParameters must contain distinct other ready targets',
      );
    const targetInput = {
      ...input,
      nodeId: result.node.id,
      fingerprint: result.fingerprint,
      proposal: result.proposal,
    };
    const expected = resolvePreparedConnectionNativeParameters(
      prepareConnectionNativeParameterTarget(targetInput, verified),
      targetInput,
    );
    if (expected.status !== 'ready' || !isDeepStrictEqual(expected, result))
      throw new Error(
        'Native repair completed parameter receipt changed or belongs to another source/order',
      );
    verified.push(expected);
    seen.add(expected.node.id);
  }
  return prepareConnectionNativeParameterTarget(input, verified);
}

export function describeWorkflowConnectionNativeParameters(
  input: WorkflowConnectionNativeParametersInput,
): WorkflowConnectionNativeParametersDescription {
  return prepareConnectionNativeParameters(input).description;
}
export function createWorkflowConnectionNativeParametersSchema(
  input: WorkflowConnectionNativeParametersInput,
) {
  return prepareConnectionNativeParameters(input).schema;
}

/** Validate one private candidate; downstream contracts and graph adoption remain the final apply boundary. */
export function resolveWorkflowConnectionNativeParameters(
  input: ResolveWorkflowConnectionNativeParametersInput,
): WorkflowConnectionNativeParameterResult {
  const prepared = prepareConnectionNativeParameters(input);
  return resolvePreparedConnectionNativeParameters(prepared, input);
}

function resolvePreparedConnectionNativeParameters(
  prepared: PreparedConnectionNativeParameters,
  input: ResolveWorkflowConnectionNativeParametersInput,
): WorkflowConnectionNativeParameterResult {
  const { description } = prepared;
  if (input.fingerprint !== description.fingerprint)
    throw new Error(
      'Native repair parameters belong to stale source or dependency work',
    );
  const proposal: NativeNodeParameterProposal = prepared.schema.parse(
    input.proposal,
  );
  if (!isDeepStrictEqual(proposal, input.proposal))
    throw new Error('Native repair parameters must not be normalized');
  if (proposal.decision.status === 'needs-clarification')
    return {
      status: 'needs-clarification',
      nodeId: input.nodeId,
      fingerprint: description.fingerprint,
      id: nativeParameterQuestionIdentity(
        description.fingerprint,
        input.nodeId,
        proposal,
      ),
      message: proposal.decision.message,
      proposal: structuredClone(proposal),
    };
  const node = {
    ...description.target,
    parameters: proposal.decision.parameters,
  };
  resolveNativeStructureParameters(node, prepared.capability);
  validateNativeNodeProducerReferences(
    node,
    prepared.capability,
    description.sourceNodeIds,
  );
  createNativeOutputContracts({
    nativeNodes: [node],
    capabilities: [prepared.capability],
  });
  return {
    status: 'ready',
    fingerprint: description.fingerprint,
    node: structuredClone(node),
    proposal: structuredClone(proposal),
  };
}
