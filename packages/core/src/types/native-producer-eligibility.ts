import type { WorkflowCapability } from './workflow-plan.js';
import type { WorkflowNativeParameterReference } from './native-parameter-reference.js';

export interface NativeParameterProducerCandidate {
  nodeId: string;
  referenceSources: WorkflowNativeParameterReference['source'][];
}

export interface SelectNativeParameterProducersInput {
  nodeId: string;
  capability: WorkflowCapability;
  producers: NativeParameterProducerCandidate[];
}
