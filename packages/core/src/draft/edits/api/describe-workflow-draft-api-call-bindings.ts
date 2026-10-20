import { createHash } from 'node:crypto';
import type {
  WorkflowDraftApiCallBindingsInput,
  WorkflowDraftApiCallBindingsDescription,
} from '../../../types/workflow-draft-api-call-planning.js';
import { describeWorkflowDraftApiCallPlanning } from './describe-workflow-draft-api-call-planning.js';
import { resolveWorkflowDraftApiBindingIntent } from './resolve-workflow-draft-api-binding-intent.js';
import { jsonValuesEqual } from '../../../utils/json-values-equal.js';
import { requestBindingSchemas } from '../../../bindings/request-binding-schema.js';

/** A supplied intent is authority only after re-derivation from its original proposal. */
export function describeWorkflowDraftApiCallBindings(
  input: WorkflowDraftApiCallBindingsInput,
): WorkflowDraftApiCallBindingsDescription {
  const description = describeWorkflowDraftApiCallPlanning(input);
  if (input.inputIntent === undefined) return description;
  const inputIntent = resolveWorkflowDraftApiBindingIntent({
    ...input,
    fingerprint: input.inputIntent.fingerprint,
    proposal: input.inputIntent.proposal,
  });
  if (!jsonValuesEqual(inputIntent, input.inputIntent))
    throw new Error(
      'API binding inputIntent differs from its original validated proposal',
    );
  return {
    ...description,
    fingerprint: createHash('sha256')
      .update(
        JSON.stringify({
          planning: description.fingerprint,
          inputIntent,
        }),
      )
      .digest('hex'),
    inputIntent,
    bindingTargets: inputIntent.targets.map((targetPointer) => ({
      targetPointer,
      schemas: requestBindingSchemas(
        {
          callId: description.nodeId,
          operation: description.operation,
          requestMediaType: description.requestMediaType,
        },
        targetPointer,
      ),
    })),
  };
}
