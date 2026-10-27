import { sticky } from '@n8n/workflow-sdk';
import {
  validateWorkflowDraft,
  inspectDraftReadiness,
  resolveWorkflowDraftMaterials,
  inspectDeferredApiInputs,
  inspectNativeRuntimeInputs,
  createNativeRuntimeParameterMaterializations,
  runOpenApiFlowOperation,
} from '@openapi-flow/core';
import type {
  WorkflowApiMaterial,
  WorkflowGraphPlan,
} from '@openapi-flow/core';
import type {
  CompileN8nWorkflowTemplateInput,
  N8nWorkflowTemplateResult,
} from '../../types/workflow-template.js';
import { createTemplateInputNodes } from '../../nodes/inputs/create-template-input-nodes.js';
import { compileValidatedWorkflowFragments } from '../compile-validated-workflow-fragments.js';
import { buildN8nWorkflow } from '../build-n8n-workflow.js';
import { createWorkflowTemplateGuide } from './create-workflow-template-guide.js';
import { prepareTemplateApiFragments } from './prepare-template-api-fragments.js';
import { createTemplateArtifactMapping } from './create-template-artifact-mapping.js';
import {
  TEMPLATE_INPUT_ID,
  TEMPLATE_PREFLIGHT_ID,
  TEMPLATE_PREFLIGHT_NAME,
  TEMPLATE_GUIDE_ID,
} from './workflow-template-identities.js';
import { n8nTemplateInputValuesSchema } from '../../schemas/workflow-template-schema.js';
import { createRuntimeInputNativeCapabilities } from '../inputs/create-runtime-input-native-capabilities.js';
import { resolveN8nNativeMaterials } from '../resolve-n8n-native-materials.js';
import { compileWorkflowMaterialFragments } from '../compile-workflow-material-fragments.js';
import { createTemplateGapRegions } from './create-template-gap-regions.js';

/** An explicit template boundary, never a false fully-resolved strict request. */
export function compileN8nWorkflowTemplate(
  source: CompileN8nWorkflowTemplateInput,
): N8nWorkflowTemplateResult {
  return runOpenApiFlowOperation(
    {
      owner: 'n8n',
      operation: 'compileN8nWorkflowTemplate',
      stage: 'compilation',
      code: 'N8N_COMPILATION_FAILED',
    },
    () => compileN8nWorkflowTemplateSource(source),
  );
}

