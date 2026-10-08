import type { ValidateReviewableWorkflowGraphPlanInput } from '../types/reviewable-workflow.js';
import { validateApiArguments } from '../arguments/validate-api-arguments.js';
import { validateApiBindingAssignments } from '../bindings/validate-api-binding-assignments.js';
import { validateApiBindingGaps } from '../bindings/validate-api-binding-gaps.js';
import { createReviewableNodeContracts } from './create-reviewable-node-contracts.js';
import { validateWorkflowTopology } from './validate-workflow-topology.js';
import { createNativeOutputContracts } from './create-native-output-contracts.js';

export function validateReviewableWorkflowGraphPlan(
  input: ValidateReviewableWorkflowGraphPlanInput,
): void {
  const { plan, materials } = input;
  const gaps = new Map(plan.gaps.map((gap) => [gap.id, gap]));
  if (
    gaps.size !== plan.gaps.length ||
    plan.gaps.some(
      (gap) =>
        !gap.id.trim() ||
        !gap.description.trim() ||
        !['api-selection', 'api-bindings', 'workflow-graph'].includes(
          gap.stage,
        ),
    )
  )
    throw new Error('review gaps require unique IDs, stages and descriptions');
  const ids = materials.map((item) =>
    item.status === 'ready' ? item.arguments.callId : item.callId,
  );
  if (new Set(ids).size !== ids.length || ids.some((id) => !id.trim()))
    throw new Error('review materials require unique non-empty callIds');
  const blocked = new Map(
    plan.blockedCalls.map((item) => [item.callId, item.gapIds]),
  );
  if (blocked.size !== plan.blockedCalls.length)
    throw new Error('review blockedCalls contains duplicate callIds');
  for (const [callId, gapIds] of blocked) {
    if (
      !ids.includes(callId) ||
      !gapIds.length ||
      new Set(gapIds).size !== gapIds.length ||
      gapIds.some((id) => !gaps.has(id))
    )
      throw new Error(
        `review blocked call ${callId} requires declared gap IDs`,
      );
  }
  for (const item of materials) {
    if (item.status === 'blocked') {
      if (
        !item.gapIds.length ||
        item.gapIds.some((id) => !blocked.get(item.callId)?.includes(id))
      )
        throw new Error(
          `review plan omitted blocked requirement for ${item.callId}`,
        );
    } else {
      const args = item.arguments;
      const result = validateApiArguments({
        operation: item.operation,
        values: args.values,
        bindings: args.bindings,
        requestMediaType: args.requestMediaType,
      });
      if (args.unresolvedInputs.length || !result.valid)
        throw new Error(
          `review ready material ${args.callId} has unresolved request inputs`,
        );
    }
  }
  if (materials.length)
    validateApiBindingAssignments({
      nativeOutputs: createNativeOutputContracts({
        nativeNodes: plan.nativeNodes,
        capabilities: input.capabilities,
      }),
      materials: materials.map((item) => ({
        callId: item.status === 'ready' ? item.arguments.callId : item.callId,
        operation: item.operation,
        requestMediaType:
          item.status === 'ready'
            ? item.arguments.requestMediaType
            : item.requestMediaType,
      })),
      calls: materials.map((item) => ({
        callId: item.status === 'ready' ? item.arguments.callId : item.callId,
        bindings:
          item.status === 'ready' ? item.arguments.bindings : item.bindings,
      })),
    });
  for (const gap of plan.gaps) {
    if (gap.stage !== 'api-bindings') continue;
    if (
      typeof gap.callId !== 'string' ||
      typeof gap.targetPointer !== 'string' ||
      !blocked.get(gap.callId)?.includes(gap.id)
    )
      throw new Error(
        'api-bindings review gap requires its declared blocked callId and request targetPointer',
      );
    validateApiBindingGaps({
      materials: materials.map((item) => ({
        callId: item.status === 'ready' ? item.arguments.callId : item.callId,
        operation: item.operation,
        requestMediaType:
          item.status === 'ready'
            ? item.arguments.requestMediaType
            : item.requestMediaType,
      })),
      plan: {
        calls: [],
        gaps: [
          {
            callId: gap.callId,
            targetPointer: gap.targetPointer,
            description: gap.description,
          },
        ],
      },
    });
  }
  const apiIds = new Set(ids.filter((id) => !blocked.has(id)));
  validateWorkflowTopology({
    contracts: createReviewableNodeContracts(input),
    apiIds,
    edges: plan.edges,
    starts: plan.starts,
  });
}
