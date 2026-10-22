import type {
  WorkflowDraftApiEnumChoicesInput,
  WorkflowDraftApiEnumChoicesDescription,
} from '../../../types/workflow-draft-api-enum-selection.js';
import { resolveApiCallArgumentsContext } from './resolve-api-call-arguments-context.js';
import { applyConfirmedApiInputs } from '../../../arguments/clarification/apply-confirmed-api-inputs.js';
import { inspectApiArgumentRequirements } from '../../../arguments/clarification/inspect-api-argument-requirements.js';
import { schemasAtPointer } from '../../../bindings/schema-at-pointer.js';
import { hasPointer } from '../../../bindings/json-pointer.js';
import { createSchemaResourceContext } from '../../../bindings/resources/create-schema-resource-context.js';
import { listApiInputEnumCandidates } from '../../../arguments/enum/list-api-input-enum-candidates.js';

/** Only unresolved original-OAS inputs. Defaults/examples never become choices. */
export function describeWorkflowDraftApiEnumChoices(
  input: WorkflowDraftApiEnumChoicesInput,
): WorkflowDraftApiEnumChoicesDescription {
  const { description, contract } = resolveApiCallArgumentsContext(input);
  const values = applyConfirmedApiInputs({
    callId: description.nodeId,
    operation: description.operation,
    requestMediaType: description.requestMediaType,
    bindings: input.bindingPlan.bindings,
    confirmedInputs: input.confirmedInputs,
    values: contract.valuesSchema.parse(input.proposal.values),
  });
  const inspected = inspectApiArgumentRequirements({
    callId: description.nodeId,
    operation: description.operation,
    requestMediaType: description.requestMediaType,
    bindings: input.bindingPlan.bindings,
    values,
    requestedInputs: input.proposal.requestedInputs,
  });
  const targets = new Set(
    inspected.requirements.flatMap((requirement) => [
      requirement.targetPointer,
      ...(requirement.requestedInputs ?? []),
    ]),
  );
  const candidates: WorkflowDraftApiEnumChoicesDescription['candidates'] = [];
  const choiceTargets: WorkflowDraftApiEnumChoicesDescription['targets'] = [];
  const resources = createSchemaResourceContext(description.requestSchema);
  for (const targetPointer of targets) {
    if (
      hasPointer(values, targetPointer) ||
      input.bindingPlan.bindings.some((binding) =>
        overlaps(binding.targetPointer, targetPointer),
      ) ||
      (input.confirmedInputs ?? []).some((item) =>
        overlaps(item.targetPointer, targetPointer),
      )
    )
      continue;
    const schemas = schemasAtPointer(resources.root, targetPointer, resources);
    const selected = listApiInputEnumCandidates({
      source: {
        kind: 'operation',
        callId: description.nodeId,
        operation: description.operation,
        requestMediaType: description.requestMediaType,
        targetPointer,
      },
      schemas,
      resources,
    });
    if (selected.length) {
      candidates.push(...selected);
      const requirement = inspected.requirements.find(
        (item) =>
          item.targetPointer === targetPointer ||
          item.requestedInputs?.includes(targetPointer),
      );
      choiceTargets.push({
        targetPointer,
        schema: resources.bundle(
          schemas.length === 1 ? schemas[0] : { anyOf: schemas },
        ),
        ...(requirement?.parameterDescription === undefined
          ? {}
          : { description: requirement.parameterDescription }),
      });
    }
  }
  return { candidates, targets: choiceTargets };
}

function overlaps(left: string, right: string): boolean {
  return (
    left === right ||
    left.startsWith(right + '/') ||
    right.startsWith(left + '/')
  );
}
