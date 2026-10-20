import {
  validateReviewableWorkflowGraphPlan,
  createNativeOutputContracts,
} from '@openapi-flow/core';
import type { ReadyWorkflowApiMaterial } from '@openapi-flow/core';
import type { CompileReviewableN8nWorkflowInput } from '../types/reviewable-workflow.js';
import type { CreateGapNodeInput } from '../types/reviewable-workflow.js';
import type { N8nWorkflowResult } from '../types/workflow-compilation.js';
import { createGapReviewRegion } from './review/create-gap-review-region.js';
import {
  GAP_REVIEW_REGION_WIDTH,
  GAP_REVIEW_REGION_SPACING,
} from './review/gap-review-region-layout.js';
import { compilePlannedN8nWorkflow } from './compile-planned-n8n-workflow.js';
import { compileNativeWorkflowNodes } from './compile-native-workflow-nodes.js';
import { buildN8nWorkflow } from './build-n8n-workflow.js';
import { validateCompiledBindingSources } from './validate-compiled-binding-sources.js';
import {
  prepareNativeRuntimeInputs,
  assembleNativeRuntimeInputs,
} from './inputs/compile-native-runtime-inputs.js';

export function compileReviewableN8nWorkflow(
  input: CompileReviewableN8nWorkflowInput,
): N8nWorkflowResult {
  // This legacy executable-fragment path does not own deferred API input slots.
  // Only the canonical template compiler may install their preflight/materialization nodes.
  validateReviewableWorkflowGraphPlan({
    materials: input.materials,
    capabilities: input.capabilities,
    plan: input.plan,
  });
  const blocked = new Set(input.plan.blockedCalls.map((item) => item.callId));
  const ready = input.materials.filter(
    (item): item is ReadyWorkflowApiMaterial =>
      item.status === 'ready' && !blocked.has(item.arguments.callId),
  );
  const expected = ready.map((item) => item.arguments.callId).sort();
  const actual = input.apiNodes.map((item) => item.nodeId).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual))
    throw new Error('review apiNodes must exactly match unblocked ready calls');
  if (!input.plan.gaps.length)
    return compilePlannedN8nWorkflow({ ...input, materials: ready });
  const nativeInputs = prepareNativeRuntimeInputs({
    nativeInputs: input.nativeInputs,
    nativeNodes: input.plan.nativeNodes,
    capabilities: input.capabilities,
    apiMaterials: ready.map((item) => ({
      callId: item.arguments.callId,
      operation: item.operation,
      requestMediaType: item.arguments.requestMediaType,
    })),
    nativeOutputs: [],
  });
  const nativeNodes = compileNativeWorkflowNodes({
    ...input,
    materials: ready,
    capabilities:
      nativeInputs === undefined
        ? input.capabilities
        : nativeInputs.capabilities,
  });
  validateCompiledBindingSources(
    input.apiNodes,
    nativeNodes,
    createNativeOutputContracts({
      nativeNodes: input.plan.nativeNodes,
      capabilities: input.capabilities,
    }),
    ready,
  );
  const occupiedPositions = [...input.apiNodes, ...nativeNodes].flatMap(
    (fragment) =>
      fragment.nodes.flatMap((node) =>
        node.config.position === undefined ? [] : [node.config.position],
      ),
  );
  const regionTop =
    Math.max(0, ...occupiedPositions.map((point) => point[1])) + 240;
  const regionStep = GAP_REVIEW_REGION_WIDTH + GAP_REVIEW_REGION_SPACING;
  const placeholders: CreateGapNodeInput[] = input.plan.gaps.map(
    (gap, index) => ({
      nodeId: gap.id,
      gaps: [gap],
      position: [600 + index * regionStep, regionTop],
    }),
  );
  for (const [index, item] of input.plan.blockedCalls.entries()) {
    const material = input.materials.find(
      (material) =>
        (material.status === 'ready'
          ? material.arguments.callId
          : material.callId) === item.callId,
    );
    if (!material) throw new Error('review placeholder material is missing');
    placeholders.push({
      nodeId: item.callId,
      gaps: input.plan.gaps.filter((gap) => item.gapIds.includes(gap.id)),
      operation: material.operation,
      position: [
        600 + (input.plan.gaps.length + index) * regionStep,
        regionTop,
      ],
    });
  }
  const regions = placeholders.map(createGapReviewRegion);
  const graph = {
    id: input.id,
    name: input.name,
    nodes: [
      ...input.apiNodes,
      ...nativeNodes,
      ...regions.map((region) => region.fragment),
    ],
    edges: input.plan.edges,
    starts: input.plan.starts,
    triggerConnections: 'detached' as const,
    annotations: regions.map((region) => region.annotation),
  };
  const compiled =
    nativeInputs === undefined
      ? undefined
      : assembleNativeRuntimeInputs({ ...graph, nativeInputs });
  const result =
    compiled === undefined ? buildN8nWorkflow(graph) : compiled.workflow;
  result.settings = { ...result.settings, executionOrder: 'v1' };
  return {
    status: 'needs-review',
    workflow: result,
    diagnostics: input.plan.gaps,
    ...(compiled === undefined
      ? {}
      : { nativeInputTemplate: compiled.nativeInputTemplate }),
  };
}
