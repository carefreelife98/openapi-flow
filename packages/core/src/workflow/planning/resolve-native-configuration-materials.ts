import type {
  NativeNodeConfigurationInput,
  NativeNodeConfigurationReadiness,
  NativeConfigurationMaterialContext,
  ResolvedNativeConfigurationMaterials,
} from '../../types/native-node-planning.js';
import { validateNativeInstanceSelection } from './resolve-native-instance-selection.js';
import { describeNativeNodePlanning } from './describe-native-node-planning.js';
import { resolveNativePlanningMaterials } from './resolve-native-planning-materials.js';
import { createWorkflowPlanningCapabilities } from '../create-workflow-planning-capabilities.js';
import { bindNativeMaterialContracts } from '../bind-native-material-contracts.js';
import { nativeMaterialRequirementsSchema } from '../../schemas/native-material-requirements-schema.js';
import { createNativeParameterGenerationContract } from '../../schemas/create-native-parameter-generation-contract.js';
import { jsonValuesEqual } from '../../utils/json-values-equal.js';
import { validateNativeInstanceDependencies } from './resolve-native-instance-dependencies.js';
import type { WorkflowNativeMaterialSources } from '../../types/native-material-snapshot.js';
import type {
  PlannedNativeNode,
  WorkflowCapability,
} from '../../types/workflow-plan.js';
import { createWorkflowNodeContracts } from '../create-workflow-node-contracts.js';
import { isSchemaProvablyEmpty } from '../../bindings/is-schema-provably-empty.js';
import { z } from 'zod';
import { nativeParameterProducerIds } from './native-parameter-producer-ids.js';

/** Selection grants source access; only actual parameter references become bindings. */
export function validateNativeNodeProducerReferences(
  node: PlannedNativeNode,
  capability: WorkflowCapability,
  allowed: string[],
): void {
  const [contract] = createWorkflowNodeContracts({
    materials: [],
    nativeNodes: [node],
    capabilities: [capability],
  });
  const actual = nativeParameterProducerIds(contract);
  const unexpected = actual.filter((id) => !allowed.includes(id));
  if (unexpected.length)
    throw new Error(
      `Native instance ${node.id}: actual parameter references must be a subset of its allowed selected producer materials; unselected producers: ${unexpected.join(', ')}`,
    );
}

/** Validate the original role receipt before resolving completed producer contracts. */
function prepareNativeConfigurationMaterials(
  input: NativeNodeConfigurationInput,
): NativeConfigurationMaterialContext {
  const selection = validateNativeInstanceSelection(input);
  const instance = selection.instances.find(
    (entry) => entry.id === input.nodeId,
  );
  if (!instance)
    throw new Error(`Native instance ${input.nodeId} is not selected`);
  const dependencies =
    input.dependencies === undefined
      ? undefined
      : validateNativeInstanceDependencies({
          ...input,
          dependencies: input.dependencies,
        });
  const configured =
    input.configuredNodes === undefined ? [] : input.configuredNodes;
  if (!Array.isArray(configured))
    throw new Error('native configuration configuredNodes must be an array');
  const { input: snapshot } = describeNativeNodePlanning(input);
  for (const node of configured) {
    const selected = selection.instances.find((entry) => entry.id === node.id);
    if (
      !selected ||
      selected.id === input.nodeId ||
      selected.capability !== node.capability ||
      !jsonValuesEqual(selected.runtimeParameters, node.runtimeParameters)
    )
      throw new Error(
        `Configured native instance ${node.id} does not match a distinct selected role and owner`,
      );
  }
  const materials = resolveNativePlanningMaterials({
    apiMaterials: snapshot.apiMaterials,
    nativeOutputs: [],
    nativeNodes: [...snapshot.preparedNativeNodes, ...configured],
    capabilities: snapshot.capabilities,
  });
  const planning = createWorkflowPlanningCapabilities({
    capabilities: materials.capabilities,
    apiCallIds: snapshot.apiMaterials.map((material) => material.callId),
    nativeOutputs: materials.outputs,
  });
  for (const node of configured) {
    const capability = planning.find((entry) => entry.name === node.capability);
    if (!capability)
      throw new Error(
        `Configured native instance ${node.id} has no supplied capability`,
      );
    const runtimeCapability = materials.capabilities.find(
      (entry) => entry.name === capability.name,
    );
    if (!runtimeCapability)
      throw new Error(
        `Configured native instance ${node.id} has no executable capability ${capability.name}`,
      );
    const contract = createNativeParameterGenerationContract({
      nodeId: node.id,
      capability: runtimeCapability,
      planningParametersSchema: capability.parametersSchema,
      runtimeParameters: node.runtimeParameters,
    });
    const values = contract.valuesSchema.parse(node.parameters);
    if (!jsonValuesEqual(values, node.parameters))
      throw new Error(
        `Configured native instance ${node.id} cannot coerce or default literal parameters`,
      );
    if (dependencies !== undefined)
      validateNativeNodeProducerReferences(
        node,
        runtimeCapability,
        dependencies.proposal.sourcesByNodeId[node.id].sourceNodeIds,
      );
  }
  const definition = snapshot.capabilities.find(
    (entry) => entry.name === instance.capability,
  );
  if (!definition)
    throw new Error(
      `Native instance ${input.nodeId} has no registered capability`,
    );
  return {
    selection,
    instance,
    snapshot,
    definition,
    capabilities: materials.capabilities,
    configuredNodes: structuredClone(configured),
    outputs: materials.outputs,
    ...(dependencies === undefined
      ? {}
      : {
          sourceDependencies: {
            planId: dependencies.id,
            sourceNodeIds: [
              ...dependencies.proposal.sourcesByNodeId[instance.id]
                .sourceNodeIds,
            ],
          },
        }),
  };
}

