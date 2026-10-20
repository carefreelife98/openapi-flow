import { resolveN8nNativePlanningFeatures } from '@openapi-flow/n8n';
import type {
  WorkflowDraftConversationDependencies,
  ResolvedWorkflowDraftConversationNativeFeatures,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationNativeFeatureOptionsSchema } from '../../schemas/workflow-draft-conversation-native-features-schema.js';

/** Freeze the registered implementation definitions before the first plan, not after producer selection. */
export function resolveDraftConversationNativeFeatures(
  dependencies: WorkflowDraftConversationDependencies,
): ResolvedWorkflowDraftConversationNativeFeatures {
  if (dependencies.nativeFeatures === undefined) return { dependencies };
  if (
    !dependencies.context ||
    !Array.isArray(dependencies.context.capabilities)
  )
    throw new Error(
      'Draft conversation nativeFeatures requires an explicit context.capabilities array for extensions',
    );
  const options = draftConversationNativeFeatureOptionsSchema.parse(
    dependencies.nativeFeatures,
  );
  const registry = resolveN8nNativePlanningFeatures({
    ...options,
    extensions: dependencies.context.capabilities,
    itemMode: dependencies.itemMode,
  });
  return {
    dependencies: {
      ...dependencies,
      context: {
        ...dependencies.context,
        capabilities: registry.planningCapabilities,
      },
    },
    inventory: registry.registrations.map((registration) => ({
      feature: registration.feature,
      status: registration.status,
      planningAvailable: registry.planningRegistrations.some(
        (entry) => entry.feature === registration.feature,
      ),
      missingContext:
        registration.status === 'ready'
          ? []
          : structuredClone(registration.missingContext),
    })),
  };
}
