import { createHash } from 'node:crypto';
import { retainRequestedApiInputsAfterEdits } from '../inputs/retain-requested-api-inputs-after-edits.js';
import type {
  PrepareWorkflowDraftEditInput,
  WorkflowDraftEditResolution,
} from '../../../types/workflow-draft-edit-assembly.js';
import type {
  PrimaryWorkflowDraftEdit,
  WorkflowDraftEditPreparationMode,
} from '../../../types/workflow-draft-edit-assembly-internal.js';
import type { WorkflowDraftChange } from '../../../types/workflow-draft-changes.js';
import type { WorkflowDraftContent } from '../../../types/workflow-draft.js';
import { workflowDraftEditResolutionSchema } from '../../../schemas/workflow-draft-edit-assembly-schema.js';
import { workflowDraftApiCallSchema } from '../../../schemas/workflow-draft-schema.js';
import { validateWorkflowDraftEditPlan } from '../validate-workflow-draft-edit-plan.js';
import { applyDraftChange } from '../../changes/apply-draft-change.js';
import { resolveWorkflowDraftApiMaterials } from '../../resolve-workflow-draft-api-materials.js';
import { applyWorkflowDraftApiInputEdits } from '../values/apply-workflow-draft-api-input-edits.js';
import { applyWorkflowDraftBindingEdits } from '../values/apply-workflow-draft-binding-edits.js';
import { applyWorkflowDraftNativeParameterChanges } from '../native/apply-workflow-draft-native-parameter-changes.js';
import { projectWorkflowDraftClarificationRequirements } from '../../requirements/project-workflow-draft-clarification-requirements.js';
import { createWorkflowDraftEditCandidateContext } from '../../requirements/create-workflow-draft-edit-candidate-context.js';
import { listRemovedWorkflowDraftRequirements } from '../../requirements/history/list-removed-workflow-draft-requirements.js';
import { createWorkflowDraftCapabilityGap } from '../../gaps/create-workflow-draft-capability-gap.js';
import { deriveWorkflowDraftNodeRemovalConnections } from '../connections/derive-workflow-draft-node-removal-connections.js';

