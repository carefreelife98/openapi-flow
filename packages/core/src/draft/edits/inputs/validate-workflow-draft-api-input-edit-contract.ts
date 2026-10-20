import { isDeepStrictEqual } from 'node:util';
import type { WorkflowDraftApiInputEditContractInput } from '../../../types/workflow-draft-api-input-edit.js';
import { createWorkflowDraftApiInputEditContract } from './create-workflow-draft-api-input-edit-contract.js';
import { workflowDraftApiInputEditContractSchema } from '../../../schemas/workflow-draft-api-input-edit-contract-schema.js';

export function validateWorkflowDraftApiInputEditContract(
  input: WorkflowDraftApiInputEditContractInput,
): void {
  const envelope = workflowDraftApiInputEditContractSchema.safeParse(
    input.contract,
  );
  if (!envelope.success)
    throw new Error(
      'API input edit contract has invalid metadata or target fields',
      { cause: envelope.error },
    );
  const expected = createWorkflowDraftApiInputEditContract({
    ...input,
    proposal: {
      targets: input.contract.targets.map((target) => ({
        kind: target.kind,
        pointer: target.pointer,
        sources: target.sources,
        ...(target.explanation === undefined
          ? {}
          : { explanation: target.explanation }),
      })),
    },
  });
  if (!isDeepStrictEqual(expected, input.contract))
    throw new Error(
      'API input edit contract is stale or has modified identities, fields or schemas',
    );
}