/** An explicit empty choice means no sources; it never falls back to all available producers. */
function nativeConfigurationSources(
  materials: NativeConfigurationMaterialContext,
): WorkflowNativeMaterialSources {
  const allowed = materials.sourceDependencies?.sourceNodeIds;
  return {
    apiMaterials: materials.snapshot.apiMaterials.filter(
      (source) => allowed === undefined || allowed.includes(source.callId),
    ),
    nativeOutputs: materials.outputs.filter(
      (source) => allowed === undefined || allowed.includes(source.nodeId),
    ),
  };
}

function nativeConfigurationReadiness(
  materials: NativeConfigurationMaterialContext,
): NativeNodeConfigurationReadiness {
  const { definition, snapshot, instance } = materials;
  const requirements =
    definition.materialRequirements === undefined
      ? []
      : nativeMaterialRequirementsSchema.parse(definition.materialRequirements);
  const sources = nativeConfigurationSources(materials);
  const pending = materials.sourceDependencies?.sourceNodeIds.filter(
    (id) =>
      !snapshot.apiMaterials.some((source) => source.callId === id) &&
      !snapshot.preparedNativeNodes.some((node) => node.id === id) &&
      !materials.configuredNodes.some((node) => node.id === id),
  );
  const missingContext = requirements.flatMap((requirement) =>
    sources[requirement.field].length < requirement.minimumItems
      ? [{ ...requirement, availableItems: sources[requirement.field].length }]
      : [],
  );
  return missingContext.length || (pending !== undefined && pending.length > 0)
    ? {
        status: 'awaiting-materials',
        nodeId: instance.id,
        capability: instance.capability,
        missingContext,
        ...(pending === undefined ? {} : { pendingSourceNodeIds: pending }),
      }
    : { status: 'ready', nodeId: instance.id };
}

/** Constructor prerequisites only, not proof that a requested pointer or dependency is available. */
export function inspectNativeNodeConfigurationReadiness(
  input: NativeNodeConfigurationInput,
): NativeNodeConfigurationReadiness {
  return nativeConfigurationReadiness(
    prepareNativeConfigurationMaterials(input),
  );
}

/** Keep selection immutable; bind the value contract from actual completed sources separately. */
export function resolveNativeConfigurationMaterials(
  input: NativeNodeConfigurationInput,
): ResolvedNativeConfigurationMaterials {
  const materials = prepareNativeConfigurationMaterials(input);
  const readiness = nativeConfigurationReadiness(materials);
  if (readiness.status !== 'ready')
    throw new Error(
      `Native configuration ${input.nodeId} [${readiness.capability}] requires ${readiness.missingContext.map((entry) => `${entry.field} (at least ${entry.minimumItems}, available ${entry.availableItems})`).join(', ')}${readiness.pendingSourceNodeIds?.length ? '; pending selected producers: ' + readiness.pendingSourceNodeIds.join(', ') : ''}`,
    );
  const sources = nativeConfigurationSources(materials);
  const bound = bindNativeMaterialContracts(materials.definition, sources);
  const [capability] = createWorkflowPlanningCapabilities({
    capabilities: [bound],
    apiCallIds: sources.apiMaterials.map((material) => material.callId),
    nativeOutputs: sources.nativeOutputs,
  });
  const contract = createNativeParameterGenerationContract({
    nodeId: materials.instance.id,
    capability: bound,
    planningParametersSchema: capability.parametersSchema,
    runtimeParameters: materials.instance.runtimeParameters,
  });
  if (isSchemaProvablyEmpty(z.toJSONSchema(capability.parametersSchema)))
    throw new Error(
      `Native instance ${input.nodeId}: current source contracts permit no parameter value for ${capability.name}`,
    );
  return {
    ...materials,
    capability: bound,
    contract,
    instance: {
      ...materials.instance,
      literalParametersSchema: contract.literalParametersSchema,
      hasLiteralParameters: contract.hasLiteralParameters,
    },
  };
}
