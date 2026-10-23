import type { WorkflowDraftReferenceSource } from '@openapi-flow/core';
import type { WorkflowDraftNativeEditSourceCandidate } from '../types/workflow-draft-native-parameter-edit.js';

/** Target and value stages share the same actual source identities and response contracts. */
export function describeNativeParameterEditSourceCandidates(
  sources: WorkflowDraftReferenceSource[],
): WorkflowDraftNativeEditSourceCandidate[] {
  return sources.map((source) =>
    source.kind === 'native'
      ? source
      : {
          kind: source.kind,
          nodeId: source.nodeId,
          preparation: source.preparation,
          operation: {
            method: source.operation.method,
            path: source.operation.path,
            ...(source.operation.operation.summary === undefined
              ? {}
              : { summary: source.operation.operation.summary }),
            ...(source.operation.operation.description === undefined
              ? {}
              : { description: source.operation.operation.description }),
            ...(source.operation.operation.responses === undefined
              ? {}
              : { responses: source.operation.operation.responses }),
          },
          responsePointerCatalog: source.responsePointerCatalog,
        },
  );
}
