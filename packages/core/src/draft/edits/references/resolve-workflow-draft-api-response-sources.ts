import type {
  ResolveWorkflowDraftApiResponseSourcesInput,
  WorkflowDraftApiResponseSource,
} from '../../../types/workflow-draft-api-response-sources.js';
import { apiOperationKeyEquals } from '../../../openapi/catalog/api-operation-key-equals.js';
import { resolveWorkflowDraftApiMaterials } from '../../resolve-workflow-draft-api-materials.js';

/** Selection establishes response declarations; only an explicit resolution establishes request data. */
export function resolveWorkflowDraftApiResponseSources(
  input: ResolveWorkflowDraftApiResponseSourcesInput,
): WorkflowDraftApiResponseSource[] {
  const sources = new Map<string, WorkflowDraftApiResponseSource>();
  for (const material of resolveWorkflowDraftApiMaterials(input)) {
    const request = input.content.apiCalls.find(
      (call) => call.id === material.callId,
    )!;
    sources.set(material.callId, {
      nodeId: material.callId,
      operation: structuredClone(material.operation),
      preparation: {
        status: 'request-planned',
        request: structuredClone(request),
      },
    });
  }
  for (const step of input.plan.steps) {
    if (!input.pendingResolutionStepIds.includes(step.id)) continue;
    const decision = step.decision;
    if (
      decision.kind !== 'add-api-call' &&
      decision.kind !== 'replace-api-operation'
    )
      continue;
    const nodeId =
      decision.kind === 'add-api-call' ? step.newNodeId : decision.nodeId;
    if (typeof nodeId !== 'string' || !nodeId.trim())
      throw new Error(
        `Selected API response source ${step.id} requires its actual instance identity`,
      );
    const matches = input.context.operations.filter((operation) =>
      apiOperationKeyEquals(operation.key, decision.operation),
    );
    if (matches.length !== 1)
      throw new Error(
        `Selected API response source ${nodeId} requires exactly one original OAS contract and snapshot`,
      );
    sources.set(nodeId, {
      nodeId,
      operation: structuredClone(matches[0]),
      preparation: {
        status: 'request-pending',
        stepId: step.id,
        kind: decision.kind,
        instruction: decision.instruction,
      },
    });
  }
  return [...sources.values()];
}
