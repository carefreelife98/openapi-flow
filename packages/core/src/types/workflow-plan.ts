import type { z } from 'zod';
import type { ApiOperationContract } from './api-operation.js';
import type { ApiCallArguments, JsonValueObject } from './api-arguments.js';

export interface WorkflowApiMaterial {
  operation: ApiOperationContract;
  arguments: ApiCallArguments;
}

export interface WorkflowResponseReference {
  source: 'response';
  nodeId: string;
  /** RFC 6901 pointer into the API response body, not n8n's envelope. */
  pointer: string;
}

export interface WorkflowCapability {
  name: string;
  description: string;
  parametersSchema: z.ZodType<JsonValueObject>;
  inputPorts: (parameters: JsonValueObject) => string[];
  outputPorts: (parameters: JsonValueObject) => string[];
  responseReferences: (
    parameters: JsonValueObject,
  ) => WorkflowResponseReference[];
  waitsForAllInputs: boolean;
  exclusiveOutputPorts: boolean;
}

export interface PlannedNativeNode {
  id: string;
  capability: string;
  parameters: JsonValueObject;
}

export interface WorkflowPlanEdge {
  from: string;
  output: string;
  to: string;
  input: string;
}

export interface WorkflowPlanGap {
  description: string;
}

export interface WorkflowGraphProposal {
  nativeNodes: PlannedNativeNode[];
  edges: WorkflowPlanEdge[];
  gaps: WorkflowPlanGap[];
}

export interface WorkflowGraphPlan extends WorkflowGraphProposal {
  starts: string[];
}

export interface CreateWorkflowGraphPlanInput {
  proposal: WorkflowGraphProposal;
  materials: WorkflowApiMaterial[];
  capabilities: WorkflowCapability[];
}

export interface ValidateWorkflowGraphPlanInput {
  plan: WorkflowGraphPlan;
  materials: WorkflowApiMaterial[];
  capabilities: WorkflowCapability[];
}

export interface WorkflowRouteState {
  branches: Map<string, string>;
  completed: Set<string>;
}

export interface WorkflowPlanNodeContract {
  id: string;
  inputs: string[];
  outputs: string[];
  references: WorkflowResponseReference[];
  waitsForAllInputs: boolean;
  exclusiveOutputPorts: boolean;
}
