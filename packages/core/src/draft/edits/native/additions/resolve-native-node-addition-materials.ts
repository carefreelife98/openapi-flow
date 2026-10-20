import type { WorkflowDraftNativeNodeAdditionInput } from '../../../../types/workflow-draft-native-node-addition.js';
import type { WorkflowDraftNativeAdditionMaterials } from '../../../../types/workflow-draft-native-node-addition-internal.js';
import { nativeMaterialRequirementsSchema } from '../../../../schemas/native-material-requirements-schema.js';
import { stageWorkflowDraftEdit } from '../../stage-workflow-draft-edit.js';
import { describeWorkflowDraftReferenceSources } from '../../references/describe-workflow-draft-reference-sources.js';
import { nativeMaterialSourcesFromDraftReferences } from '../../references/native-material-sources-from-draft-references.js';
import { validateWorkflowDraftNativeDependencies } from './resolve-workflow-draft-native-dependencies.js';

/** Validate the selected unfinished instance before deciding whether its original sources exist. */
export function resolveNativeNodeAdditionMaterials(
  input: WorkflowDraftNativeNodeAdditionInput,
): WorkflowDraftNativeAdditionMaterials {
  if (
    input.allowRuntimeParameters !== undefined &&
    typeof input.allowRuntimeParameters !== 'boolean'
  )
    throw new Error(
      'Native node addition allowRuntimeParameters must be a boolean',
    );
  const stage = stageWorkflowDraftEdit(input);
  const step = input.plan.steps.find((step) => step.id === input.stepId);
  if (!step || step.decision.kind !== 'add-native-node')
    throw new Error(
      'Native node addition stepId must identify an add-native-node decision',
    );
  if (!stage.pendingResolutionStepIds.includes(step.id))
    throw new Error(
      'Native node addition already has an explicit result; remove it before replanning',
    );
  if (typeof step.newNodeId !== 'string' || !step.newNodeId.trim())
    throw new Error(
      'Native node addition requires its code-allocated newNodeId',
    );
  const nodeId = step.newNodeId;
  if (
    stage.content.requirements.some(
      (requirement) =>
        requirement.state !== 'confirmed' &&
        (requirement.scope.kind === 'workflow' ||
          requirement.scope.nodeIds.includes(nodeId)),
    )
  )
    throw new Error(
      `Native node addition ${nodeId} is blocked by an unresolved requirement`,
    );
  const capabilityName = step.decision.capability;
  const definition = input.context.capabilities.find(
    (capability) => capability.name === capabilityName,
  );
  if (!definition)
    throw new Error(
      `Native node addition requires registered capability ${capabilityName}`,
    );
  const dependencies =
    input.producerDependencies === undefined
      ? undefined
      : validateWorkflowDraftNativeDependencies({
          ...input,
          producerDependencies: input.producerDependencies,
        });
  const sourceIds =
    dependencies?.proposal.sourcesByNodeId[nodeId].sourceNodeIds;
  const available = describeWorkflowDraftReferenceSources({
    stage,
    context: input.context,
    excludedNodeIds: [nodeId],
  });
  const sources = {
    values: available.values.filter(
      (source) => sourceIds === undefined || sourceIds.includes(source.nodeId),
    ),
    exclusiveOutputs: available.exclusiveOutputs.filter(
      (source) => sourceIds === undefined || sourceIds.includes(source.nodeId),
    ),
  };
  const pendingSourceNodeIds =
    sourceIds === undefined
      ? []
      : sourceIds.filter(
          (id) =>
            !sources.values.some((source) => source.nodeId === id) &&
            !sources.exclusiveOutputs.some((source) => source.nodeId === id),
        );
  const materials = nativeMaterialSourcesFromDraftReferences(sources);
  const requirements =
    definition.materialRequirements === undefined
      ? []
      : nativeMaterialRequirementsSchema.parse(definition.materialRequirements);
  const missingContext = requirements.flatMap((requirement) =>
    materials[requirement.field].length < requirement.minimumItems
      ? [
          {
            ...requirement,
            availableItems: materials[requirement.field].length,
          },
        ]
      : [],
  );
  return {
    stage,
    nodeId,
    definition,
    sources,
    instruction: step.decision.instruction,
    missingContext,
    pendingSourceNodeIds,
    ...(dependencies === undefined
      ? {}
      : {
          sourceDependencies: {
            planId: dependencies.id,
            sourceNodeIds: [...sourceIds!],
          },
          plannedNativeRoles: structuredClone(dependencies.context.roles),
        }),
  };
}
