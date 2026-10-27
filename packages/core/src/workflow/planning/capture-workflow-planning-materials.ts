import { isDeepStrictEqual } from 'node:util';
import type {
  WorkflowPlanningMaterialInput,
  WorkflowPlanningMaterialSnapshot,
} from '../../types/workflow-planning-materials.js';
import { workflowDraftNativeNodeSchema } from '../../schemas/workflow-draft-schema.js';
import { describeApiBindingPlanning } from '../../bindings/planning/describe-api-binding-planning.js';
import { validateNativeApiResponseReferences } from '../validate-native-api-response-references.js';
import { captureNativePlanningCapability } from './capture-native-planning-capability.js';
import { resolveNativePlanningMaterials } from './resolve-native-planning-materials.js';
import { bindApiPlanningMaterialContracts } from './bind-api-planning-material-contracts.js';

/** Capture the shared supplied-material protocol, without creating a fictitious planning identity. */
export function captureWorkflowPlanningMaterials(
  input: WorkflowPlanningMaterialInput,
): WorkflowPlanningMaterialSnapshot {
  const suppliedCapabilities =
    input.capabilities === undefined ? [] : input.capabilities;
  if (!Array.isArray(suppliedCapabilities))
    throw new Error('native planning capabilities must be an array');
  const definitions = suppliedCapabilities.map(captureNativePlanningCapability);
  const suppliedApis =
    input.apiMaterials === undefined ? [] : input.apiMaterials;
  if (!Array.isArray(suppliedApis))
    throw new Error('native planning apiMaterials must be an array');
  const apiMaterials = suppliedApis.length
    ? describeApiBindingPlanning({
        scenario: input.scenario,
        materials: suppliedApis,
      }).input.materials
    : [];
  const capabilities = bindApiPlanningMaterialContracts(
    definitions,
    apiMaterials,
  );
  const suppliedPrepared =
    input.preparedNativeNodes === undefined ? [] : input.preparedNativeNodes;
  if (!Array.isArray(suppliedPrepared))
    throw new Error('native planning preparedNativeNodes must be an array');
  const preparedNativeNodes = suppliedPrepared.map((node) => {
    const parsed = workflowDraftNativeNodeSchema.parse(node);
    if (!isDeepStrictEqual(parsed, node))
      throw new Error(
        'prepared native node schema must preserve original values',
      );
    return {
      id: parsed.id,
      capability: parsed.capability,
      parameters: structuredClone(parsed.parameters),
      ...(parsed.runtimeParameters === undefined
        ? {}
        : { runtimeParameters: parsed.runtimeParameters }),
    };
  });
  const resolved = resolveNativePlanningMaterials({
    nativeNodes: preparedNativeNodes,
    capabilities,
    apiMaterials,
    nativeOutputs: [],
  });
  const apiIds = apiMaterials.map((material) => material.callId),
    ids = [...apiIds, ...preparedNativeNodes.map((node) => node.id)];
  if (new Set(ids).size !== ids.length)
    throw new Error('native planning materials require unique non-empty IDs');
  validateNativeApiResponseReferences({
    nativeNodes: preparedNativeNodes,
    capabilities: resolved.capabilities,
    apiCallIds: apiIds,
  });
  return { capabilities, apiMaterials, preparedNativeNodes };
}
