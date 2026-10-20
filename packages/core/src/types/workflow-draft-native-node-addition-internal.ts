import type { z } from 'zod';
import type { JsonValueObject } from './api-arguments.js';
import type { WorkflowCapability } from './workflow-plan.js';
import type { WorkflowDraftNativeNodeAdditionDescription } from './workflow-draft-native-node-addition.js';
import type { StagedWorkflowDraftEdit } from './workflow-draft-edit-assembly.js';
import type { WorkflowDraftReferenceSources } from './workflow-draft-reference-sources.js';
import type { MissingWorkflowNativeMaterialRequirement } from './native-material-snapshot.js';
import type { NativeNodeConfigurationDependencies } from './native-instance-dependencies.js';
import type { WorkflowDraftNativeDependencyRole } from './workflow-draft-native-dependencies.js';

export interface WorkflowDraftNativeAdditionMaterials {
  stage: StagedWorkflowDraftEdit;
  nodeId: string;
  instruction: string;
  definition: WorkflowCapability;
  sources: WorkflowDraftReferenceSources;
  missingContext: MissingWorkflowNativeMaterialRequirement[];
  pendingSourceNodeIds: string[];
  sourceDependencies?: NativeNodeConfigurationDependencies;
  plannedNativeRoles?: WorkflowDraftNativeDependencyRole[];
}

export interface WorkflowDraftNativeNodeAdditionContext {
  description: WorkflowDraftNativeNodeAdditionDescription;
  capability: WorkflowCapability;
  parametersSchema: z.ZodType<JsonValueObject>;
}
