import { createHash } from 'node:crypto';
import type {
  WorkflowDraftNativeDependenciesInput,
  WorkflowDraftNativeDependencyContext,
  WorkflowDraftNativeDependencyRole,
  WorkflowDraftNativeDependencies,
  ResolveWorkflowDraftNativeDependenciesInput,
  ValidateWorkflowDraftNativeDependenciesInput,
  ValidateWorkflowDraftNativeDependencyResolutionsInput,
} from '../../../../types/workflow-draft-native-dependencies.js';
import { stageWorkflowDraftEdit } from '../../stage-workflow-draft-edit.js';
import { describeWorkflowDraftReferenceSources } from '../../references/describe-workflow-draft-reference-sources.js';
import { resolveWorkflowPlanningMessages } from '../../../../planning/evidence/resolve-workflow-planning-messages.js';
import { createWorkflowDraftNativeDependenciesSchema } from '../../../../schemas/workflow-draft-native-dependencies-schema.js';
import { validateNativeProducerDependencyGraph } from '../../../../workflow/planning/validate-native-producer-dependency-graph.js';
import { validateNativeNodeProducerReferences } from '../../../../workflow/planning/resolve-native-configuration-materials.js';
import { nativeMaterialSourcesFromDraftReferences } from '../../references/native-material-sources-from-draft-references.js';
import { bindNativeMaterialContracts } from '../../../../workflow/bind-native-material-contracts.js';
import { jsonValuesEqual } from '../../../../utils/json-values-equal.js';
import {
  requireNativeParameterReferenceSources,
  describePendingNativeProducer,
  selectNativeParameterProducers,
} from '../../../../workflow/planning/select-native-parameter-producers.js';
import type { NativeParameterProducerCandidate } from '../../../../types/native-producer-eligibility.js';

/** Reconstruct the original semantic plan before any value generation. Progress never rebases this receipt. */
export function describeWorkflowDraftNativeDependencies(
  input: WorkflowDraftNativeDependenciesInput,
): WorkflowDraftNativeDependencyContext {
  const stage = stageWorkflowDraftEdit({
    ...input,
    resolutions: [],
    repairs: [],
  });
  const sources = describeWorkflowDraftReferenceSources({
    stage,
    context: input.context,
    excludedNodeIds: [],
  });
  const roles: WorkflowDraftNativeDependencyRole[] = [];
  const pendingNativeSources: WorkflowDraftNativeDependencyRole[] = [];
  for (const step of input.plan.steps) {
    const decision = step.decision;
    if (
      decision.kind !== 'add-native-node' &&
      decision.kind !== 'revise-native-node'
    )
      continue;
    const nodeId =
      decision.kind === 'add-native-node' ? step.newNodeId : decision.nodeId;
    const capability =
      decision.kind === 'add-native-node'
        ? decision.capability
        : input.draft.nativeNodes.find((node) => node.id === decision.nodeId)!
            .capability;
    if (typeof nodeId !== 'string' || !nodeId.trim())
      throw new Error(
        `Draft native dependency step ${step.id} requires its original allocated node ID`,
      );
    const definition = input.context.capabilities.find(
      (entry) => entry.name === capability,
    );
    if (!definition)
      throw new Error(
        `Draft native dependency ${nodeId} requires registered capability ${capability}`,
      );
    const role = {
      nodeId,
      stepId: step.id,
      capability,
      description: definition.description,
      instruction: decision.instruction,
      parameterReferenceSources:
        requireNativeParameterReferenceSources(definition),
    };
    if (decision.kind === 'add-native-node') roles.push(role);
    else pendingNativeSources.push(role);
  }
  const candidates: NativeParameterProducerCandidate[] = [
    ...stage.apiResponseSources.map(
      (source) =>
        ({
          nodeId: source.nodeId,
          referenceSources: ['response'] as const,
        }) satisfies NativeParameterProducerCandidate,
    ),
    ...sources.values.map(
      (source) =>
        ({
          nodeId: source.nodeId,
          referenceSources: [
            source.kind === 'api' ? 'response' : 'node-output',
          ],
        }) satisfies NativeParameterProducerCandidate,
    ),
    ...sources.exclusiveOutputs.map(
      (source) =>
        ({
          nodeId: source.nodeId,
          referenceSources: ['exclusive-output'] as const,
        }) satisfies NativeParameterProducerCandidate,
    ),
    ...[...pendingNativeSources, ...roles].map((role) =>
      describePendingNativeProducer(
        role.nodeId,
        input.context.capabilities.find(
          (entry) => entry.name === role.capability,
        )!,
      ),
    ),
  ];
  const messages = resolveWorkflowPlanningMessages(input.context);
  return structuredClone({
    plan: input.plan,
    sources,
    roles,
    pendingNativeSources,
    sourceCandidatesByNodeId: Object.fromEntries(
      roles.map((role) => [
        role.nodeId,
        selectNativeParameterProducers({
          nodeId: role.nodeId,
          capability: input.context.capabilities.find(
            (entry) => entry.name === role.capability,
          )!,
          producers: candidates,
        }),
      ]),
    ),
    messages: messages.filter((message) =>
      input.requestMessageIds.includes(message.id),
    ),
    backgroundMessages: messages.filter(
      (message) => !input.requestMessageIds.includes(message.id),
    ),
    includeExplanations: input.plan.options.includeExplanations,
  });
}