function compileN8nWorkflowTemplateSource(
  source: CompileN8nWorkflowTemplateInput,
): N8nWorkflowTemplateResult {
  if (source.itemMode !== undefined && source.itemMode !== 'linked')
    throw new Error('template.itemMode must be linked or omitted');
  const initial = resolveWorkflowDraftMaterials(source);
  const materialSnapshot = resolveN8nNativeMaterials({
    apiMaterials: initial.materials,
    nativeOutputs: [],
    nativeNodes: source.draft.nativeNodes,
    capabilities: source.context.capabilities,
  });
  // Planning receipts belong to the original declarations. Runtime-bound
  // capabilities must not replace that source context during draft validation.
  const input: CompileN8nWorkflowTemplateInput = source;
  validateWorkflowDraft(input);
  if (typeof input.name !== 'string' || !input.name.trim())
    throw new Error('template.name must be non-empty');
  const readiness = inspectDraftReadiness(input);
  const { materials, slots, nativeSlots } =
    resolveWorkflowDraftMaterials(input);
  const allSlots = [...slots, ...nativeSlots];
  const checkedValues = n8nTemplateInputValuesSchema.safeParse(
    input.inputValues === undefined ? {} : input.inputValues,
  );
  if (!checkedValues.success)
    throw new Error('template.inputValues must be a JSON value map', {
      cause: checkedValues.error,
    });
  const inputValues = checkedValues.data;
  const known = new Set(allSlots.map((slot) => slot.id));
  const unknown = Object.keys(inputValues).filter((id) => !known.has(id));
  if (unknown.length)
    throw new Error(
      `template.inputValues contains undeclared or stale slots ${unknown.join(', ')}`,
    );
  const apiValues = Object.fromEntries(
    slots
      .filter((slot) => Object.hasOwn(inputValues, slot.id))
      .map((slot) => [slot.id, inputValues[slot.id]]),
  );
  const nativeValues = Object.fromEntries(
    nativeSlots
      .filter((slot) => Object.hasOwn(inputValues, slot.id))
      .map((slot) => [slot.id, inputValues[slot.id]]),
  );
  const inputs = inspectDeferredApiInputs({
    materials,
    inputValues: apiValues,
  });
  if (inputs.status === 'invalid-input')
    throw new Error(inputs.issues.map((issue) => issue.message).join('; '));
  const nativeInputs = inspectNativeRuntimeInputs({
    nativeNodes: input.draft.nativeNodes,
    // Values use current material-bound contracts; original declarations still own draft receipts above.
    capabilities: materialSnapshot.capabilities,
    inputValues: nativeValues,
  });
  if (nativeInputs.status === 'invalid-input')
    throw new Error(
      nativeInputs.issues.map((issue) => issue.message).join('; '),
    );
  const capabilities = createRuntimeInputNativeCapabilities({
    capabilities: materialSnapshot.capabilities,
    slots: nativeSlots,
    revision: input.draft.revision,
    inputNodeName: TEMPLATE_PREFLIGHT_NAME,
  });
  const workflowMaterials: WorkflowApiMaterial[] = materials.map(
    (material) => ({
      operation: material.operation,
      arguments: {
        callId: material.callId,
        values: material.values,
        bindings: material.bindings,
        ...(material.requestedInputs === undefined
          ? {}
          : { requestedInputs: material.requestedInputs }),
        unresolvedInputs: slots
          .filter((slot) => slot.callId === material.callId)
          .map((slot) => slot.targetPointer),
        ...(material.requestMediaType !== undefined
          ? { requestMediaType: material.requestMediaType }
          : {}),
      },
    }),
  );
  const nodeIds = [
    ...input.draft.apiCalls.map((call) => call.id),
    ...input.draft.nativeNodes.map((node) => node.id),
    ...(input.draft.gapNodes === undefined
      ? []
      : input.draft.gapNodes.map((node) => node.id)),
  ];
  if (!nodeIds.length)
    throw new Error(
      'A workflow template requires at least one API, native or unresolved instance',
    );
  if (
    nodeIds.some((id) =>
      [TEMPLATE_INPUT_ID, TEMPLATE_PREFLIGHT_ID, TEMPLATE_GUIDE_ID].includes(
        id,
      ),
    )
  )
    throw new Error('Draft node ID conflicts with a template system node');
  const plan: WorkflowGraphPlan = {
    nativeNodes: input.draft.nativeNodes,
    edges: input.draft.edges,
    starts: nodeIds.filter(
      (id) => !input.draft.edges.some((edge) => edge.to === id),
    ),
    gaps: [],
  };
  const prepared = prepareTemplateApiFragments({
    template: input,
    capabilities,
    materials: workflowMaterials,
    slots,
    plan,
  });
  const compilation = {
    id: input.draft.id,
    name: input.name,
    plan,
    materials: workflowMaterials,
    apiNodes: prepared.apiNodes,
    capabilities,
  };
  const gapNodes =
    input.draft.gapNodes === undefined ? [] : input.draft.gapNodes;
  // validateWorkflowDraft above owns the complete graph, including unresolved
  // structural nodes. The strict compiler continues to reject unresolved graphs.
  const materialFragments = gapNodes.length
    ? compileWorkflowMaterialFragments(compilation)
    : compileValidatedWorkflowFragments(compilation);
  const gapRegions = createTemplateGapRegions(gapNodes, materialFragments);
  const fragments = [
    ...materialFragments,
    ...gapRegions.map((region) => region.fragment),
  ];
  const { mappings, inputSlots } = createTemplateArtifactMapping({
    context: input.context,
    draft: input.draft,
    materials: workflowMaterials,
    slots: allSlots,
    fragments,
  });
  const { deploymentRequirements } = prepared;
  const triggerConnected =
    readiness.designReady && deploymentRequirements.length === 0;
  const guide = createWorkflowTemplateGuide({
    draft: input.draft,
    readiness,
    slots: inputSlots,
    mappings,
    deploymentRequirements,
    requestInputsReady: inputs.status === 'ready',
    nativeInputsReady: nativeInputs.status === 'ready',
    triggerConnected,
  });
  const systemNodes = createTemplateInputNodes({
    revision: input.draft.revision,
    slots: allSlots,
    inputValues,
    requests: prepared.requests,
    nativeParameters: createNativeRuntimeParameterMaterializations({
      nativeNodes: input.draft.nativeNodes,
      capabilities: materialSnapshot.capabilities,
    }),
  });
  const height =
    100 +
    guide
      .split('\n')
      .reduce(
        (total, line) => total + Math.max(1, Math.ceil(line.length / 90)) * 24,
        0,
      );
  const workflow = buildN8nWorkflow({
    id: input.draft.id,
    name: input.name,
    nodes: [...systemNodes, ...fragments],
    edges: [
      {
        from: TEMPLATE_INPUT_ID,
        output: 'main',
        to: TEMPLATE_PREFLIGHT_ID,
        input: 'main',
      },
      ...plan.starts.map((to) => ({
        from: TEMPLATE_PREFLIGHT_ID,
        output: 'main',
        to,
        input: 'main',
      })),
      ...plan.edges,
    ],
    starts: [TEMPLATE_INPUT_ID],
    triggerConnections: triggerConnected ? 'connected' : 'detached',
    annotations: [
      sticky(guide, [], {
        id: TEMPLATE_GUIDE_ID,
        name: '워크플로우 사용 안내',
        position: [0, -height - 100],
        width: 1000,
        height,
        color: triggerConnected ? 5 : 3,
      }),
      ...gapRegions.map((region) => region.annotation),
    ],
  });
  workflow.settings = { ...workflow.settings, executionOrder: 'v1' };
  return {
    revision: input.draft.revision,
    workflow,
    draftReadiness: readiness,
    requestInputsReady: inputs.status === 'ready',
    nativeInputsReady: nativeInputs.status === 'ready',
    runtimeInputsReady:
      inputs.status === 'ready' && nativeInputs.status === 'ready',
    deploymentConfigured: deploymentRequirements.length === 0,
    triggerConnected,
    inputSlots,
    deploymentRequirements,
    nodeMappings: mappings,
    guide,
  };
}
