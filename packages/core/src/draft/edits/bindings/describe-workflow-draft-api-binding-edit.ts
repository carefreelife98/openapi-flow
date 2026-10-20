import { createHash } from 'node:crypto';
import { resolveWorkflowPlanningMessages } from '../../../planning/evidence/resolve-workflow-planning-messages.js';
import type {
  WorkflowDraftApiBindingEditInput,
  WorkflowDraftApiBindingEditDescription,
  WorkflowDraftApiBindingEditSource,
} from '../../../types/workflow-draft-api-binding-edit.js';
import { stageWorkflowDraftEdit } from '../stage-workflow-draft-edit.js';
import { resolveWorkflowDraftApiMaterials } from '../../resolve-workflow-draft-api-materials.js';
import { describeWorkflowDraftReferenceSources } from '../references/describe-workflow-draft-reference-sources.js';
import { createApiRequestSchema } from '../../../schemas/create-api-request-schema.js';
import { workflowDraftApiBindingEditScopeSchema } from '../../../schemas/workflow-draft-api-binding-edit-scope-schema.js';

/** Describe actual staged sources, never old contracts for unresolved replacements. */
export function describeWorkflowDraftApiBindingEdit(
  input: WorkflowDraftApiBindingEditInput,
): WorkflowDraftApiBindingEditDescription {
  const scope = workflowDraftApiBindingEditScopeSchema.parse(input.scope);
  const stage = stageWorkflowDraftEdit(input);
  let nodeId: string;
  let instruction: string;
  let requiredTargetPointers: string[];
  if (scope.kind === 'step') {
    const step = input.plan.steps.find((step) => step.id === scope.stepId);
    if (!step || step.decision.kind !== 'revise-api-bindings')
      throw new Error(
        'Binding edit scope.stepId must identify a revise-api-bindings decision',
      );
    if (!stage.pendingResolutionStepIds.includes(step.id))
      throw new Error(
        'Binding edit step already has a supplied result; remove that result explicitly before replanning',
      );
    nodeId = step.decision.nodeId;
    instruction = step.decision.instruction;
    requiredTargetPointers = [];
  } else {
    const task = stage.pendingRepairs.find((task) => task.id === scope.taskId);
    if (!task || task.kind !== 'api-bindings')
      throw new Error(
        'Binding edit scope.taskId must identify a current API binding repair',
      );
    nodeId = task.nodeId;
    requiredTargetPointers = [...task.targetPointers];
    if (!requiredTargetPointers.length)
      throw new Error(
        'API binding repair must declare affected target pointers',
      );
    instruction = input.plan.steps
      .map((step) => step.decision.instruction)
      .join('\n');
  }
  if (stage.blockedSourceNodeIds.includes(nodeId))
    throw new Error(
      `Binding target ${nodeId} is blocked by an unresolved contract or requirement`,
    );
  const call = stage.content.apiCalls.find((call) => call.id === nodeId);
  if (!call)
    throw new Error(`Binding edit target ${nodeId} has no staged API instance`);
  const materials = resolveWorkflowDraftApiMaterials({
    content: stage.content,
    context: input.context,
  });
  const material = materials.find((material) => material.callId === nodeId)!;
  const requirementsFor = (id: string) =>
    structuredClone(
      stage.content.requirements.filter(
        (requirement) =>
          requirement.scope.kind === 'workflow' ||
          requirement.scope.nodeIds.includes(id),
      ),
    );
  const sources = describeWorkflowDraftReferenceSources({
    stage,
    context: input.context,
    excludedNodeIds: [nodeId],
  });
  const sourceCandidates: WorkflowDraftApiBindingEditSource[] =
    sources.values.map((source) =>
      source.kind === 'api'
        ? { ...source, requirements: requirementsFor(source.nodeId) }
        : {
            kind: 'native',
            nodeId: source.nodeId,
            schema: source.schema,
            requirements: requirementsFor(source.nodeId),
          },
    );
  if (
    new Set(sourceCandidates.map((source) => source.nodeId)).size !==
    sourceCandidates.length
  )
    throw new Error(
      'Binding edit source candidates must have distinct actual node IDs',
    );
  const fields = {
    stage,
    scope,
    instruction,
    call: structuredClone(call),
    operation: structuredClone(material.operation),
    requestSchema: createApiRequestSchema(material),
    sourceCandidates,
    requiredTargetPointers,
    messages: structuredClone(
      resolveWorkflowPlanningMessages(input.context).filter((message) =>
        input.requestMessageIds.includes(message.id),
      ),
    ),
    includeExplanations: input.plan.options.includeExplanations,
    backgroundMessages: structuredClone(
      resolveWorkflowPlanningMessages(input.context).filter(
        (message) => !input.requestMessageIds.includes(message.id),
      ),
    ),
  };
  return {
    fingerprint: createHash('sha256')
      .update(JSON.stringify(fields))
      .digest('hex'),
    ...fields,
  };
}
