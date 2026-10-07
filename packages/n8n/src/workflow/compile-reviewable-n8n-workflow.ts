import { validateReviewableWorkflowGraphPlan } from '@openapi-flow/core';
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

export function compileReviewableN8nWorkflow(
  input: CompileReviewableN8nWorkflowInput,
): N8nWorkflowResult {
  validateReviewableWorkflowGraphPlan(input);
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
  const nativeNodes = compileNativeWorkflowNodes(input);
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
  const result = buildN8nWorkflow({
    id: input.id,
    name: input.name,
    nodes: [
      ...input.apiNodes,
      ...nativeNodes,
      ...regions.map((region) => region.fragment),
    ],
    edges: input.plan.edges,
    starts: input.plan.starts,
    triggerConnections: 'detached',
    annotations: regions.map((region) => region.annotation),
  });
  result.settings = { ...result.settings, executionOrder: 'v1' };
  return {
    status: 'needs-review',
    workflow: result,
    diagnostics: input.plan.gaps,
  };
}