export function resolveWorkflowDraftNativeDependencies(
  input: ResolveWorkflowDraftNativeDependenciesInput,
): WorkflowDraftNativeDependencies {
  const context = describeWorkflowDraftNativeDependencies(input);
  const proposal = createWorkflowDraftNativeDependenciesSchema(input).parse(
    input.proposal,
  );
  if (!jsonValuesEqual(proposal, input.proposal))
    throw new Error(
      'Draft native producer choices cannot be coerced, defaulted or transformed',
    );
  validateNativeProducerDependencyGraph(
    context.roles.map((role) => role.nodeId),
    proposal,
  );
  const fields = { context, proposal };
  return {
    id:
      'draft-native-dependencies:' +
      createHash('sha256').update(JSON.stringify(fields)).digest('hex'),
    ...structuredClone(fields),
  };
}

export function validateWorkflowDraftNativeDependencies(
  input: ValidateWorkflowDraftNativeDependenciesInput,
): WorkflowDraftNativeDependencies {
  if (!input.producerDependencies?.proposal)
    throw new Error(
      'Draft native dependencies require their original proposal',
    );
  const expected = resolveWorkflowDraftNativeDependencies({
    ...input,
    proposal: input.producerDependencies.proposal,
  });
  if (!jsonValuesEqual(expected, input.producerDependencies))
    throw new Error(
      'Draft native dependency choices are stale or their original plan/source contracts changed',
    );
  return expected;
}

/** Revalidate actual completed additions before final connection planning/adoption, not just the model wrapper. */
export function validateWorkflowDraftNativeDependencyResolutions(
  input: ValidateWorkflowDraftNativeDependencyResolutionsInput,
): void {
  const dependencies = validateWorkflowDraftNativeDependencies(input);
  const stage = stageWorkflowDraftEdit(input);
  for (const role of dependencies.context.roles) {
    if (stage.pendingResolutionStepIds.includes(role.stepId))
      throw new Error(
        `Draft native dependency ${role.nodeId} has no completed addition resolution`,
      );
    const node = stage.content.nativeNodes.find(
      (entry) => entry.id === role.nodeId,
    );
    if (!node)
      throw new Error(
        `Draft native dependency ${role.nodeId} has no actual staged node`,
      );
    const ids =
      dependencies.proposal.sourcesByNodeId[role.nodeId].sourceNodeIds;
    const available = describeWorkflowDraftReferenceSources({
      stage,
      context: input.context,
      excludedNodeIds: [role.nodeId],
    });
    const sources = {
      values: available.values.filter((source) => ids.includes(source.nodeId)),
      exclusiveOutputs: available.exclusiveOutputs.filter((source) =>
        ids.includes(source.nodeId),
      ),
    };
    const capability = bindNativeMaterialContracts(
      input.context.capabilities.find(
        (entry) => entry.name === role.capability,
      )!,
      nativeMaterialSourcesFromDraftReferences(sources),
    );
    validateNativeNodeProducerReferences(node, capability, ids);
  }
}
