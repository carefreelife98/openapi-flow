import type {
  WorkflowDraftInput,
  WorkflowDraftMaterials,
} from '../types/workflow-draft.js';
import { resolveWorkflowDraftApiMaterials } from './resolve-workflow-draft-api-materials.js';
import { collectDeferredApiInputSlots } from '../inputs/collect-deferred-api-input-slots.js';
import { collectNativeRuntimeInputSlots } from '../inputs/native/collect-native-runtime-input-slots.js';
import { resolveWorkflowDraftNativeSnapshot } from './resolve-workflow-draft-native-snapshot.js';
import { NativeMaterialResolutionError } from '../workflow/native-material-resolution-error.js';

export function resolveWorkflowDraftMaterials(
  input: WorkflowDraftInput,
): WorkflowDraftMaterials {
  if (!input.context || !Array.isArray(input.context.operations))
    throw new Error('draft context.operations must be an array');
  const materials = resolveWorkflowDraftApiMaterials({
    content: input.draft,
    context: input.context,
  });
  const snapshot = resolveWorkflowDraftNativeSnapshot({
    content: input.draft,
    context: input.context,
    deferredNodeIds: [],
    unavailableApiNodeIds: [],
  });
  if (snapshot.status !== 'ready')
    throw new NativeMaterialResolutionError(snapshot.pending);
  return {
    materials,
    slots: collectDeferredApiInputSlots({ materials }),
    nativeSlots: collectNativeRuntimeInputSlots({
      nativeNodes: input.draft.nativeNodes,
      capabilities: snapshot.capabilities,
    }),
  };
}
