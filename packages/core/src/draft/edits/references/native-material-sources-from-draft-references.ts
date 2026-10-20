import type { WorkflowDraftReferenceSources } from '../../../types/workflow-draft-reference-sources.js';
import type { WorkflowNativeMaterialSources } from '../../../types/native-material-snapshot.js';

export function nativeMaterialSourcesFromDraftReferences(
  sources: WorkflowDraftReferenceSources,
): WorkflowNativeMaterialSources {
  return {
    apiMaterials: sources.values.flatMap((source) =>
      source.kind === 'api'
        ? [
            {
              callId: source.nodeId,
              operation: source.operation,
            },
          ]
        : [],
    ),
    nativeOutputs: sources.values.flatMap((source) =>
      source.kind === 'native'
        ? [{ nodeId: source.nodeId, schema: source.schema }]
        : [],
    ),
  };
}
