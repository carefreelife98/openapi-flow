import { isDeepStrictEqual } from 'node:util';
import type { WorkflowDraftNativeParameterEditContractInput } from '../../../types/workflow-draft-native-parameter-edit.js';
import { workflowDraftNativeParameterEditContractSchema } from '../../../schemas/workflow-draft-native-parameter-edit-schema.js';
import { resolveWorkflowDraftNativeParameterEditTargets } from './resolve-workflow-draft-native-parameter-edit-targets.js';

export function validateWorkflowDraftNativeParameterEditContract(
  input: WorkflowDraftNativeParameterEditContractInput,
): void {
  workflowDraftNativeParameterEditContractSchema.parse(input.contract);
  const expected = resolveWorkflowDraftNativeParameterEditTargets({
    ...input,
    fingerprint: input.contract.fingerprint,
    proposal: {
      decision: {
        status: 'targets',
        targets: input.contract.targets.map(
          ({ kind, pointer, sources, explanation }) => ({
            kind,
            pointer,
            sources,
            ...(explanation === undefined ? {} : { explanation }),
          }),
        ),
      },
    },
  });
  if (
    expected.status !== 'ready' ||
    !isDeepStrictEqual(expected.contract, input.contract)
  )
    throw new Error(
      'Native parameter edit contract is stale or has modified identities, fields or schemas',
    );
}
