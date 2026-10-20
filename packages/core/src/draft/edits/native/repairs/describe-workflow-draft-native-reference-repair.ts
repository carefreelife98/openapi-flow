import { createHash } from 'node:crypto';
import { resolveWorkflowPlanningMessages } from '../../../../planning/evidence/resolve-workflow-planning-messages.js';
import type {
  WorkflowDraftNativeReferenceRepairInput,
  WorkflowDraftNativeReferenceRepairDescription,
} from '../../../../types/workflow-draft-native-reference-repair.js';
import { stageWorkflowDraftEdit } from '../../stage-workflow-draft-edit.js';
import { describeNativeReferenceBindings } from '../../../../workflow/describe-native-reference-bindings.js';
import { inspectNativeReferenceStructure } from '../../../../workflow/inspect-native-reference-structure.js';
import { describeWorkflowDraftReferenceSources } from '../../references/describe-workflow-draft-reference-sources.js';

/** Only an actual pending consumer task can authorize these reference-location changes. */
export function describeWorkflowDraftNativeReferenceRepair(
  input: WorkflowDraftNativeReferenceRepairInput,
): WorkflowDraftNativeReferenceRepairDescription {
  const stage = stageWorkflowDraftEdit(input);
  const task = stage.pendingRepairs.find((task) => task.id === input.taskId);
  if (!task || task.kind !== 'native-parameters')
    throw new Error(
      'Native reference repair taskId must identify a current native consumer repair',
    );
  if (stage.blockedSourceNodeIds.includes(task.nodeId))
    throw new Error(
      `Native repair target ${task.nodeId} is blocked by an unresolved contract or requirement`,
    );
  const node = stage.content.nativeNodes.find(
    (node) => node.id === task.nodeId,
  )!;
  const capability = input.context.capabilities.find(
    (capability) => capability.name === node.capability,
  )!;
  const bindings = (
    capability.referenceStructureSchema
      ? inspectNativeReferenceStructure({ node, capability })
      : describeNativeReferenceBindings({ node, capability })
  )
    .filter(
      (binding) =>
        task.targetPointers.includes(binding.nodeIdPointer) ||
        (binding.valuePointer !== undefined &&
          task.targetPointers.includes(binding.valuePointer)),
    )
    .map((binding) => ({
      id:
        'reference-' +
        createHash('sha256')
          .update(
            JSON.stringify([
              node.id,
              binding.nodeIdPointer,
              binding.valuePointer,
              binding.reference,
            ]),
          )
          .digest('hex'),
      ...binding,
    }));
  const pointers = new Set(
    bindings.flatMap((binding) => [
      binding.nodeIdPointer,
      ...(binding.valuePointer === undefined ? [] : [binding.valuePointer]),
    ]),
  );
  if (
    !bindings.length ||
    task.targetPointers.some((pointer) => !pointers.has(pointer)) ||
    [...pointers].some((pointer) => !task.targetPointers.includes(pointer))
  )
    throw new Error(
      'Native consumer repair requires complete implementation-owned parameter reference locations',
    );
  const sources = describeWorkflowDraftReferenceSources({
    stage,
    context: input.context,
    excludedNodeIds: [node.id],
  });
  const fields = {
    stage,
    task: structuredClone(task),
    node: structuredClone(node),
    bindings,
    sources,
    messages: structuredClone(
      resolveWorkflowPlanningMessages(input.context).filter((message) =>
        input.requestMessageIds.includes(message.id),
      ),
    ),
    backgroundMessages: structuredClone(
      resolveWorkflowPlanningMessages(input.context).filter(
        (message) => !input.requestMessageIds.includes(message.id),
      ),
    ),
    instructions: input.plan.steps.map((step) => step.decision.instruction),
    includeExplanations: input.plan.options.includeExplanations,
  };
  return {
    fingerprint: createHash('sha256')
      .update(JSON.stringify(fields))
      .digest('hex'),
    ...fields,
  };
}
