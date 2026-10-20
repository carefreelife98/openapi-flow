import {
  describeWorkflowDraftApiCallPlanning,
  resolveWorkflowDraftApiCallBindings,
} from '@openapi-flow/core';
import {
  nativeParameterEditFixture,
  nativeParameterModel,
} from './workflow-draft-native-parameter-edit-fixture.mjs';
import { connectionEditPlan } from './workflow-draft-connection-edit-fixture.mjs';
import { apiLiteralSourceSelections } from './api-literal-source-selections.mjs';

export async function apiCallPlanningFixture(
  kind = 'add-api-call',
  operationName = 'replacement',
  includeExplanations = false,
  explicitValues,
) {
  const input = await nativeParameterEditFixture(
    'Add a separate API call. Use the source response value as its id. Keep existing values, bindings, native settings and unrelated routes unchanged.' +
      (explicitValues === undefined
        ? ''
        : ` Explicit fixture inputs: ${JSON.stringify(explicitValues)}.`),
  );
  const decision = {
    kind,
    operation: input[operationName].key,
    ...(kind === 'replace-api-operation' ? { nodeId: 'independent' } : {}),
  };
  const plan = connectionEditPlan(input, [decision], includeExplanations);
  return { ...input, plan, stepId: plan.steps[0].id, resolutions: [] };
}
export function apiCallEvidence(input) {
  return {
    sourceMessageIds: input.requestMessageIds,
    ...(input.plan.options.includeExplanations
      ? {
          explanation: {
            reason:
              'The current request explicitly selects this mapping or value for the selected operation.',
            evidence: input.requestMessageIds.map((messageId) => ({
              kind: 'message',
              messageId,
            })),
          },
        }
      : {}),
  };
}
export function apiCallBindingProposal(input, mappings = []) {
  const description = describeWorkflowDraftApiCallPlanning(input);
  const mappingsField =
    description.hasRequestInputs && description.sources.values.length
      ? { mappings }
      : {};
  if (!Object.hasOwn(mappingsField, 'mappings') && mappings.length)
    throw new Error(
      'Fixture cannot omit supplied mappings when no mapping output is allowed',
    );
  return {
    decision: {
      status: 'provided',
      ...mappingsField,
      ...apiCallEvidence(input),
    },
  };
}
export const sourceIdMapping = {
  targetPointer: '/path/id',
  sourceNodeId: 'source',
  sourcePointer: '/value',
};
export function apiCallBindingPlan(input, mappings = [sourceIdMapping]) {
  return resolveWorkflowDraftApiCallBindings({
    ...input,
    fingerprint: describeWorkflowDraftApiCallPlanning(input).fingerprint,
    proposal: apiCallBindingProposal(input, mappings),
  });
}
export function apiCallArgumentsProposal(input, values = {}) {
  return {
    values,
    ...(Object.keys(values).length
      ? {
          literalSources: apiLiteralSourceSelections(
            values,
            input.requestMessageIds[0],
          ),
        }
      : {}),
    ...apiCallEvidence(input),
  };
}
export const apiCallPlanningModel = nativeParameterModel;
