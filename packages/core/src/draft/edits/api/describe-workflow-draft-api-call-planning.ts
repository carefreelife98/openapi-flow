import { createHash } from 'node:crypto';
import { resolveWorkflowPlanningMessages } from '../../../planning/evidence/resolve-workflow-planning-messages.js';
import type {
  WorkflowDraftApiCallPlanningInput,
  WorkflowDraftApiCallPlanningDescription,
} from '../../../types/workflow-draft-api-call-planning.js';
import type { JsonObject } from '../../../types/openapi.js';
import { stageWorkflowDraftEdit } from '../stage-workflow-draft-edit.js';
import { apiOperationKeyEquals } from '../../../openapi/catalog/api-operation-key-equals.js';
import { listApiRequestMediaTypes } from '../../../arguments/media/list-api-request-media-types.js';
import { createApiRequestSchema } from '../../../schemas/create-api-request-schema.js';
import { describeWorkflowDraftReferenceSources } from '../references/describe-workflow-draft-reference-sources.js';
import { listApiRequestInputRoots } from '../../../arguments/list-api-request-input-roots.js';

/** Selected original OAS only. An unresolved replacement never advertises its previous output. */
export function describeWorkflowDraftApiCallPlanning(
  input: WorkflowDraftApiCallPlanningInput,
): WorkflowDraftApiCallPlanningDescription {
  const stage = stageWorkflowDraftEdit(input);
  const step = input.plan.steps.find((step) => step.id === input.stepId);
  if (
    !step ||
    (step.decision.kind !== 'add-api-call' &&
      step.decision.kind !== 'replace-api-operation')
  )
    throw new Error(
      'API call planning stepId must identify an add-api-call or replace-api-operation decision',
    );
  if (!stage.pendingResolutionStepIds.includes(step.id))
    throw new Error(
      'API call planning already has an explicit result; remove it before replanning',
    );
  const nodeId =
    step.decision.kind === 'add-api-call'
      ? step.newNodeId
      : step.decision.nodeId;
  if (typeof nodeId !== 'string' || !nodeId.trim())
    throw new Error(
      'API call planning requires its code-allocated or existing instance identity',
    );
  if (
    stage.content.requirements.some(
      (item) =>
        item.state !== 'confirmed' &&
        (item.scope.kind === 'workflow' || item.scope.nodeIds.includes(nodeId)),
    )
  )
    throw new Error(
      `API call planning ${nodeId} is blocked by an unresolved requirement`,
    );
  const selectedOperation = step.decision.operation;
  const matches = input.context.operations.filter((operation) =>
    apiOperationKeyEquals(operation.key, selectedOperation),
  );
  if (matches.length !== 1)
    throw new Error(
      `API call planning ${nodeId} requires exactly one selected original OAS contract and snapshot`,
    );
  const operation = structuredClone(matches[0]);
  const mediaTypes = listApiRequestMediaTypes(operation);
  const requestMediaType =
    input.requestMediaType === undefined && mediaTypes.length === 1
      ? mediaTypes[0]
      : input.requestMediaType;
  // The existing OAS boundary rejects absent multi-media choices and unsupported supplied media.
  const requestSchema = createApiRequestSchema({ operation, requestMediaType });
  const sources = describeWorkflowDraftReferenceSources({
    stage,
    context: input.context,
    excludedNodeIds: [nodeId],
  });
  const previousCall =
    step.decision.kind === 'replace-api-operation'
      ? structuredClone(
          input.draft.apiCalls.find((call) => call.id === nodeId)!,
        )
      : undefined;
  const fields = {
    stage,
    kind: step.decision.kind,
    nodeId,
    operation,
    ...(previousCall === undefined ? {} : { previousCall }),
    instruction: step.decision.instruction,
    ...(requestMediaType === undefined ? {} : { requestMediaType }),
    requestSchema,
    requestInputRoots: listApiRequestInputRoots(requestSchema),
    hasRequestInputs:
      Object.keys(requestSchema.properties as JsonObject).length > 0,
    hasOtherSelectedNodes: [
      ...stage.content.apiCalls.map((call) => call.id),
      ...stage.content.nativeNodes.map((node) => node.id),
      ...input.plan.steps.flatMap((selected) =>
        selected.newNodeId === undefined ? [] : [selected.newNodeId],
      ),
    ].some((id) => id !== nodeId),
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
    includeExplanations: input.plan.options.includeExplanations,
  };
  return {
    fingerprint: createHash('sha256')
      .update(JSON.stringify(fields))
      .digest('hex'),
    ...fields,
  };
}
