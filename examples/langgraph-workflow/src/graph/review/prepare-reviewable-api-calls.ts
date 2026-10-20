import { planApiBindings, generateApiArguments } from '@openapi-flow/langchain';
import {
  createNativeOutputContracts,
  inspectApiArgumentRequirements,
} from '@openapi-flow/core';
import type {
  ApiBindingPlan,
  ApiCallArguments,
  ReviewableWorkflowApiMaterial,
} from '@openapi-flow/core';
import type {
  WorkflowState,
  WorkflowUpdate,
  PlannedGraphDependencies,
} from '../../types/workflow-graph.js';
import { createApiBindingMaterials } from '../prepare-api-binding-materials.js';
import { collectSelectionReviewGaps } from './collect-selection-review-gaps.js';
import { collectApiBindingReviewGaps } from './collect-api-binding-review-gaps.js';
import { collectBlockedCallGaps } from './collect-blocked-call-gaps.js';
import type {
  PreparedApiMaterials,
  PendingApiArguments,
  ApiLiteralInputMode,
} from '../../types/api-preparation.js';
import type { ApiInputRequirement } from '@openapi-flow/core';

export async function prepareReviewableApiCalls(
  state: WorkflowState,
  dependencies: PlannedGraphDependencies,
): Promise<WorkflowUpdate> {
  const result = await prepareReviewableApiMaterials(
    state,
    dependencies,
    'scenario',
  );
  if (result.requirements.length)
    throw new Error(
      `Request inputs need user clarification: ${JSON.stringify(result.requirements.map((item) => item.targetPointer))}`,
    );
  return {
    bindingPlan: result.bindingPlan,
    reviewMaterials: result.reviewMaterials,
    diagnostics: result.diagnostics,
    trace: result.trace,
  };
}

/** Shared preparation: interactive hosts retain missing values rather than fabricating them. */
export async function prepareReviewableApiMaterials(
  state: WorkflowState,
  dependencies: PlannedGraphDependencies,
  literalInputMode: ApiLiteralInputMode,
): Promise<PreparedApiMaterials> {
  if (!['scenario', 'confirmed-only'].includes(literalInputMode))
    throw new Error('API preparation requires an explicit literal input mode');
  if (!state.contracts || !state.selection)
    throw new Error(
      'review preparation requires resolved contracts and selection',
    );
  const selectionGaps = await collectSelectionReviewGaps(state);
  if (!state.contracts.length)
    return {
      bindingPlan: { calls: [], gaps: [] },
      reviewMaterials: [],
      diagnostics: selectionGaps,
      pendingArguments: [],
      requirements: [],
      trace: [...state.trace, 'bindings', 'arguments'],
    };
  const materials = createApiBindingMaterials(state);
  const bindingPlan: ApiBindingPlan = await planApiBindings({
    scenario: state.scenario,
    model: dependencies.model,
    includeExplanations: dependencies.bindingOptions?.includeExplanations,
    materials,
    nativeOutputs: createNativeOutputContracts({
      nativeNodes: dependencies.preparedNativeNodes ?? [],
      capabilities: dependencies.capabilities,
    }),
  });
  await dependencies.reviewBindings?.(bindingPlan);
  const bindingGaps = collectApiBindingReviewGaps({
    workflowId: state.workflowId,
    materials,
    bindingPlan,
  });
  const diagnostics = [...selectionGaps, ...bindingGaps];
  const blocked = collectBlockedCallGaps({
    materials,
    bindingPlan,
    selectionGaps,
    bindingGaps,
  });
  const reviewMaterials: ReviewableWorkflowApiMaterial[] = [];
  const pendingArguments: PendingApiArguments[] = [];
  const requirements: ApiInputRequirement[] = [];
  for (const material of materials) {
    const call = bindingPlan.calls.find(
      (item) => item.callId === material.callId,
    );
    if (!call)
      throw new Error(`review binding plan is missing ${material.callId}`);
    const gaps = blocked.get(material.callId);
    if (gaps) {
      reviewMaterials.push({
        status: 'blocked',
        callId: material.callId,
        operation: material.operation,
        ...(material.purpose === undefined
          ? {}
          : { purpose: material.purpose }),
        requestMediaType: material.requestMediaType,
        bindings: call.bindings,
        gapIds: [...gaps],
      });
      continue;
    }
    const args: ApiCallArguments =
      literalInputMode === 'scenario'
        ? await generateApiArguments({
            ...material,
            bindings: call.bindings,
            scenario: state.scenario,
            model: dependencies.model,
            includeExplanations:
              dependencies.argumentOptions?.includeExplanations,
          })
        : {
            callId: material.callId,
            values: {},
            bindings: call.bindings,
            unresolvedInputs: [],
            ...(material.requestMediaType === undefined
              ? {}
              : { requestMediaType: material.requestMediaType }),
          };
    const inspection = inspectApiArgumentRequirements({
      ...material,
      values: args.values,
      bindings: args.bindings,
    });
    args.unresolvedInputs = inspection.requirements.map(
      (item) => item.targetPointer,
    );
    if (inspection.status === 'needs-input') {
      requirements.push(...inspection.requirements);
      pendingArguments.push({
        operation: material.operation,
        arguments: args,
        ...(material.purpose === undefined
          ? {}
          : { purpose: material.purpose }),
      });
      continue;
    }
    reviewMaterials.push({
      status: 'ready',
      operation: material.operation,
      arguments: args,
      ...(material.purpose === undefined ? {} : { purpose: material.purpose }),
    });
  }
  return {
    bindingPlan,
    reviewMaterials,
    diagnostics,
    pendingArguments,
    requirements,
    trace: [...state.trace, 'bindings', 'arguments'],
  };
}
