import type { ResolveWorkflowDraftNativeSnapshotInput } from '../types/workflow-draft-native-materials.js';
import type { NativeMaterialSnapshot } from '../types/native-material-snapshot.js';
import { resolveWorkflowDraftApiMaterials } from './resolve-workflow-draft-api-materials.js';
import { resolveNativeMaterialSnapshot } from '../workflow/resolve-native-material-snapshot.js';

export function resolveWorkflowDraftNativeSnapshot(
  input: ResolveWorkflowDraftNativeSnapshotInput,
): NativeMaterialSnapshot {
  const materials = resolveWorkflowDraftApiMaterials({
    content: input.content,
    context: input.context,
  });
  return resolveNativeMaterialSnapshot({
    apiMaterials: materials.filter(
      (material) => !input.unavailableApiNodeIds.includes(material.callId),
    ),
    nativeOutputs: [],
    nativeNodes: input.content.nativeNodes,
    capabilities: input.context.capabilities,
    deferredNodeIds: input.deferredNodeIds,
    ...(input.shouldDeferNode === undefined
      ? {}
      : { shouldDeferNode: input.shouldDeferNode }),
  });
}
