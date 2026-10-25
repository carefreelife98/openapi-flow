import { connectionRequirementFactsSchema } from '../../../schemas/workflow-connection-session-schema.js';
import type {
  WorkflowConnectionSessionSource,
  WorkflowConnectionSessionDescription,
} from '../../../types/workflow-connection-session.js';
import { describeWorkflowConnectionPlanning } from '../describe-workflow-connection-planning.js';
import {
  connectionValueFingerprint,
  workflowConnectionEdgeId,
} from './connection-graph-identity.js';

export function describeConnectionSessionSource(
  input: WorkflowConnectionSessionSource,
): WorkflowConnectionSessionDescription {
  const requirements = connectionRequirementFactsSchema.parse(
    input.requirements,
  );
  if (new Set(requirements.map((item) => item.id)).size !== requirements.length)
    throw new Error('connection requirements require distinct IDs');
  const source = describeWorkflowConnectionPlanning(input);
  const originalIds = new Set(source.input.edges.map(workflowConnectionEdgeId));
  const editable = input.editableEdgeIds;
  if (
    editable !== undefined &&
    (!Array.isArray(editable) ||
      new Set(editable).size !== editable.length ||
      editable.some((id) => !originalIds.has(id)))
  )
    throw new Error(
      'editableEdgeIds must name distinct original connection edges',
    );
  return {
    source,
    apiOperations: source.input.materials.map((material) => {
      const { operation, purpose } = material;
      return structuredClone({
        nodeId:
          material.status === 'ready'
            ? material.arguments.callId
            : material.callId,
        key: operation.key,
        method: operation.method,
        path: operation.path,
        ...(purpose === undefined ? {} : { purpose }),
        ...(operation.operation.operationId === undefined
          ? {}
          : { operationId: operation.operation.operationId }),
        ...(operation.operation.summary === undefined
          ? {}
          : { summary: operation.operation.summary }),
        ...(operation.operation.description === undefined
          ? {}
          : { description: operation.operation.description }),
        ...(operation.operation.tags === undefined
          ? {}
          : { tags: operation.operation.tags }),
      });
    }),
    fingerprint: connectionValueFingerprint({
      context: source.context,
      sources: source.sources,
      requirements,
      editableEdgeIds: editable,
    }),
  };
}
