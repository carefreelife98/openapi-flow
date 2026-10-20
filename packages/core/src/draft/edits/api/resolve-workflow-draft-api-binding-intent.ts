import type {
  ResolveWorkflowDraftApiBindingIntentInput,
  WorkflowDraftApiBindingIntent,
} from '../../../types/workflow-draft-api-binding-intent.js';
import { describeWorkflowDraftApiBindingIntent } from './describe-workflow-draft-api-binding-intent.js';
import { createWorkflowDraftApiBindingIntentSchema } from '../../../schemas/workflow-draft-api-binding-intent-schema.js';
import { requestBindingSchemas } from '../../../bindings/request-binding-schema.js';
import { resolveWorkflowDraftSourceEvidence } from '../references/resolve-workflow-draft-source-evidence.js';
import { jsonValuesEqual } from '../../../utils/json-values-equal.js';

export function resolveWorkflowDraftApiBindingIntent(
  input: ResolveWorkflowDraftApiBindingIntentInput,
): WorkflowDraftApiBindingIntent {
  const description = describeWorkflowDraftApiBindingIntent(input);
  if (input.fingerprint !== description.fingerprint)
    throw new Error(
      'API binding intent fingerprint is stale or describes a different request, operation or media contract',
    );
  const proposal = createWorkflowDraftApiBindingIntentSchema(input).parse(
    input.proposal,
  );
  if (!jsonValuesEqual(proposal, input.proposal))
    throw new Error(
      'API binding intent must validate without defaults, coercion or transformation',
    );
  const targets: string[] = [];
  for (const pointer of proposal.targets) {
    if (
      targets.some(
        (target) =>
          target === pointer ||
          target.startsWith(pointer + '/') ||
          pointer.startsWith(target + '/'),
      )
    )
      throw new Error(
        `API binding intent repeats or overlaps a target: ${pointer}`,
      );
    if (
      !requestBindingSchemas(
        {
          callId: input.stepId,
          operation: description.operation,
          requestMediaType: input.requestMediaType,
        },
        pointer,
      ).length
    )
      throw new Error(
        `API binding intent target ${pointer} is not permitted by the selected OAS request`,
      );
    targets.push(pointer);
  }
  return {
    fingerprint: description.fingerprint,
    proposal,
    targets,
    ...resolveWorkflowDraftSourceEvidence({
      description,
      decision: proposal,
      capabilities: [],
    }),
  };
}
