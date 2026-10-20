import type {
  NativeSelectedPlanningInput,
  NativeInstanceSelectionContext,
  SelectedNativeInstance,
  PreparedNativeNodeMaterial,
} from './native-node-planning.js';
import type { NativeOutputContract } from './node-output.js';

export interface NativeInstanceDependencyChoice {
  sourceNodeIds: string[];
  reason?: string;
}

export interface NativeInstanceDependencyProposal {
  sourcesByNodeId: Record<string, NativeInstanceDependencyChoice>;
}

export interface NativeInstanceDependencyContext {
  selectionId: string;
  scenario: string;
  instances: SelectedNativeInstance[];
  capabilities: NativeInstanceSelectionContext['capabilities'];
  apiMaterials: NativeInstanceSelectionContext['apiMaterials'];
  preparedNativeNodes: PreparedNativeNodeMaterial[];
  preparedOutputs: NativeOutputContract[];
  sourceCandidatesByNodeId: Record<string, string[]>;
}

export interface NativeInstanceDependencyPlan {
  id: string;
  selectionId: string;
  context: NativeInstanceDependencyContext;
  proposal: NativeInstanceDependencyProposal;
}

export interface ResolveNativeInstanceDependenciesInput extends NativeSelectedPlanningInput {
  proposal: NativeInstanceDependencyProposal;
}

export interface ValidateNativeInstanceDependenciesInput extends NativeSelectedPlanningInput {
  dependencies: NativeInstanceDependencyPlan;
}

export interface NativeNodeConfigurationDependencies {
  planId: string;
  sourceNodeIds: string[];
}
