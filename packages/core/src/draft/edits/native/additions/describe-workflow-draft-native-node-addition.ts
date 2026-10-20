import type {
  WorkflowDraftNativeNodeAdditionInput,
  WorkflowDraftNativeNodeAdditionDescription,
} from '../../../../types/workflow-draft-native-node-addition.js';
import { resolveNativeNodeAdditionContext } from './resolve-native-node-addition-context.js';

export function describeWorkflowDraftNativeNodeAddition(
  input: WorkflowDraftNativeNodeAdditionInput,
): WorkflowDraftNativeNodeAdditionDescription {
  return resolveNativeNodeAdditionContext(input).description;
}
