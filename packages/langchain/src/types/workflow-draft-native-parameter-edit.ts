import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  WorkflowDraftNativeParameterEditInput,
  WorkflowDraftNativeParameterEditContractInput,
  WorkflowDraftReferenceSource,
  WorkflowDraftApiReferenceSource,
  ApiOperationContract,
} from '@openapi-flow/core';

export type WorkflowDraftNativeEditApiOperation = Pick<
  ApiOperationContract,
  'method' | 'path'
> &
  Pick<
    ApiOperationContract['operation'],
    'summary' | 'description' | 'responses'
  >;

export interface WorkflowDraftNativeEditApiSource extends Pick<
  WorkflowDraftApiReferenceSource,
  'kind' | 'nodeId' | 'preparation' | 'responsePointerCatalog'
> {
  operation: WorkflowDraftNativeEditApiOperation;
}

export type WorkflowDraftNativeEditSourceCandidate =
  | WorkflowDraftNativeEditApiSource
  | Extract<WorkflowDraftReferenceSource, { kind: 'native' }>;

export interface SelectWorkflowDraftNativeParameterEditTargetsInput extends WorkflowDraftNativeParameterEditInput {
  model: BaseChatModel;
}
export interface GenerateWorkflowDraftNativeParameterEditsInput extends WorkflowDraftNativeParameterEditContractInput {
  /** Required only when selected set targets contain actual values to generate. */
  model?: BaseChatModel;
}
export interface WorkflowDraftNativeParameterEditPlanningFailure {
  stage: 'targets' | 'values';
  output: unknown;
}
