import { z } from 'zod';
import type {
  WorkflowDraftApiCallArgumentsInput,
  WorkflowDraftApiCallArgumentsDescription,
} from '../../../types/workflow-draft-api-call-planning.js';
import { resolveApiCallArgumentsContext } from './resolve-api-call-arguments-context.js';

export function describeWorkflowDraftApiCallArguments(
  input: WorkflowDraftApiCallArgumentsInput,
): WorkflowDraftApiCallArgumentsDescription {
  const { description, contract, fingerprint } =
    resolveApiCallArgumentsContext(input);
  return {
    ...description,
    fingerprint,
    // Source pointers and this schema share the values root, not a metadata wrapper.
    literalInputSchema: z.toJSONSchema(
      contract.valuesSchema,
    ) as WorkflowDraftApiCallArgumentsDescription['literalInputSchema'],
    hasLiteralInputs: contract.hasLiteralInputs,
  };
}
