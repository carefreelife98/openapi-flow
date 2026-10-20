export { compileInboundWorkflow } from './legacy/workflow/inbound/compile-inbound-workflow.js';
export type * from './types/legacy/inbound-workflow.js';
export { createHttpRequestNode } from './nodes/request/create-http-request-node.js';
export { assembleN8nWorkflow } from './workflow/assemble-n8n-workflow.js';
export type * from './types/node-fragment.js';
export type * from './types/request-deployment.js';
export { httpRequestDeploymentOptionsSchema } from './schemas/request-deployment-schema.js';
export type * from './types/workflow-compilation.js';
export { compileReviewableN8nWorkflow } from './workflow/compile-reviewable-n8n-workflow.js';
export type * from './types/reviewable-workflow.js';
export { createN8nNativeCapabilities } from './nodes/native/create-native-capabilities.js';
export { resolveN8nNativeFeatures } from './nodes/native/registry/resolve-n8n-native-features.js';
export { resolveN8nNativePlanningFeatures } from './nodes/native/registry/resolve-n8n-native-planning-features.js';
export { N8nNativeFeature } from './types/native-feature-registry.js';
export type {
  N8nNativeFeatureContext,
  ResolveN8nNativeFeaturesInput,
  ReadyN8nNativeFeature,
  PendingN8nNativeFeature,
  N8nNativeFeatureRegistration,
  N8nNativeFeatureRegistry,
  N8nNativePlanningFeatureRegistry,
  N8nNativeFeaturePlanningDefinition,
  N8nNativeArrayContextRequirement,
  N8nNativeJsonOutputContextRequirement,
  N8nNativeFeatureContextRequirement,
} from './types/native-feature-registry.js';
export { createJsonOutputCapability } from './nodes/native/create-json-output-capability.js';
export { createPassThroughCapability } from './nodes/native/create-pass-through-capability.js';
export { createExclusiveBranchMergeCapability } from './nodes/native/create-exclusive-branch-merge-capability.js';
export { createN8nNativeOutputSources } from './workflow/create-n8n-native-output-sources.js';
export type * from './types/output-binding-source.js';
export { compilePlannedN8nWorkflow } from './workflow/compile-planned-n8n-workflow.js';
export { n8nNativeInputConfigurationSchema } from './schemas/native-runtime-input-schema.js';
export { compileN8nWorkflowTemplate } from './workflow/templates/compile-n8n-workflow-template.js';
export type {
  CompileN8nWorkflowTemplateInput,
  N8nTemplateContext,
  N8nTemplateDeployment,
  N8nTemplateInputSlot,
  N8nTemplateNodeMapping,
  N8nTemplateDeploymentRequirement,
  N8nWorkflowTemplateResult,
} from './types/workflow-template.js';
export type * from './types/native-capability.js';
export type {
  N8nNativeRuntimeInput,
  PrependNativeParameterGuardInput,
  N8nNativeInputConfiguration,
  N8nNativeInputSlot,
  N8nNativeInputTemplate,
} from './types/native-runtime-parameters.js';
export { prependNativeParameterGuard } from './nodes/native/inputs/prepend-native-parameter-guard.js';
export { resolveHttpRequestAuthentication } from './nodes/request/authentication/resolve-http-request-authentication.js';
export type * from './types/authentication.js';
export { createResponseArrayCapability } from './nodes/native/create-response-array-capability.js';
export type * from './types/array-iteration.js';
export { createNativeArrayCapability } from './nodes/native/arrays/create-native-array-capability.js';
export type * from './types/native-array.js';
export { createResponseCollectionCapability } from './nodes/native/create-response-collection-capability.js';
export type * from './types/response-collection.js';
export { createItemJoinCapability } from './nodes/native/item-join/create-item-join-capability.js';
export type * from './types/item-join.js';
export { compileBatchedN8nWorkflow } from './workflow/batch/compile-batched-n8n-workflow.js';
export type {
  N8nBatchExecutionScope,
  CompileBatchedN8nWorkflowInput,
} from './types/batch-execution.js';
export { describeN8nManualTrigger } from './workflow/entrypoint/manual-trigger.js';
export { selectN8nTemplateDeployments } from './workflow/templates/select-n8n-template-deployments.js';
export { resolveN8nNativeMaterials } from './workflow/resolve-n8n-native-materials.js';
export type {
  ResolveN8nNativeMaterialsInput,
  ResolvedN8nNativeMaterials,
} from './types/native-material-binding.js';
