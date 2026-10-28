import type { ApiBindingMaterial } from '@openapi-flow/core';
import type {
  CreateJsonOutputCapabilityInput,
  N8nNativeCapability,
  NativeItemExecutionOptions,
} from './native-capability.js';
import type { N8nNativeOutputSource } from './output-binding-source.js';

/** Supported OSS feature families, not every built-in node in n8n. */
export const N8nNativeFeature = Object.freeze({
  If: 'if',
  MergeAppend: 'merge-append',
  AssertResponses: 'assert-responses',
  EvaluateResponses: 'evaluate-responses',
  StopAndError: 'stop-and-error',
  PassThrough: 'pass-through',
  RejoinExclusiveBranches: 'rejoin-exclusive-branches',
  JsonOutput: 'json-output',
  SplitApiResponseArray: 'split-api-response-array',
  CollectApiResponses: 'collect-api-responses',
  CollectNativeOutputValues: 'collect-native-output-values',
  ComposeApiResponses: 'compose-api-responses',
  GatherApiResponses: 'gather-api-responses',
  SplitNativeOutputArray: 'split-native-output-array',
  JoinApiItems: 'join-api-items',
  SelectApiResponseMapEntry: 'select-api-response-map-entry',
  JoinApiResponseArraysByKey: 'join-api-response-arrays-by-key',
  ProjectNativeOutput: 'project-native-output',
} as const);

export type N8nNativeFeature =
  (typeof N8nNativeFeature)[keyof typeof N8nNativeFeature];

export interface N8nNativeFeatureContext extends NativeItemExecutionOptions {
  apiMaterials?: ApiBindingMaterial[];
  nativeOutputSources?: N8nNativeOutputSource[];
  /** The host owns the literal producer's name and original typed input contract. */
  jsonOutput?: CreateJsonOutputCapabilityInput;
}

export interface ResolveN8nNativeFeaturesInput extends N8nNativeFeatureContext {
  /** Omitted inventories all families; planning excludes explicit-only legacy families. [] permits none. */
  features?: N8nNativeFeature[];
  /** Explicit host implementations are retained, never inferred or replaced. */
  extensions?: N8nNativeCapability[];
}

export interface ReadyN8nNativeFeature {
  feature: N8nNativeFeature;
  status: 'ready';
  capability: N8nNativeCapability;
}

export interface PendingN8nNativeFeature {
  feature: N8nNativeFeature;
  status: 'requires-context';
  missingContext: N8nNativeFeatureContextRequirement[];
}

export interface N8nNativeArrayContextRequirement {
  field: 'apiMaterials' | 'nativeOutputSources';
  minimumItems: number;
}

export interface N8nNativeJsonOutputContextRequirement {
  field: 'jsonOutput';
}

export type N8nNativeFeatureContextRequirement =
  N8nNativeArrayContextRequirement | N8nNativeJsonOutputContextRequirement;

export type N8nNativeFeatureRegistration =
  ReadyN8nNativeFeature | PendingN8nNativeFeature;

export interface N8nNativeFeatureRegistry {
  registrations: N8nNativeFeatureRegistration[];
  /** Only ready registrations and explicitly supplied extensions. */
  capabilities: N8nNativeCapability[];
}
export interface N8nNativePlanningFeatureRegistry extends N8nNativeFeatureRegistry {
  /** Registered family provenance, separate from arbitrary explicit extensions. */
  planningRegistrations: N8nNativeFeaturePlanningDefinition[];
  /** Stable definitions are selectable, but their outputs/ports still require actual contracts. */
  planningCapabilities: N8nNativeCapability[];
}
export interface N8nNativeFeaturePlanningDefinition {
  feature: N8nNativeFeature;
  capability: N8nNativeCapability;
}

export type N8nNativeFeatureResolutionMode = 'materials' | 'planning';

export interface N8nNativeFeatureDefinition {
  /** Compatibility-only implementations remain available through explicit selection. */
  planningExposure?: 'explicit-only';
  requirements: N8nNativeFeatureContextRequirement[];
  create: (context: N8nNativeFeatureContext) => N8nNativeCapability;
  createPlanning?: (context: NativeItemExecutionOptions) => N8nNativeCapability;
}
