import type { ValidateWorkflowDraftEditPlanInput } from '../../types/workflow-draft-edit.js';
import type { WorkflowDraftSelectedNode } from '../../types/workflow-draft-selected-nodes.js';
import { validateWorkflowDraftEditPlan } from './validate-workflow-draft-edit-plan.js';
import { resolveWorkflowDraftApiResponseSources } from './references/resolve-workflow-draft-api-response-sources.js';

/** Final selected identities exist before values; removed nodes never remain scope candidates. */
export function describeWorkflowDraftSelectedNodes(
  input: ValidateWorkflowDraftEditPlanInput,
): WorkflowDraftSelectedNode[] {
  validateWorkflowDraftEditPlan(input);
  const removed = new Set(
    input.plan.steps.flatMap((step) =>
      step.decision.kind === 'remove-node' ? [step.decision.nodeId] : [],
    ),
  );
  const content = {
    ...input.draft,
    apiCalls: input.draft.apiCalls.filter((call) => !removed.has(call.id)),
  };
  const apis = resolveWorkflowDraftApiResponseSources({
    content,
    context: input.context,
    plan: input.plan,
    pendingResolutionStepIds: input.plan.steps.map((step) => step.id),
  });
  const nodes: WorkflowDraftSelectedNode[] = apis.map((source) => ({
    id: source.nodeId,
    kind: 'api',
    operation: source.operation,
    ...(source.preparation.status === 'request-pending'
      ? { instruction: source.preparation.instruction }
      : {}),
  }));
  for (const node of input.draft.nativeNodes.filter(
    (node) => !removed.has(node.id),
  )) {
    const step = input.plan.steps.find(
      (step) => 'nodeId' in step.decision && step.decision.nodeId === node.id,
    );
    nodes.push({
      id: node.id,
      kind: 'native',
      capability: node.capability,
      ...(step === undefined ? {} : { instruction: step.decision.instruction }),
    });
  }
  for (const step of input.plan.steps)
    if (step.decision.kind === 'add-native-node') {
      if (!step.newNodeId)
        throw new Error(
          `Selected native ${step.id} requires its allocated identity`,
        );
      nodes.push({
        id: step.newNodeId,
        kind: 'native',
        capability: step.decision.capability,
        instruction: step.decision.instruction,
      });
    }
  for (const gap of input.draft.gapNodes === undefined
    ? []
    : input.draft.gapNodes)
    if (!removed.has(gap.id))
      nodes.push({
        id: gap.id,
        kind: 'capability-gap',
        instruction: gap.requestedBehavior,
      });
  for (const step of input.plan.steps)
    if (step.decision.kind === 'report-capability-gap') {
      if (!step.newNodeId)
        throw new Error(
          `Selected capability gap ${step.id} requires its allocated identity`,
        );
      nodes.push({
        id: step.newNodeId,
        kind: 'capability-gap',
        instruction: step.decision.instruction,
      });
    }
  if (new Set(nodes.map((node) => node.id)).size !== nodes.length)
    throw new Error('Selected nodes require distinct actual identities');
  return nodes;
}
