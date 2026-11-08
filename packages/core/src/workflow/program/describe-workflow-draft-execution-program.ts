import type {
  WorkflowDraftExecutionProgramInput,
  WorkflowExecutionProgramSource,
} from '../../types/workflow-execution-program.js';
import { describeWorkflowDraftConnectionEdit } from '../../draft/edits/connections/describe-workflow-draft-connection-edit.js';
import { resolveWorkflowDraftApiMaterials } from '../../draft/resolve-workflow-draft-api-materials.js';
import { resolveWorkflowDraftNativeSnapshot } from '../../draft/resolve-workflow-draft-native-snapshot.js';
import { createWorkflowDraftEditCandidateContext } from '../../draft/requirements/create-workflow-draft-edit-candidate-context.js';
import { resolveWorkflowPlanningMessages } from '../../planning/evidence/resolve-workflow-planning-messages.js';
import { collectDeferredApiInputSlots } from '../../inputs/collect-deferred-api-input-slots.js';
import { describeWorkflowExecutionProgram } from './describe-workflow-execution-program.js';
/** Rebuild the program's edit source from the actual versioned edit, never host-authored replacement materials. */
export function describeWorkflowDraftExecutionProgram(
  input: WorkflowDraftExecutionProgramInput,
): WorkflowExecutionProgramSource {
  const described = describeWorkflowDraftConnectionEdit(input);
  if (
    described.status === 'waiting-for-materials' ||
    described.stage.pendingResolutionStepIds.length ||
    described.stage.pendingRepairs.length ||
    described.stage.blockedSourceNodeIds.length ||
    described.stage.pendingClarificationQuestionIds.length ||
    described.stage.deferredRequirementIds.length ||
    described.stage.content.gapNodes?.length
  )
    throw new Error(
      'Draft execution program requires a material-ready edit without unresolved requirements or capabilities',
    );
  const context = createWorkflowDraftEditCandidateContext(input);
  const messages = resolveWorkflowPlanningMessages(context);
  const materials = resolveWorkflowDraftApiMaterials({
    content: described.stage.content,
    context,
  });
  const slots = collectDeferredApiInputSlots({ materials });
  const snapshot = resolveWorkflowDraftNativeSnapshot({
    content: described.stage.content,
    context,
    deferredNodeIds: [],
    unavailableApiNodeIds: [],
  });
  if (snapshot.status !== 'ready')
    throw new Error('Draft execution program requires ready native contracts');
  const requirements = described.stage.content.requirements.map(
    (requirement) => ({
      id: requirement.id,
      text: requirement.text,
      sources: requirement.sourceMessageIds.map((messageId) => {
        const message = context.messages.find(
          (message) => message.id === messageId,
        );
        if (message === undefined)
          throw new Error(
            'Draft program requirement references a missing message: ' +
              messageId,
          );
        return { kind: 'message' as const, messageId, quote: message.text };
      }),
    }),
  );
  for (const message of messages.filter((message) =>
    input.requestMessageIds.includes(message.id),
  ))
    if (!requirements.some((requirement) => requirement.id === message.id))
      requirements.push({
        id: message.id,
        text: message.text,
        sources: [
          { kind: 'message', messageId: message.id, quote: message.text },
        ],
      });
  const controlNames = new Set(
    input.controls?.capabilities.map((capability) => capability.name),
  );
  const source: WorkflowExecutionProgramSource = {
    scenario: messages.map((message) => message.text).join('\n'),
    entrypoint: context.entrypoint,
    requirements,
    literalSourceMessages: context.messages,
    materials: materials.map((material) => ({
      status: 'ready',
      operation: material.operation,
      arguments: {
        callId: material.callId,
        values: material.values,
        bindings: material.bindings,
        unresolvedInputs: slots
          .filter((slot) => slot.callId === material.callId)
          .map((slot) => slot.targetPointer),
        ...(material.requestMediaType === undefined
          ? {}
          : { requestMediaType: material.requestMediaType }),
        ...(material.requestedInputs === undefined
          ? {}
          : { requestedInputs: material.requestedInputs }),
      },
    })),
    nativeNodes: described.stage.content.nativeNodes,
    capabilities: snapshot.capabilities.filter(
      (capability) => !controlNames.has(capability.name),
    ),
    gaps: [],
    edges:
      described.status === 'ready'
        ? described.existingEdges
            .filter((edge) => !edge.editable)
            .map((edge) => edge.edge)
        : described.stage.content.edges,
    deferredApiInputIds: slots.map((slot) => slot.id),
    limits: input.limits,
    ...(input.controls === undefined ? {} : { controls: input.controls }),
  };
  describeWorkflowExecutionProgram(source);
  return source;
}