/** Primary data only; retained edges/references may still need explicitly supplied repairs. */
export function preparePrimaryWorkflowDraftEdit(
  input: PrepareWorkflowDraftEditInput,
  mode: WorkflowDraftEditPreparationMode,
): PrimaryWorkflowDraftEdit {
  validateWorkflowDraftEditPlan(input);
  createWorkflowDraftEditCandidateContext(input);
  const resolutions = workflowDraftEditResolutionSchema
    .array()
    .parse(input.resolutions);
  const byStep = new Map<string, WorkflowDraftEditResolution>();
  for (const resolution of resolutions) {
    if (
      !input.plan.steps.some((step) => step.id === resolution.stepId) ||
      byStep.has(resolution.stepId)
    )
      throw new Error(
        `Draft edit resolutions require distinct known stepId: ${resolution.stepId}`,
      );
    byStep.set(resolution.stepId, resolution);
  }
  const content: WorkflowDraftContent = structuredClone({
    id: input.draft.id,
    apiCalls: input.draft.apiCalls,
    nativeNodes: input.draft.nativeNodes,
    ...(input.draft.gapNodes === undefined
      ? {}
      : { gapNodes: input.draft.gapNodes }),
    requirements: input.draft.requirements,
    edges: input.draft.edges,
  });
  const changes: WorkflowDraftChange[] = [];
  const deferredRequirementIds: string[] = [];
  const pendingResolutionStepIds: string[] = [];
  function add(change: WorkflowDraftChange): void {
    applyDraftChange(content, change);
    changes.push(change);
  }
  function requireResolution(stepId: string): WorkflowDraftEditResolution {
    const resolution = byStep.get(stepId);
    if (!resolution)
      throw new Error(`Missing draft edit resolution for ${stepId}`);
    byStep.delete(stepId);
    return resolution;
  }
  const nodeRemovalConnections =
    deriveWorkflowDraftNodeRemovalConnections(input);
  for (const connection of nodeRemovalConnections)
    add({ kind: connection.kind, edge: connection.edge });
  for (const requirement of projectWorkflowDraftClarificationRequirements(
    input,
  )) {
    if (content.requirements.some((existing) => existing.id === requirement.id))
      throw new Error(
        `Clarification requirement ${requirement.id} already exists; use an explicit requirements revision`,
      );
    add({ kind: 'set-requirement', requirement });
    if (requirement.state !== 'confirmed')
      deferredRequirementIds.push(requirement.id);
  }
  // Node replacement establishes the actual contract before any partial edits.
  const replacements = input.plan.steps.filter((step) =>
    ['add-api-call', 'replace-api-operation', 'add-native-node'].includes(
      step.decision.kind,
    ),
  );
  const details = input.plan.steps.filter(
    (step) => !replacements.includes(step),
  );
  for (const step of [...replacements, ...details]) {
    const decision = step.decision;
    if (decision.kind === 'report-capability-gap') {
      if (step.newNodeId === undefined)
        throw new Error(
          `Capability gap ${step.id} requires its allocated node identity`,
        );
      add({
        kind: 'add-capability-gap',
        node: createWorkflowDraftCapabilityGap({
          id: step.newNodeId,
          requestedBehavior: decision.instruction,
          finding: decision.finding,
          sourceMessageIds: [
            ...new Set(decision.sources.map((source) => source.messageId)),
          ],
          context: input.context,
        }),
      });
      continue;
    }
    if (decision.kind === 'needs-clarification') {
      if (decision.owner.kind === 'planning-step') continue;
      const id =
        'edit-decision:' + createHash('sha256').update(step.id).digest('hex');
      if (content.requirements.some((requirement) => requirement.id === id))
        throw new Error(
          `Draft edit deferred requirement identity conflict: ${id}`,
        );
      add({
        kind: 'set-requirement',
        requirement: {
          id,
          text: decision.instruction,
          state: 'needs-clarification',
          scope: structuredClone(decision.owner.scope),
          sourceMessageIds: [
            ...new Set(decision.sources.map((source) => source.messageId)),
          ],
        },
      });
      deferredRequirementIds.push(id);
      continue;
    }
    if (decision.kind === 'remove-node') {
      add({ kind: 'remove-node', nodeId: decision.nodeId });
      continue;
    }
    if (decision.kind === 'remove-requirement') {
      add({
        kind: 'remove-requirement',
        requirementId: decision.requirementId,
        sourceMessageIds: [
          ...new Set(decision.sources.map((source) => source.messageId)),
        ],
      });
      continue;
    }
    if (decision.kind === 'no-change' || decision.kind === 'revise-connections')
      continue;
    if (!byStep.has(step.id) && mode === 'staged') {
      pendingResolutionStepIds.push(step.id);
      continue;
    }
    if (
      'nodeId' in decision &&
      replacements.some(
        (replacement) =>
          replacement.decision.kind === 'replace-api-operation' &&
          replacement.decision.nodeId === decision.nodeId &&
          pendingResolutionStepIds.includes(replacement.id),
      )
    )
      throw new Error(
        `Draft edit ${step.id} needs its pending operation replacement before detail results`,
      );
    const resolution = requireResolution(step.id);
    const wrongKind = () =>
      new Error(
        `Draft edit resolution ${step.id} (${resolution.kind}) does not implement ${decision.kind}`,
      );
    if (
      decision.kind === 'add-api-call' ||
      decision.kind === 'replace-api-operation'
    ) {
      if (resolution.kind !== 'api-call') throw wrongKind();
      const id =
        decision.kind === 'add-api-call' ? step.newNodeId : decision.nodeId;
      if (id === undefined)
        throw new Error(
          `Draft edit ${step.id} is missing its allocated instance identity`,
        );
      add({
        kind:
          decision.kind === 'add-api-call' ? 'add-api-call' : 'update-api-call',
        call: workflowDraftApiCallSchema.parse({
          id,
          operation: decision.operation,
          values: resolution.values,
          bindings: resolution.bindings,
          ...(resolution.requestedInputs === undefined
            ? {}
            : { requestedInputs: resolution.requestedInputs }),
          ...(resolution.requestMediaType === undefined
            ? {}
            : { requestMediaType: resolution.requestMediaType }),
        }),
      });
    } else if (
      decision.kind === 'add-native-node' ||
      decision.kind === 'revise-native-node'
    ) {
      const id =
        decision.kind === 'add-native-node' ? step.newNodeId : decision.nodeId;
      if (id === undefined)
        throw new Error(
          `Draft edit ${step.id} is missing its allocated instance identity`,
        );
      const previous = content.nativeNodes.find((node) => node.id === id);
      const capability =
        decision.kind === 'add-native-node'
          ? decision.capability
          : previous!.capability;
      if (resolution.kind === 'native-runtime')
        add({
          kind:
            decision.kind === 'add-native-node'
              ? 'add-native-node'
              : 'update-native-node',
          node: { id, capability, parameters: {}, runtimeParameters: true },
        });
      else if (
        decision.kind === 'add-native-node' &&
        (resolution.kind === 'native-literal' ||
          resolution.kind === 'native-mixed')
      )
        add({
          kind: 'add-native-node',
          node: {
            id,
            capability,
            parameters: resolution.parameters,
            ...(resolution.kind === 'native-mixed'
              ? { runtimeParameters: resolution.runtimeParameters }
              : {}),
          },
        });
      else if (
        decision.kind === 'revise-native-node' &&
        resolution.kind === 'native-parameters'
      )
        add({
          kind: 'update-native-node',
          node: applyWorkflowDraftNativeParameterChanges({
            node: previous!,
            capability: input.context.capabilities.find(
              (entry) => entry.name === capability,
            )!,
            edits: resolution.edits,
            source: `Draft native ${id}`,
          }),
        });
      else throw wrongKind();
    } else if (
      decision.kind === 'revise-api-inputs' ||
      decision.kind === 'revise-api-bindings'
    ) {
      const call = content.apiCalls.find(
        (call) => call.id === decision.nodeId,
      )!;
      const material = resolveWorkflowDraftApiMaterials({
        content,
        context: input.context,
      }).find((material) => material.callId === call.id)!;
      if (
        decision.kind === 'revise-api-inputs' &&
        resolution.kind === 'api-inputs'
      )
        add({
          kind: 'update-api-call',
          call: {
            ...call,
            ...(call.requestedInputs === undefined
              ? {}
              : {
                  requestedInputs: retainRequestedApiInputsAfterEdits(
                    call.requestedInputs,
                    resolution.edits,
                  ),
                }),
            values: applyWorkflowDraftApiInputEdits(
              call.values,
              resolution.edits,
              {
                ...material,
                ...(resolution.requestMediaType === undefined
                  ? {}
                  : { requestMediaType: resolution.requestMediaType }),
              },
            ),
            ...(resolution.requestMediaType === undefined
              ? {}
              : { requestMediaType: resolution.requestMediaType }),
          },
        });
      else if (
        decision.kind === 'revise-api-bindings' &&
        resolution.kind === 'api-bindings'
      )
        add({
          kind: 'update-api-call',
          call: {
            ...call,
            values: applyWorkflowDraftApiInputEdits(
              call.values,
              resolution.valueEdits,
              material,
            ),
            bindings: applyWorkflowDraftBindingEdits(
              call.bindings,
              resolution.edits,
              `Draft API ${call.id}`,
            ),
          },
        });
      else throw wrongKind();
    } else if (
      decision.kind === 'revise-requirement' ||
      decision.kind === 'restore-requirement'
    ) {
      if (resolution.kind !== 'requirement') throw wrongKind();
      const reference =
        decision.kind === 'restore-requirement'
          ? listRemovedWorkflowDraftRequirements(input.draft)
          : content.requirements;
      const previous = reference.find(
        (requirement) => requirement.id === decision.requirementId,
      )!;
      add({
        kind: 'set-requirement',
        requirement: {
          id: previous.id,
          ...(previous.origin === undefined ? {} : { origin: previous.origin }),
          text: resolution.text,
          state: resolution.state,
          scope: resolution.scope,
          sourceMessageIds: [
            ...new Set([
              ...decision.sources.map((source) => source.messageId),
              resolution.answerMessageId,
            ]),
          ],
        },
      });
    }
  }
  if (byStep.size)
    throw new Error(
      `Unexpected resolution for deterministic draft edit step: ${[...byStep.keys()].join(', ')}`,
    );
  return {
    kind: 'unvalidated-edit-materials',
    planId: input.plan.id,
    baseRevision: input.plan.baseRevision,
    content,
    nodeRemovalConnections,
    changes,
    pendingRepairs: [],
    deferredRequirementIds,
    pendingResolutionStepIds,
    pendingClarificationQuestionIds:
      input.context.clarification === undefined
        ? []
        : [
            ...input.context.clarification.resolution.pendingQuestionIds,
            ...input.context.clarification.resolution.deferredQuestionIds,
          ],
  };
}
