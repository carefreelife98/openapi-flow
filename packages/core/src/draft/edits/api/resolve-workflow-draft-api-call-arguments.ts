import type {
  ResolveWorkflowDraftApiCallArgumentsInput,
  WorkflowDraftApiCallArgumentsResult,
} from '../../../types/workflow-draft-api-call-planning.js';
import { resolveApiCallArgumentsContext } from './resolve-api-call-arguments-context.js';
import { createWorkflowDraftApiCallArgumentsSchema } from '../../../schemas/workflow-draft-api-call-arguments-schema.js';
import { applyConfirmedApiInputs } from '../../../arguments/clarification/apply-confirmed-api-inputs.js';
import { inspectApiArgumentRequirements } from '../../../arguments/clarification/inspect-api-argument-requirements.js';
import { resolveWorkflowDraftSourceEvidence } from '../references/resolve-workflow-draft-source-evidence.js';
import { jsonValuesEqual } from '../../../utils/json-values-equal.js';
import { resolveWorkflowDraftApiLiteralSources } from './resolve-workflow-draft-api-literal-sources.js';
import { resolveWorkflowDraftApiEnumSelections } from './resolve-workflow-draft-api-enum-selections.js';

/** Resolve one actual request; partial values become typed questions/slots, never dummy data. */
export function resolveWorkflowDraftApiCallArguments(
  input: ResolveWorkflowDraftApiCallArgumentsInput,
): WorkflowDraftApiCallArgumentsResult {
  const { description, fingerprint } = resolveApiCallArgumentsContext(input);
  if (input.fingerprint !== fingerprint)
    throw new Error(
      'API call arguments fingerprint is stale or describes different staged materials, bindings or confirmed inputs',
    );
  const proposal = createWorkflowDraftApiCallArgumentsSchema(input).parse(
    input.proposal,
  );
  if (!jsonValuesEqual(proposal, input.proposal))
    throw new Error(
      'API call arguments must validate without defaults, coercion or transformation',
    );
  const literalSources = resolveWorkflowDraftApiLiteralSources({
    description,
    proposal,
  });
  const enums = resolveWorkflowDraftApiEnumSelections({ ...input, proposal });
  const values = applyConfirmedApiInputs({
    callId: description.nodeId,
    operation: description.operation,
    requestMediaType: description.requestMediaType,
    bindings: input.bindingPlan.bindings,
    confirmedInputs: input.confirmedInputs,
    values: enums.values,
  });
  const inspected = inspectApiArgumentRequirements({
    callId: description.nodeId,
    operation: description.operation,
    requestMediaType: description.requestMediaType,
    bindings: input.bindingPlan.bindings,
    values,
    requestedInputs: proposal.requestedInputs,
  });
  const fields = {
    fingerprint,
    proposal,
    literalSources,
    ...(enums.selections.length ? { enumSelections: enums.selections } : {}),
    ...resolveWorkflowDraftSourceEvidence({
      description,
      decision: proposal,
      capabilities: input.context.capabilities,
    }),
    arguments: {
      callId: description.nodeId,
      values,
      ...(proposal.requestedInputs === undefined
        ? {}
        : { requestedInputs: structuredClone(proposal.requestedInputs) }),
      bindings: structuredClone(input.bindingPlan.bindings),
      unresolvedInputs: inspected.requirements.map(
        (item) => item.targetPointer,
      ),
      ...(description.requestMediaType === undefined
        ? {}
        : { requestMediaType: description.requestMediaType }),
    },
    requirements: inspected.requirements,
  };
  if (inspected.status === 'needs-input' && input.allowRuntimeInputs !== true)
    return { ...fields, status: 'needs-input' };
  return {
    ...fields,
    status: 'ready',
    inputMode:
      inspected.status === 'needs-input' ? 'runtime-inputs' : 'provided',
    resolution: {
      stepId: input.stepId,
      kind: 'api-call',
      values: structuredClone(values),
      ...(proposal.requestedInputs === undefined
        ? {}
        : { requestedInputs: structuredClone(proposal.requestedInputs) }),
      bindings: structuredClone(input.bindingPlan.bindings),
      ...(description.requestMediaType === undefined
        ? {}
        : { requestMediaType: description.requestMediaType }),
    },
  };
}
