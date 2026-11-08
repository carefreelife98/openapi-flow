import type {
  WorkflowExecutionProgramSource,
  WorkflowExecutionProgramDescription,
  WorkflowExecutionBlock,
} from '../workflow-execution-program.js';
import type {
  WorkflowConnectionSessionDescription,
  WorkflowConnectionSessionSource,
} from '../workflow-connection-session.js';
import type {
  WorkflowPlanNodeContract,
  WorkflowPlanEdge,
  PlannedNativeNode,
} from '../workflow-plan.js';
export interface WorkflowProgramEndpoint {
  nodeId: string;
  output: string;
}
export interface WorkflowProgramFlow {
  exits: WorkflowProgramEndpoint[];
  reachable: boolean;
}
export interface WorkflowProgramCompilerState {
  contracts: Map<string, WorkflowPlanNodeContract>;
  visited: Set<string>;
  roots: string[];
  edges: WorkflowPlanEdge[];
  generated: PlannedNativeNode[];
}
export interface WorkflowProgramCompilerInput {
  source: WorkflowExecutionProgramSource;
  description: WorkflowExecutionProgramDescription;
  body: WorkflowExecutionBlock;
}
/** Runtime-only prepared view; canonical source data remains owned by the host revision. */
export interface WorkflowProgramPreparation {
  materialSource: WorkflowConnectionSessionSource;
  materialDescription: WorkflowConnectionSessionDescription;
  source: WorkflowExecutionProgramSource;
  description: WorkflowExecutionProgramDescription;
}

export interface WorkflowProgramSourceCapture {
  description: WorkflowExecutionProgramDescription;
  connection: WorkflowConnectionSessionDescription;
}
